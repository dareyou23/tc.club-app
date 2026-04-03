import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { successResponse, errorResponse } from '../utils/response';
import { getItem, putItem, queryItems, queryGSI2 } from '../utils/dynamodb';

export async function getSlotVerfuegbarkeit(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const slotId = event.pathParameters?.slotId;
    if (!slotId) return errorResponse('Slot ID erforderlich');

    const items = await queryItems(`TRAINING_SLOT#${slotId}`, 'VERFUEGBAR#');
    return successResponse(items);
  } catch (error) {
    console.error('Get verfuegbarkeit error:', error);
    return errorResponse('Internal server error', 500);
  }
}

export async function setVerfuegbarkeit(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const userId = event.requestContext.authorizer?.userId;
    if (!userId) return errorResponse('Nicht autorisiert', 401);

    const slotId = event.pathParameters?.slotId;
    if (!slotId || !event.body) return errorResponse('Slot ID und Body erforderlich');

    const { status } = JSON.parse(event.body);
    if (status !== 'verfuegbar' && status !== 'nicht_verfuegbar' && status !== 'keine_angabe') {
      return errorResponse('Status muss verfuegbar, nicht_verfuegbar oder keine_angabe sein');
    }

    // Check slot exists and is in the future
    const slot = await getItem(`TRAINING_SLOT#${slotId}`, 'METADATA');
    if (!slot) return errorResponse('Slot nicht gefunden', 404);

    const today = new Date().toISOString().split('T')[0];
    if ((slot.datum as string) < today) {
      return errorResponse('Verfügbarkeit für vergangene Slots kann nicht geändert werden');
    }

    const now = new Date().toISOString();
    const spieler = await getItem(`TRAINING_SPIELER#${userId}`, 'METADATA');
    const spielerName = spieler ? `${spieler.vorname} ${spieler.name}` : userId;

    await putItem({
      PK: `TRAINING_SLOT#${slotId}`,
      SK: `VERFUEGBAR#${userId}`,
      GSI2PK: `TRAINING_SPIELER_VERF#${userId}`,
      GSI2SK: slot.datum as string,
      slotId, spielerId: userId, spielerName, status,
      updatedAt: now,
      entityType: 'TRAINING_VERFUEGBARKEIT',
    });

    return successResponse({ slotId, status });
  } catch (error) {
    console.error('Set verfuegbarkeit error:', error);
    return errorResponse('Internal server error', 500);
  }
}
