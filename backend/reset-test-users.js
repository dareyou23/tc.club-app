/**
 * Reset Test-User: PW auf Dormagen2026!, passwordChangeRequired=true,
 * lastLogin löschen, Email auf {id}@tc.de zurücksetzen.
 * Verfügbarkeiten der Spieler für Meden-Spieltage löschen (nur die manuell gesetzten).
 */
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, PutCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const bcrypt = require('bcryptjs');
const client = new DynamoDBClient({ region: 'eu-central-1' });
const doc = DynamoDBDocumentClient.from(client);
const TABLE = 'ClubApp';

// Spieler die komplett zurückgesetzt werden (PW, Email, lastLogin, Verfügbarkeiten)
const FULL_RESET = [
  { id: '16502859', name: 'Peter Keutmann' },
  { id: '17601724', name: 'Sebastian Zinkler' },
  { id: '16502223', name: 'Jonny Bartel' },
];

// Spieler bei denen nur lastLogin gelöscht wird
const LOGON_ONLY = [
  { id: '16502238', name: 'Bernd Brinkmann' },
];

async function main() {
  const items = [];
  let lastKey;
  do {
    const r = await doc.send(new ScanCommand({ TableName: TABLE, ExclusiveStartKey: lastKey }));
    items.push(...(r.Items || []));
    lastKey = r.LastEvaluatedKey;
  } while (lastKey);

  const hash = await bcrypt.hash('Dormagen2026!', 10);

  // Full Reset
  for (const s of FULL_RESET) {
    const email = s.id + '@tc.de';
    const gsi = 'TRAINING_EMAIL#' + email;

    // User: PW reset, lastLogin löschen, email zurück
    const user = items.find(i => i.id === s.id && i.entityType === 'TRAINING_USER');
    if (user) {
      const { lastLogin, ...rest } = user;
      await doc.send(new PutCommand({ TableName: TABLE, Item: {
        ...rest, email, GSI1PK: gsi, password: hash, passwordChangeRequired: true,
      }}));
      console.log(`✓ ${s.name} USER: PW reset, email=${email}, lastLogin gelöscht`);
    }

    // Spieler: email zurück
    const spieler = items.find(i => i.id === s.id && i.entityType === 'TRAINING_SPIELER');
    if (spieler) {
      await doc.send(new PutCommand({ TableName: TABLE, Item: {
        ...spieler, email, GSI1PK: gsi,
      }}));
      console.log(`✓ ${s.name} SPIELER: email=${email}`);
    }

    // Meden-Verfügbarkeiten löschen (nur die manuell gesetzten, nicht migrierte)
    const verfs = items.filter(i =>
      i.entityType === 'MEDEN_VERFUEGBARKEIT' && i.spielerId === s.id
    );
    for (const v of verfs) {
      await doc.send(new DeleteCommand({ TableName: TABLE, Key: { PK: v.PK, SK: v.SK } }));
    }
    if (verfs.length > 0) console.log(`✓ ${s.name}: ${verfs.length} Meden-Verfügbarkeiten gelöscht`);
  }

  // Logon-Only Reset
  for (const s of LOGON_ONLY) {
    const user = items.find(i => i.id === s.id && i.entityType === 'TRAINING_USER');
    if (user && user.lastLogin) {
      const { lastLogin, ...rest } = user;
      await doc.send(new PutCommand({ TableName: TABLE, Item: rest }));
      console.log(`✓ ${s.name}: lastLogin gelöscht`);
    } else {
      console.log(`  ${s.name}: kein lastLogin vorhanden`);
    }
  }

  console.log('\nFertig.');
}
main().catch(console.error);
