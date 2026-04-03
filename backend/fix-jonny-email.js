const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');
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

  const newEmail = '16502223@tc.de';
  const gsi = 'TRAINING_EMAIL#' + newEmail;

  for (const item of items) {
    if (item.id === '16502223' && (item.entityType === 'TRAINING_SPIELER' || item.entityType === 'TRAINING_USER')) {
      await doc.send(new PutCommand({ TableName: 'ClubApp', Item: { ...item, email: newEmail, GSI1PK: gsi } }));
      console.log(item.entityType, '→', newEmail);
    }
  }
}
main().catch(console.error);
