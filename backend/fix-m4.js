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

  let updated = 0;
  for (const item of items) {
    if (item.entityType === 'MEDEN_SPIELTAG' && !item.mannschaft) {
      await doc.send(new UpdateCommand({
        TableName: 'ClubApp',
        Key: { PK: item.PK, SK: item.SK },
        UpdateExpression: 'SET mannschaft = :m',
        ExpressionAttributeValues: { ':m': 4 },
      }));
      console.log('Nr.' + item.nr + ' → M4');
      updated++;
    }
  }
  console.log(updated + ' aktualisiert');
}
main().catch(console.error);
