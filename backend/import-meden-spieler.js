const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { randomUUID } = require('crypto');
const bcrypt = require('bcryptjs');

const client = new DynamoDBClient({ region: 'eu-central-1' });
const docClient = DynamoDBDocumentClient.from(client);
const TABLE = 'TennisTrainingsRunden';

async function getMedenSpieler() {
  const result = await docClient.send(new ScanCommand({
    TableName: 'MedenSaison',
    FilterExpression: 'entityType = :t',
    ExpressionAttributeValues: { ':t': 'SPIELER' },
  }));
  return result.Items;
}

function generateEmail(vorname, nachname, usedEmails) {
  const v = vorname.toLowerCase().replace(/[äöüß]/g, m => ({ 'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'ß': 'ss' }[m]));
  const n = nachname.charAt(0).toLowerCase();
  let base = `${v}-${n}`;
  let email = `${base}@training.de`;
  
  if (!usedEmails.has(email)) {
    usedEmails.add(email);
    return email;
  }
  
  // Bei Duplikaten: Ziffer anhängen
  let counter = 2;
  while (usedEmails.has(`${base}${counter}@training.de`)) {
    counter++;
  }
  email = `${base}${counter}@training.de`;
  usedEmails.add(email);
  return email;
}

async function main() {
  const spieler = await getMedenSpieler();
  console.log(`${spieler.length} Spieler aus MedenSaison geladen`);
  
  const usedEmails = new Set(['admin@training.de', 'markus@training.de']);
  const now = new Date().toISOString();
  const defaultPassword = await bcrypt.hash('Training2026!', 10);
  
  // Markus Wages überspringen (ist schon drin)
  const filtered = spieler.filter(s => s.name !== 'Markus Wages');
  console.log(`${filtered.length} Spieler zu importieren (Markus Wages übersprungen)`);
  
  let count = 0;
  for (const s of filtered) {
    const nameParts = s.name.split(' ');
    const vorname = nameParts[0];
    // Nachname: alles nach dem ersten Wort (für "Hans-Walter Buckels", "Holger von der Linden" etc.)
    const nachname = nameParts[nameParts.length - 1];
    
    const id = randomUUID();
    const email = generateEmail(vorname, nachname, usedEmails);
    
    // SPIELER-Eintrag
    await docClient.send(new PutCommand({
      TableName: TABLE,
      Item: {
        PK: `TRAINING_SPIELER#${id}`,
        SK: 'METADATA',
        GSI1PK: `TRAINING_EMAIL#${email}`,
        GSI1SK: 'TRAINING_SPIELER',
        id,
        entityType: 'TRAINING_SPIELER',
        name: s.name,
        vorname,
        email,
        rolle: 'spieler',
        aktiv: true,
        mannschaft: s.kern ? 'Herren 50 - 4' : null,
        lk: s.lk,
        createdAt: now,
        updatedAt: now,
      },
    }));
    
    // USER-Eintrag (Auth)
    await docClient.send(new PutCommand({
      TableName: TABLE,
      Item: {
        PK: `TRAINING_USER#${id}`,
        SK: 'AUTH',
        GSI1PK: `TRAINING_EMAIL#${email}`,
        GSI1SK: 'TRAINING_USER',
        id,
        entityType: 'TRAINING_USER',
        email,
        password: defaultPassword,
        rolle: 'spieler',
        aktiv: true,
        passwordChangeRequired: true,
        createdAt: now,
        updatedAt: now,
      },
    }));
    
    count++;
    console.log(`${count}. ${s.name} → ${email}`);
  }
  
  console.log(`\nFertig! ${count} Spieler importiert.`);
}

main().catch(console.error);
