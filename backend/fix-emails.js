const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
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
  console.log(`${items.length} Items gelesen`);

  let updated = 0;
  for (const item of items) {
    if (!item.email || !item.id) continue;
    if (!item.email.endsWith('@import.local') && !item.email.endsWith('@training.de')) continue;
    const newEmail = item.id + '@tc.de';
    await doc.send(new UpdateCommand({
      TableName: 'ClubApp',
      Key: { PK: item.PK, SK: item.SK },
      UpdateExpression: 'SET email = :e, GSI1PK = :g',
      ExpressionAttributeValues: { ':e': newEmail, ':g': 'TRAINING_EMAIL#' + newEmail },
    }));
    updated++;
    console.log(`  ${item.id} → ${newEmail}`);
  }
  console.log(`\n${updated} aktualisiert`);
}
main().catch(console.error);
