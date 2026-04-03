const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');
const bcrypt = require('bcryptjs');
const client = new DynamoDBClient({ region: 'eu-central-1' });
const doc = DynamoDBDocumentClient.from(client);

const email = process.argv[2];
const pw = process.argv[3];

async function main() {
  if (!email || !pw) {
    console.log('Usage: node reset-pw-generic.js <email> <password>');
    console.log('Beide Parameter sind Pflicht.');
    process.exit(1);
  }

  const items = [];
  let lastKey;
  do {
    const r = await doc.send(new ScanCommand({ TableName: 'ClubApp', ExclusiveStartKey: lastKey }));
    items.push(...(r.Items || []));
    lastKey = r.LastEvaluatedKey;
  } while (lastKey);

  const user = items.find(i => i.email === email && i.entityType === 'TRAINING_USER');
  if (!user) { console.log('User nicht gefunden:', email); process.exit(1); }

  const hash = await bcrypt.hash(pw, 10);
  await doc.send(new PutCommand({ TableName: 'ClubApp', Item: { ...user, password: hash, passwordChangeRequired: true } }));
  console.log('PW gesetzt für', email, '(passwordChangeRequired=true)');
}
main().catch(console.error);
