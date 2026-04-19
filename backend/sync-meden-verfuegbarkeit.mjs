/**
 * Sync: Verfügbarkeiten der 4. Mannschaft aus MedenSaison → ClubApp
 * 
 * Liest Verfügbarkeiten aus der MedenSaison-Tabelle (Spieltage st1-st5)
 * und schreibt sie in die ClubApp-Tabelle (MEDEN_SPIELTAG#... Format).
 *
 * Usage: node sync-meden-verfuegbarkeit.mjs
 *
 * Mapping:
 *   MedenSaison: PK=SPIELTAG#st1, SK=VERFUEGBARKEIT#<spielerId>
 *   ClubApp:     PK=MEDEN_SPIELTAG#<uuid>, SK=VERFUEGBARKEIT#<spielerId>
 *
 * Verfügbarkeits-Status-Mapping:
 *   MedenSaison: ja, nein, unsicher, ""
 *   ClubApp:     ja, nein, vielleicht, ""
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, QueryCommand, PutCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({ region: 'eu-central-1' });
const doc = DynamoDBDocumentClient.from(client, { marshallOptions: { removeUndefinedValues: true } });

const MEDEN_TABLE = 'MedenSaison';
const CLUB_TABLE = 'ClubApp';

// Mapping: MedenSaison spieltagId → ClubApp Datum (für Matching)
// Die ClubApp hat UUIDs als IDs, MedenSaison hat st1-st5
const SPIELTAG_MAPPING = [
  { medenId: 'st1', datum: '2026-05-02' },
  { medenId: 'st2', datum: '2026-05-16' },
  { medenId: 'st3', datum: '2026-06-13' },
  { medenId: 'st4', datum: '2026-06-27' },
  { medenId: 'st5', datum: '2026-09-05' },
];

// Status-Mapping
function mapStatus(medenStatus) {
  if (medenStatus === 'unsicher') return 'vielleicht';
  return medenStatus; // ja, nein, "" bleiben gleich
}

async function main() {
  console.log('=== Sync: MedenSaison → ClubApp (M4 Verfügbarkeiten) ===\n');

  // 1. ClubApp Spieltage laden um UUIDs zu finden
  const clubSpieltage = await doc.send(new ScanCommand({
    TableName: CLUB_TABLE,
    FilterExpression: 'entityType = :t AND mannschaft = :m',
    ExpressionAttributeValues: { ':t': 'MEDEN_SPIELTAG', ':m': 4 },
  }));

  const clubByDatum = new Map();
  for (const st of clubSpieltage.Items || []) {
    clubByDatum.set(st.datum, st);
  }

  let synced = 0, skipped = 0;

  for (const mapping of SPIELTAG_MAPPING) {
    const clubSpieltag = clubByDatum.get(mapping.datum);
    if (!clubSpieltag) {
      console.log(`  ⚠ ${mapping.datum} — kein M4-Spieltag in ClubApp gefunden, überspringe`);
      continue;
    }

    const clubId = clubSpieltag.id;
    console.log(`  ${mapping.datum} (${mapping.medenId} → ${clubId})`);

    // 2. Verfügbarkeiten aus MedenSaison lesen
    const medenVerf = await doc.send(new QueryCommand({
      TableName: MEDEN_TABLE,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `SPIELTAG#${mapping.medenId}`,
        ':sk': 'VERFUEGBARKEIT#',
      },
    }));

    const items = medenVerf.Items || [];
    if (!items.length) {
      console.log(`    Keine Verfügbarkeiten in MedenSaison`);
      continue;
    }

    for (const item of items) {
      const spielerId = item.spielerId;
      const status = mapStatus(item.status);
      const now = new Date().toISOString();

      if (!status) { skipped++; continue; } // Leerer Status = keine Angabe

      await doc.send(new PutCommand({
        TableName: CLUB_TABLE,
        Item: {
          PK: `MEDEN_SPIELTAG#${clubId}`,
          SK: `VERFUEGBARKEIT#${spielerId}`,
          GSI1PK: `MEDEN_SPIELER#${spielerId}`,
          GSI1SK: `VERFUEGBARKEIT#${clubId}`,
          spieltagId: clubId,
          spielerId,
          status,
          entityType: 'MEDEN_VERFUEGBARKEIT',
          updatedAt: now,
          syncedFrom: 'MedenSaison',
        },
      }));
      synced++;
    }
    console.log(`    ${items.length} Einträge gelesen, ${items.filter(i => i.status).length} synchronisiert`);
  }

  console.log(`\n=== Fertig: ${synced} synchronisiert, ${skipped} übersprungen (leer) ===`);
}

main().catch(e => { console.error('FEHLER:', e); process.exit(1); });
