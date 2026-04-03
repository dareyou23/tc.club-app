// Einmal-Script: Setzt passwordChangeRequired=true bei allen TRAINING_USERs (außer Admin)
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({ region: 'eu-central-1' });
const docClient = DynamoDBDocumentClient.from(client);
const TABLE = 'TennisTrainingsRunden';

async function main() {
  const result = await docClient.send(new ScanCommand({
    TableName: TABLE,
    FilterExpression: 'entityType = :t',
    ExpressionAttributeValues: { ':t': 'TRAINING_USER' },
  }));

  const users = result.Items || [];
  console.log(`${users.length} User gefunden`);

  let updated = 0;
  for (const user of users) {
    // Admin überspringen
    if (user.rolle === 'admin') {
      console.log(`  SKIP (admin): ${user.email}`);
      continue;
    }

    await docClient.send(new UpdateCommand({
      TableName: TABLE,
      Key: { PK: user.PK, SK: user.SK },
      UpdateExpression: 'SET passwordChangeRequired = :v',
      ExpressionAttributeValues: { ':v': true },
    }));
    updated++;
    console.log(`  ✓ ${user.email}`);
  }

  console.log(`\n${updated} User auf passwordChangeRequired=true gesetzt`);
}

main().catch(console.error);
