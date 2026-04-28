/**
 * Scheduled Lambda: Synchronisiert M4-Verfügbarkeiten aus MedenSaison → ClubApp
 * Läuft alle 15 Minuten, liest MedenSaison-Tabelle und schreibt in ClubApp-Tabelle.
 * Temporär, solange die MedenSaison-App parallel zur ClubApp läuft.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, QueryCommand, PutCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const doc = DynamoDBDocumentClient.from(client);

const MEDEN_TABLE = 'MedenSaison';
const CLUB_TABLE = process.env.TABLE_NAME || 'ClubApp';

// Spieltag-Mapping: MedenSaison ID → ClubApp Datum (M4)
const SPIELTAG_MAP = [
  { medenId: 'st1', datum: '2026-05-02' },
  { medenId: 'st2', datum: '2026-05-16' },
  { medenId: 'st3', datum: '2026-06-13' },
  { medenId: 'st4', datum: '2026-06-27' },
  { medenId: 'st5', datum: '2026-09-05' },
];

function mapStatus(medenStatus: string): string {
  if (medenStatus === 'unsicher') return 'vielleicht';
  return medenStatus; // ja, nein, "" bleiben gleich
}

export async function handler(): Promise<void> {
  console.log('MedenSync: Start');

  // 1. Spieler-Mapping aufbauen: MedenSaison spielerId → ClubApp Verbands-ID (über Name)
  const medenSpieler = await doc.send(new ScanCommand({
    TableName: MEDEN_TABLE,
    FilterExpression: 'entityType = :t',
    ExpressionAttributeValues: { ':t': 'SPIELER' },
  }));
  const clubSpieler = await doc.send(new ScanCommand({
    TableName: CLUB_TABLE,
    FilterExpression: 'entityType = :t',
    ExpressionAttributeValues: { ':t': 'TRAINING_SPIELER' },
  }));

  // MedenSaison spielerId → normalisierter Name
  const medenIdToName = new Map<string, string>();
  for (const s of medenSpieler.Items || []) {
    medenIdToName.set(s.spielerId as string, (s.name as string).toLowerCase().trim());
  }

  // ClubApp Name → Verbands-ID
  const clubNameToId = new Map<string, string>();
  for (const s of clubSpieler.Items || []) {
    const name = `${s.vorname} ${s.name}`.toLowerCase().trim();
    clubNameToId.set(name, s.id as string);
  }

  // 2. ClubApp M4-Spieltage laden
  const clubSt = await doc.send(new ScanCommand({
    TableName: CLUB_TABLE,
    FilterExpression: 'entityType = :t AND mannschaft = :m',
    ExpressionAttributeValues: { ':t': 'MEDEN_SPIELTAG', ':m': 4 },
  }));
  const clubByDatum = new Map<string, Record<string, unknown>>();
  for (const st of clubSt.Items || []) {
    clubByDatum.set(st.datum as string, st);
  }

  let synced = 0;
  const now = new Date().toISOString();

  // 3. Pro Spieltag: Verfügbarkeiten lesen und schreiben
  for (const mapping of SPIELTAG_MAP) {
    const clubSpieltag = clubByDatum.get(mapping.datum);
    if (!clubSpieltag) continue;
    const clubId = clubSpieltag.id as string;

    // MedenSaison Verfügbarkeiten lesen
    const medenVerf = await doc.send(new QueryCommand({
      TableName: MEDEN_TABLE,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `SPIELTAG#${mapping.medenId}`,
        ':sk': 'VERFUEGBARKEIT#',
      },
    }));

    for (const item of medenVerf.Items || []) {
      const medenSpielerId = item.spielerId as string;
      const medenName = medenIdToName.get(medenSpielerId);
      if (!medenName) continue;

      const clubSpielerId = clubNameToId.get(medenName);
      if (!clubSpielerId) continue;

      const status = mapStatus(item.status as string);
      if (!status) continue;

      await doc.send(new PutCommand({
        TableName: CLUB_TABLE,
        Item: {
          PK: `MEDEN_SPIELTAG#${clubId}`,
          SK: `VERFUEGBARKEIT#${clubSpielerId}`,
          GSI1PK: `MEDEN_SPIELER#${clubSpielerId}`,
          GSI1SK: `VERFUEGBARKEIT#${clubId}`,
          spieltagId: clubId,
          spielerId: clubSpielerId,
          status,
          entityType: 'MEDEN_VERFUEGBARKEIT',
          updatedAt: now,
          syncedFrom: 'MedenSaison',
        },
      }));
      synced++;
    }
  }

  console.log(`MedenSync: ${synced} Verfügbarkeiten synchronisiert`);
}
