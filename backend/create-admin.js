/**
 * Erstellt den ersten Admin-Benutzer für das Hallenplatz-Training-System.
 * 
 * Verwendung:
 *   node create-admin.js <email> <passwort> <vorname> <name>
 * 
 * Beispiel:
 *   node create-admin.js admin@tennis.de MeinPasswort123 Max Mustermann
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const TABLE_NAME = 'ClubApp';

async function createAdmin() {
  const [,, email, password, vorname, name] = process.argv;

  if (!email || !password || !vorname || !name) {
    console.error('Verwendung: node create-admin.js <email> <passwort> <vorname> <name>');
    process.exit(1);
  }

  const client = new DynamoDBClient({ region: 'eu-central-1' });
  const docClient = DynamoDBDocumentClient.from(client);

  const id = uuidv4();
  const now = new Date().toISOString();
  const emailLower = email.toLowerCase();
  const hashedPassword = await bcrypt.hash(password, 10);

  // Spieler-Datensatz
  await docClient.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: {
      PK: `TRAINING_SPIELER#${id}`, SK: 'METADATA',
      GSI1PK: `TRAINING_EMAIL#${emailLower}`, GSI1SK: 'TRAINING_SPIELER',
      id, name, vorname, email: emailLower,
      rolle: 'admin', aktiv: true,
      createdAt: now, updatedAt: now,
      entityType: 'TRAINING_SPIELER',
    },
  }));

  // User-Datensatz (Auth)
  await docClient.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: {
      PK: `TRAINING_USER#${id}`, SK: 'AUTH',
      GSI1PK: `TRAINING_EMAIL#${emailLower}`, GSI1SK: 'TRAINING_USER',
      id, email: emailLower, password: hashedPassword,
      rolle: 'admin', passwordChangeRequired: false, aktiv: true,
      createdAt: now, updatedAt: now,
      entityType: 'TRAINING_USER',
    },
  }));

  console.log(`Admin erstellt: ${vorname} ${name} (${emailLower})`);
  console.log(`ID: ${id}`);
}

createAdmin().catch(console.error);
