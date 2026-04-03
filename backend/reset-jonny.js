const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');
const bcrypt = require('bcryptjs');
const client = new DynamoDBClient({ region: 'eu-central-1' });
const doc = DynamoDBDocumentClient.from(client);

async function main() {
  const items = [];
  let lastKey;
  do {
    const r = await doc.send(new ScanCommand({ TableName: 'ClubApp', ExclusiveStartKey: lastKey }));
    items.push(...(r.Items || []));
    lastKey = r.LastEvaluatedKey;
  } while (lastKey);

  const user = items.find(i => i.id === '16502223' && i.entityType === 'TRAINING_USER');
  if (!user) { console.log('User nicht gefunden'); return; }

  console.log('Gefunden:', user.email);
  const hash = await bcrypt.hash('Dormagen2026!', 10);
  await doc.send(new PutCommand({ TableName: 'ClubApp', Item: { ...user, password: hash, passwordChangeRequired: true } }));
  console.log('PW auf Dormagen2026! gesetzt, passwordChangeRequired=true');
}
main().catch(console.error);
