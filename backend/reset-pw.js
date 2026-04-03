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

  const user = items.find(i => i.email === 'traudichbox@googlemail.com' && i.entityType === 'TRAINING_USER');
  if (!user) { console.log('User nicht gefunden'); return; }

  const hash = await bcrypt.hash('Dormagen2026!', 10);
  await doc.send(new PutCommand({ TableName: 'ClubApp', Item: { ...user, password: hash, passwordChangeRequired: false } }));
  console.log('PW gesetzt für', user.email);
}
main().catch(console.error);
