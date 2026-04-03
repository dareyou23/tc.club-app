import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { successResponse, errorResponse } from '../utils/response';
import { queryItems, putItem } from '../utils/dynamodb';
import { isAuthenticated } from '../utils/auth-helpers';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, TABLE_NAME } from '../utils/dynamodb';

// GET /meden/spieltage — alle Meden-Spieltage
export async function listMedenSpieltage(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    if (!isAuthenticated(event)) return errorResponse('Nicht autorisiert', 403);

    const result = await docClient.send(new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: 'entityType = :type',
      ExpressionAttributeValues: { ':type': 'MEDEN_SPIELTAG' },
    }));

    const spieltage = (result.Items || [])
      .sort((a, b) => (a.datum as string).localeCompare(b.datum as string));

    return successResponse(spieltage);
  } catch (error) {
    console.error('List meden spieltage error:', error);
    return errorResponse('Internal server error', 500);
  }
}

// GET /meden/verfuegbarkeit/alle — alle Verfügbarkeiten aller Spieltage
export async function getAllMedenVerfuegbarkeit(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    if (!isAuthenticated(event)) return errorResponse('Nicht autorisiert', 403);

    // Spieltage laden
    const stResult = await docClient.send(new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: 'entityType = :type',
      ExpressionAttributeValues: { ':type': 'MEDEN_SPIELTAG' },
    }));
    const spieltage = stResult.Items || [];

    // Pro Spieltag Verfügbarkeiten laden
    const result: Record<string, Record<string, string>> = {};
    for (const st of spieltage) {
      const items = await queryItems(`MEDEN_SPIELTAG#${st.id}`, 'VERFUEGBARKEIT#');
      result[st.id as string] = {};
      for (const item of items) {
        result[st.id as string][item.spielerId as string] = item.status as string;
      }
    }

    return successResponse(result);
  } catch (error) {
    console.error('Get all meden verfuegbarkeit error:', error);
    return errorResponse('Internal server error', 500);
  }
}
