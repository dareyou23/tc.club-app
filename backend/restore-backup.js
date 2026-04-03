const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { unmarshall } = require('@aws-sdk/util-dynamodb');
const fs = require('fs');

const client = new DynamoDBClient({ region: 'eu-central-1' });
const doc = DynamoDBDocumentClient.from(client, { marshallOptions: { removeUndefinedValues: true } });

async function main() {
  const data = JSON.parse(fs.readFileSync('clubapp-backup.json', 'utf8'));
  const items = data.Items.map(i => unmarshall(i));
  console.log(`${items.length} Items zu importieren...`);
  let ok = 0;
  for (const item of items) {
    await doc.send(new PutCommand({ TableName: 'ClubApp', Item: item }));
    ok++;
    if (ok % 50 === 0) process.stdout.write(`${ok}...`);
  }
  console.log(`\n${ok} Items importiert`);
}
main().catch(console.error);
