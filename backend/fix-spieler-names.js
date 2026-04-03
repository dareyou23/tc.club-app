const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({ region: 'eu-central-1' });
const docClient = DynamoDBDocumentClient.from(client);
const TABLE = 'TennisTrainingsRunden';

async function main() {
  // Alle TRAINING_SPIELER laden
  const result = await docClient.send(new ScanCommand({
    TableName: TABLE,
    FilterExpression: 'entityType = :t',
    ExpressionAttributeValues: { ':t': 'TRAINING_SPIELER' },
  }));

  let fixed = 0;
  for (const item of result.Items) {
    const fullName = item.name;
    const vorname = item.vorname;
    
    // Wenn name den vollen Namen enthält (Vorname + Nachname), nur Nachname behalten
    if (fullName && vorname && fullName.startsWith(vorname + ' ')) {
      const nachname = fullName.substring(vorname.length + 1);
      
      await docClient.send(new UpdateCommand({
        TableName: TABLE,
        Key: { PK: item.PK, SK: item.SK },
        UpdateExpression: 'SET #n = :nachname',
        ExpressionAttributeNames: { '#n': 'name' },
        ExpressionAttributeValues: { ':nachname': nachname },
      }));
      
      fixed++;
      console.log(`${vorname} "${fullName}" → name: "${nachname}"`);
    }
    
    // Fix Markus "Training" → "Wages"
    if (item.email === 'markus@training.de' && fullName === 'Training') {
      await docClient.send(new UpdateCommand({
        TableName: TABLE,
        Key: { PK: item.PK, SK: item.SK },
        UpdateExpression: 'SET #n = :nachname, vorname = :vorname',
        ExpressionAttributeNames: { '#n': 'name' },
        ExpressionAttributeValues: { ':nachname': 'Wages', ':vorname': 'Markus' },
      }));
      fixed++;
      console.log(`Markus "Training" → name: "Wages", vorname: "Markus"`);
    }
    
    // Fix Admin "Admin" → keep as is but set vorname
    if (item.email === 'admin@training.de' && fullName === 'Admin') {
      await docClient.send(new UpdateCommand({
        TableName: TABLE,
        Key: { PK: item.PK, SK: item.SK },
        UpdateExpression: 'SET vorname = :vorname',
        ExpressionAttributeValues: { ':vorname': 'Admin' },
      }));
      console.log(`Admin: vorname gesetzt`);
    }
  }
  
  console.log(`\n${fixed} Spieler korrigiert.`);
}

main().catch(console.error);
