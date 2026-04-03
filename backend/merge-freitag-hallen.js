// Merge: Halle 1 + Halle 2 Freitag → ein Platz "Halle 1/2 Freitag 20:00"
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, DeleteCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { v4: uuidv4 } = require('uuid');

const client = new DynamoDBClient({ region: 'eu-central-1' });
const docClient = DynamoDBDocumentClient.from(client);
const TABLE = 'TennisTrainingsRunden';

const SAISON_ID = '7c8d9193-6874-40ac-94f9-b9352fcdc158';
const SAISON_START = '2025-09-26';
const SAISON_END = '2026-04-30';
const HALLE1_ID = 'bc18fc8e-ee7e-4026-8197-7101b771eb7f';
const HALLE2_ID = '22cc4324-28fc-4c46-9a2b-7d112b951318';

async function deleteAllForPlatz(platzId) {
  // Delete slots
  const slots = await docClient.send(new QueryCommand({
    TableName: TABLE, IndexName: 'GSI1',
    KeyConditionExpression: 'GSI1PK = :pk AND begins_with(GSI1SK, :sk)',
    ExpressionAttributeValues: { ':pk': `TRAINING_PLATZ#${platzId}`, ':sk': 'TRAINING_SLOT#' },
  }));
  for (const s of slots.Items || []) {
    await docClient.send(new DeleteCommand({ TableName: TABLE, Key: { PK: s.PK, SK: s.SK } }));
  }
  // Delete gruppe members
  const gruppe = await docClient.send(new QueryCommand({
    TableName: TABLE,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    ExpressionAttributeValues: { ':pk': `TRAINING_PLATZ#${platzId}`, ':sk': 'GRUPPE#' },
  }));
  for (const g of gruppe.Items || []) {
    await docClient.send(new DeleteCommand({ TableName: TABLE, Key: { PK: g.PK, SK: g.SK } }));
  }
  // Delete platz
  await docClient.send(new DeleteCommand({
    TableName: TABLE, Key: { PK: `TRAINING_PLATZ#${platzId}`, SK: 'METADATA' },
  }));
}

async function main() {
  const now = new Date().toISOString();

  // 1. Delete Halle 1 + Halle 2
  console.log('Lösche Halle 1...');
  await deleteAllForPlatz(HALLE1_ID);
  console.log('Lösche Halle 2...');
  await deleteAllForPlatz(HALLE2_ID);

  // 2. Neuen kombinierten Platz anlegen
  const newId = uuidv4();
  console.log(`Lege Halle 1/2 Freitag 20:00 an (ID: ${newId})...`);

  await docClient.send(new PutCommand({ TableName: TABLE, Item: {
    PK: `TRAINING_PLATZ#${newId}`, SK: 'METADATA',
    GSI1PK: `TRAINING_SAISON#${SAISON_ID}`,
    GSI1SK: `TRAINING_PLATZ#4#20:00`,
    id: newId, saisonId: SAISON_ID,
    name: 'Halle 1/2 Freitag 20:00',
    wochentag: 4, uhrzeit: '20:00', uhrzeitBis: '22:00', dauer: 120,
    ort: 'Halle 1/2', hallengebuehr: 0, trainerkosten: null,
    buchungsmodus: 'faire_verteilung', platzTyp: 'training',
    nurHallentraining: false, aktiverPlatz: 4, gruppengroesse: 10,
    anzahlPlaetze: 2, // Marker: 2 Courts
    createdAt: now, updatedAt: now, entityType: 'TRAINING_PLATZ',
  }}));

  // 3. Slots generieren (Freitag = Wochentag 4, JS Freitag = 5)
  const start = new Date(SAISON_START);
  const end = new Date(SAISON_END);
  const current = new Date(start);
  while (current.getDay() !== 5) current.setDate(current.getDate() + 1);

  let count = 0;
  while (current <= end) {
    const slotId = uuidv4();
    const datum = current.toISOString().split('T')[0];
    await docClient.send(new PutCommand({ TableName: TABLE, Item: {
      PK: `TRAINING_SLOT#${slotId}`, SK: 'METADATA',
      GSI1PK: `TRAINING_PLATZ#${newId}`, GSI1SK: `TRAINING_SLOT#${datum}`,
      GSI2PK: `TRAINING_SAISON_SLOTS#${SAISON_ID}`, GSI2SK: `${datum}#${newId}`,
      id: slotId, platzId: newId, saisonId: SAISON_ID,
      datum, wochentag: 4, uhrzeit: '20:00', dauer: 120,
      hallengebuehr: 0, trainerkosten: null,
      status: 'offen', buchungsmodus: 'faire_verteilung',
      platzTyp: 'training', anzahlPlaetze: 2,
      createdAt: now, updatedAt: now, entityType: 'TRAINING_SLOT',
    }}));
    count++;
    current.setDate(current.getDate() + 7);
  }

  console.log(`${count} Slots generiert`);
  console.log('Fertig!');
}

main().catch(console.error);
