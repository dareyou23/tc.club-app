/**
 * Migration: Spieltage + Verfügbarkeiten aus MedenSaison → ClubApp.
 * Nur LESEN aus MedenSaison, nichts ändern.
 *
 * Spieler-Matching: MedenSaison "Vorname Nachname" → ClubApp Verbands-ID
 * Spieltage: neue IDs, in ClubApp-Format (TRAINING_* Prefix nicht nötig,
 *   aber wir nutzen ein eigenes MEDEN_* Prefix um Konflikte zu vermeiden)
 * Status-Mapping: unsicher → vielleicht
 *
 * Usage: node migrate-meden.js
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { v4: uuid } = require('uuid');

const client = new DynamoDBClient({ region: 'eu-central-1' });
const doc = DynamoDBDocumentClient.from(client, { marshallOptions: { removeUndefinedValues: true } });

const SOURCE = 'MedenSaison';
const TARGET = 'ClubApp';

async function scanAll(table) {
  const items = [];
  let lastKey;
  do {
    const r = await doc.send(new ScanCommand({ TableName: table, ExclusiveStartKey: lastKey }));
    items.push(...(r.Items || []));
    lastKey = r.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

// Sonderfälle Name-Matching
const NAME_ALIASES = {
  'Stefan Reitenberger': 'Stefan Reiterberger',
  'Johannes Thoenissen': 'Johannes Thönneßen',
};

function normName(fullName) {
  if (NAME_ALIASES[fullName]) return NAME_ALIASES[fullName];
  return fullName;
}

async function main() {
  console.log('=== Meden-Migration: MedenSaison → ClubApp ===\n');

  // 1. Quell-Daten lesen
  const srcItems = await scanAll(SOURCE);
  const srcSpieler = srcItems.filter(i => i.entityType === 'SPIELER');
  const srcSpieltage = srcItems.filter(i => i.entityType === 'SPIELTAG');
  const srcVerf = srcItems.filter(i => i.entityType === 'VERFUEGBARKEIT');
  console.log(`MedenSaison: ${srcSpieler.length} Spieler, ${srcSpieltage.length} Spieltage, ${srcVerf.length} Verfügbarkeiten`);

  // 2. ClubApp-Spieler lesen → Name → Verbands-ID
  const tgtItems = await scanAll(TARGET);
  const tgtSpieler = tgtItems.filter(i => i.entityType === 'TRAINING_SPIELER');

  // "Vorname Nachname" → Verbands-ID
  const nameToId = new Map();
  for (const s of tgtSpieler) {
    nameToId.set(`${s.vorname} ${s.name}`, s.id);
  }

  // 3. MedenSaison spielerId → Name → Verbands-ID
  const medenIdToVerbandsId = new Map();
  let matchOk = 0, matchFail = 0;
  for (const s of srcSpieler) {
    const name = normName(s.name);
    const verbandsId = nameToId.get(name);
    if (verbandsId) {
      medenIdToVerbandsId.set(s.spielerId, verbandsId);
      matchOk++;
    } else {
      console.log(`  ⚠ Kein Match: "${s.name}" (${s.spielerId})`);
      matchFail++;
    }
  }
  console.log(`Spieler-Match: ${matchOk} ok, ${matchFail} ohne Match\n`);

  // 4. Spieltage migrieren (neue IDs)
  const spieltagIdMap = new Map(); // alte ID → neue ID
  const now = new Date().toISOString();
  console.log('Spieltage:');
  for (const st of srcSpieltage) {
    const newId = uuid();
    spieltagIdMap.set(st.spieltagId, newId);
    const gegner = st.heim ? st.gastmannschaft : st.heimmannschaft;

    await doc.send(new PutCommand({
      TableName: TARGET,
      Item: {
        PK: `MEDEN_SPIELTAG#${newId}`, SK: 'METADATA',
        id: newId, datum: st.datum, uhrzeit: st.uhrzeit, nr: st.nr,
        gegner, heimspiel: st.heim || false,
        heimmannschaft: st.heimmannschaft, gastmannschaft: st.gastmannschaft,
        entityType: 'MEDEN_SPIELTAG',
        createdAt: now, updatedAt: now,
      },
    }));
    console.log(`  ✓ Nr.${st.nr} ${st.datum} ${st.heim ? '🏠' : '🚗'} vs ${gegner}`);
  }

  // 5. Verfügbarkeiten migrieren
  console.log('\nVerfügbarkeiten:');
  let verfOk = 0, verfSkip = 0;
  for (const v of srcVerf) {
    const spielerId = medenIdToVerbandsId.get(v.spielerId);
    const spieltagId = spieltagIdMap.get(v.spieltagId);
    if (!spielerId || !spieltagId) { verfSkip++; continue; }

    const status = v.status === 'unsicher' ? 'vielleicht' : v.status;

    await doc.send(new PutCommand({
      TableName: TARGET,
      Item: {
        PK: `MEDEN_SPIELTAG#${spieltagId}`, SK: `VERFUEGBARKEIT#${spielerId}`,
        GSI1PK: `MEDEN_SPIELER#${spielerId}`, GSI1SK: `VERFUEGBARKEIT#${spieltagId}`,
        spielerId, spieltagId, status,
        entityType: 'MEDEN_VERFUEGBARKEIT',
        updatedAt: v.updatedAt || now,
      },
    }));
    verfOk++;
  }
  console.log(`  ${verfOk} migriert, ${verfSkip} übersprungen (kein Match)`);

  console.log(`\n=== Fertig ===`);
}

main().catch(console.error);
