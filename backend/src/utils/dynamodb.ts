import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, DeleteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
export const docClient = DynamoDBDocumentClient.from(client);
export const TABLE_NAME = process.env.TABLE_NAME || 'TennisTrainingsRunden';

export async function getItem(PK: string, SK: string) {
  const result = await docClient.send(new GetCommand({ TableName: TABLE_NAME, Key: { PK, SK } }));
  return result.Item;
}

export async function putItem(item: Record<string, unknown>) {
  await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));
  return item;
}

export async function queryItems(PK: string, SKPrefix?: string) {
  const result = await docClient.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: SKPrefix ? 'PK = :pk AND begins_with(SK, :sk)' : 'PK = :pk',
    ExpressionAttributeValues: SKPrefix ? { ':pk': PK, ':sk': SKPrefix } : { ':pk': PK },
  }));
  return result.Items || [];
}

export async function queryGSI1(GSI1PK: string, GSI1SKPrefix?: string) {
  const result = await docClient.send(new QueryCommand({
    TableName: TABLE_NAME,
    IndexName: 'GSI1',
    KeyConditionExpression: GSI1SKPrefix
      ? 'GSI1PK = :pk AND begins_with(GSI1SK, :sk)'
      : 'GSI1PK = :pk',
    ExpressionAttributeValues: GSI1SKPrefix ? { ':pk': GSI1PK, ':sk': GSI1SKPrefix } : { ':pk': GSI1PK },
  }));
  return result.Items || [];
}

export async function queryGSI2(GSI2PK: string, GSI2SKPrefix?: string) {
  const result = await docClient.send(new QueryCommand({
    TableName: TABLE_NAME,
    IndexName: 'GSI2',
    KeyConditionExpression: GSI2SKPrefix
      ? 'GSI2PK = :pk AND begins_with(GSI2SK, :sk)'
      : 'GSI2PK = :pk',
    ExpressionAttributeValues: GSI2SKPrefix ? { ':pk': GSI2PK, ':sk': GSI2SKPrefix } : { ':pk': GSI2PK },
  }));
  return result.Items || [];
}

export async function queryGSI2Between(GSI2PK: string, startSK: string, endSK: string) {
  const result = await docClient.send(new QueryCommand({
    TableName: TABLE_NAME,
    IndexName: 'GSI2',
    KeyConditionExpression: 'GSI2PK = :pk AND GSI2SK BETWEEN :start AND :end',
    ExpressionAttributeValues: { ':pk': GSI2PK, ':start': startSK, ':end': endSK },
  }));
  return result.Items || [];
}

export async function deleteItem(PK: string, SK: string) {
  await docClient.send(new DeleteCommand({ TableName: TABLE_NAME, Key: { PK, SK } }));
}

export async function updateItemField(PK: string, SK: string, field: string, value: unknown) {
  await docClient.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { PK, SK },
    UpdateExpression: `SET #field = :val, updatedAt = :now`,
    ExpressionAttributeNames: { '#field': field },
    ExpressionAttributeValues: { ':val': value, ':now': new Date().toISOString() },
  }));
}
