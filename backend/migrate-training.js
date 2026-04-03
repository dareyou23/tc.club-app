/**
 * Migration: Trainings-Daten (Saisons, Plätze, Slots, Buchungsgruppen,
 * Zuweisungen, Verfügbarkeiten, Benachrichtigungen) von
 * TennisTrainingsRunden → ClubApp.
 *
 * Spieler-IDs werden von UUIDs auf Verbands-IDs gemappt.
 * Items die keine Spieler-Referenz haben werden 1:1 kopiert.
 *
 * Usage: node migrate-training.js
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({ region: 'eu-central-1' });
const doc = DynamoDBDocumentClient.from(client, { marshallOptions: { removeUndefinedValues: true } });

const SOURCE = 'TennisTrainingsRunden';
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

async function main() {
  console.log('=== Trainings-Migration: TennisTrainingsRunden → ClubApp ===\n');

  // 1. Alle Items aus Quelle lesen
  const srcItems = await scanAll(SOURCE);
  console.log(`Quelle: ${srcItems.length} Items`);

  // 2. Spieler-ID-Mapping aufbauen: alte UUID → neue Verbands-ID
  // Quelle: TennisTrainingsRunden Spieler (UUID + Name)
  // Ziel: ClubApp Spieler (Verbands-ID + Name)
  const srcSpieler = srcItems.filter(i => i.entityType === 'TRAINING_SPIELER');
  const tgtItems = await scanAll(TARGET);
  const tgtSpieler = tgtItems.filter(i => i.entityType === 'TRAINING_SPIELER');

  // Map: "Vorname Nachname" → Verbands-ID (aus ClubApp)
  const nameToNewId = new Map();
  for (const s of tgtSpieler) {
    nameToNewId.set(`${s.vorname} ${s.name}`, s.id);
  }

  // Map: alte UUID → neue Verbands-ID
  const idMap = new Map();
  let mapOk = 0, mapFail = 0;
  for (const s of srcSpieler) {
    if (s.rolle === 'admin' && s.name === 'Admin') continue;
    const key = `${s.vorname} ${s.name}`;
    const newId = nameToNewId.get(key);
    if (newId) {
      idMap.set(s.id, newId);
      mapOk++;
    } else {
      console.log(`  ⚠ Kein Match: ${key} (${s.id})`);
      mapFail++;
    }
  }
  console.log(`ID-Mapping: ${mapOk} ok, ${mapFail} ohne Match\n`);

  // 3. Nicht-Spieler/User Items migrieren
  const skip = new Set(['TRAINING_SPIELER', 'TRAINING_USER']);
  const toMigrate = srcItems.filter(i => !skip.has(i.entityType));
  console.log(`Zu migrieren: ${toMigrate.length} Items\n`);

  let migrated = 0, skipped = 0;
  for (const item of toMigrate) {
    // Spieler-IDs in PK/SK/GSI remappen
    const newItem = { ...item };
    for (const key of ['PK', 'SK', 'GSI1PK', 'GSI1SK', 'GSI2PK', 'GSI2SK']) {
      if (newItem[key] && typeof newItem[key] === 'string') {
        for (const [oldId, newId] of idMap) {
          newItem[key] = newItem[key].replace(oldId, newId);
        }
      }
    }
    // Spieler-ID Felder remappen
    if (newItem.spielerId && idMap.has(newItem.spielerId)) {
      newItem.spielerId = idMap.get(newItem.spielerId);
    }
    if (newItem.erstelltVon && idMap.has(newItem.erstelltVon)) {
      newItem.erstelltVon = idMap.get(newItem.erstelltVon);
    }

    try {
      await doc.send(new PutCommand({ TableName: TARGET, Item: newItem }));
      migrated++;
    } catch (err) {
      console.error(`  ✗ ${item.PK} ${item.SK}: ${err.message}`);
      skipped++;
    }
  }

  console.log(`\n=== Fertig: ${migrated} migriert, ${skipped} übersprungen ===`);
}

main().catch(console.error);
