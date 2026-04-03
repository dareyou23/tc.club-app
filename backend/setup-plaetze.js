// Setup: Freitags-Training Halle 1+2 anlegen + Mittwoch als Saisonplanung markieren
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, UpdateCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { v4: uuidv4 } = require('uuid');

const client = new DynamoDBClient({ region: 'eu-central-1' });
const docClient = DynamoDBDocumentClient.from(client);
const TABLE = 'TennisTrainingsRunden';

const SAISON_ID = '7c8d9193-6874-40ac-94f9-b9352fcdc158'; // Winter 2025/2026
const SAISON_START = '2025-09-26';
const SAISON_END = '2026-04-30';
const MITTWOCH_PLATZ_ID = '8ddf5cf9-629c-4f9a-8f9a-7ccdad3f5229';

async function put(item) {
  await docClient.send(new PutCommand({ TableName: TABLE, Item: item }));
}

// Freitag = Wochentag 4 (0=Mo)
// JS: Freitag = 5
function generateSlots(platzId, platz) {
  const start = new Date(SAISON_START);
  const end = new Date(SAISON_END);
  const jsWochentag = (platz.wochentag + 1) % 7; // 0=Mo → JS 0=So
  
  const current = new Date(start);
  while (current.getDay() !== jsWochentag) {
    current.setDate(current.getDate() + 1);
  }

  const slots = [];
  const now = new Date().toISOString();
  while (current <= end) {
    const slotId = uuidv4();
    const datum = current.toISOString().split('T')[0];
    slots.push({
      PK: `TRAINING_SLOT#${slotId}`, SK: 'METADATA',
      GSI1PK: `TRAINING_PLATZ#${platzId}`,
      GSI1SK: `TRAINING_SLOT#${datum}`,
      GSI2PK: `TRAINING_SAISON_SLOTS#${SAISON_ID}`,
      GSI2SK: `${datum}#${platzId}`,
      id: slotId, platzId, saisonId: SAISON_ID,
      datum, wochentag: platz.wochentag, uhrzeit: platz.uhrzeit,
      dauer: platz.dauer, hallengebuehr: platz.hallengebuehr,
      trainerkosten: platz.trainerkosten,
      status: 'offen', buchungsmodus: platz.buchungsmodus,
      platzTyp: platz.platzTyp || 'training',
      createdAt: now, updatedAt: now,
      entityType: 'TRAINING_SLOT',
    });
    current.setDate(current.getDate() + 7);
  }
  return slots;
}

async function main() {
  const now = new Date().toISOString();

  // 1. Mittwoch 20:00 als Saisonplanung markieren
  console.log('Markiere Mittwoch 20:00 als Saisonplanung...');
  await docClient.send(new UpdateCommand({
    TableName: TABLE,
    Key: { PK: `TRAINING_PLATZ#${MITTWOCH_PLATZ_ID}`, SK: 'METADATA' },
    UpdateExpression: 'SET platzTyp = :typ, updatedAt = :now',
    ExpressionAttributeValues: { ':typ': 'saisonplanung', ':now': now },
  }));
  
  // Auch die Mittwoch-Slots als saisonplanung markieren
  const mittwochSlots = await docClient.send(new QueryCommand({
    TableName: TABLE,
    IndexName: 'GSI1',
    KeyConditionExpression: 'GSI1PK = :pk AND begins_with(GSI1SK, :sk)',
    ExpressionAttributeValues: {
      ':pk': `TRAINING_PLATZ#${MITTWOCH_PLATZ_ID}`,
      ':sk': 'TRAINING_SLOT#',
    },
  }));
  for (const slot of mittwochSlots.Items || []) {
    await docClient.send(new UpdateCommand({
      TableName: TABLE,
      Key: { PK: slot.PK, SK: slot.SK },
      UpdateExpression: 'SET platzTyp = :typ',
      ExpressionAttributeValues: { ':typ': 'saisonplanung' },
    }));
  }
  console.log(`  ${(mittwochSlots.Items || []).length} Mittwoch-Slots als Saisonplanung markiert`);

  // 2. Freitag Halle 1 anlegen (20:00-22:00)
  const halle1Id = uuidv4();
  const halle1 = {
    wochentag: 4, uhrzeit: '20:00', uhrzeitBis: '22:00', dauer: 120,
    hallengebuehr: 0, trainerkosten: null, buchungsmodus: 'faire_verteilung',
    platzTyp: 'training',
  };
  console.log('Lege Freitag Halle 1 an...');
  await put({
    PK: `TRAINING_PLATZ#${halle1Id}`, SK: 'METADATA',
    GSI1PK: `TRAINING_SAISON#${SAISON_ID}`,
    GSI1SK: `TRAINING_PLATZ#${halle1.wochentag}#${halle1.uhrzeit}`,
    id: halle1Id, saisonId: SAISON_ID,
    name: 'Halle 1 Freitag 20:00',
    ...halle1,
    ort: 'Halle 1',
    nurHallentraining: false,
    aktiverPlatz: 4, gruppengroesse: 10,
    createdAt: now, updatedAt: now,
    entityType: 'TRAINING_PLATZ',
  });
  const slots1 = generateSlots(halle1Id, halle1);
  for (const s of slots1) await put(s);
  console.log(`  Halle 1: ${slots1.length} Slots generiert (ID: ${halle1Id})`);

  // 3. Freitag Halle 2 anlegen (20:00-22:00)
  const halle2Id = uuidv4();
  const halle2 = { ...halle1 };
  console.log('Lege Freitag Halle 2 an...');
  await put({
    PK: `TRAINING_PLATZ#${halle2Id}`, SK: 'METADATA',
    GSI1PK: `TRAINING_SAISON#${SAISON_ID}`,
    GSI1SK: `TRAINING_PLATZ#${halle2.wochentag}#${halle2.uhrzeit}#2`,
    id: halle2Id, saisonId: SAISON_ID,
    name: 'Halle 2 Freitag 20:00',
    ...halle2,
    ort: 'Halle 2',
    nurHallentraining: false,
    aktiverPlatz: 4, gruppengroesse: 10,
    createdAt: now, updatedAt: now,
    entityType: 'TRAINING_PLATZ',
  });
  const slots2 = generateSlots(halle2Id, halle2);
  for (const s of slots2) await put(s);
  console.log(`  Halle 2: ${slots2.length} Slots generiert (ID: ${halle2Id})`);

  console.log('\nFertig!');
}

main().catch(console.error);
