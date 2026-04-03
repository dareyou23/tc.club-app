import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { successResponse, errorResponse } from '../utils/response';
import { getItem, putItem, queryItems, deleteItem } from '../utils/dynamodb';

export async function anmelden(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const userId = event.requestContext.authorizer?.userId;
    if (!userId) return errorResponse('Nicht autorisiert', 401);

    const slotId = event.pathParameters?.slotId;
    if (!slotId) return errorResponse('Slot ID erforderlich');

    const slot = await getItem(`TRAINING_SLOT#${slotId}`, 'METADATA');
    if (!slot) return errorResponse('Slot nicht gefunden', 404);
    if (slot.buchungsmodus !== 'spontan_anmeldung') {
      return errorResponse('Spontan-Anmeldung nur für Modus B');
    }

    const today = new Date().toISOString().split('T')[0];
    if ((slot.datum as string) < today) {
      return errorResponse('Anmeldung für vergangene Slots nicht möglich');
    }

    // Check capacity
    const platz = await getItem(`TRAINING_PLATZ#${slot.platzId}`, 'METADATA');
    const anmeldungen = await queryItems(`TRAINING_SLOT#${slotId}`, 'ANMELDUNG#');
    if (anmeldungen.length >= (platz?.aktiverPlatz as number || 2)) {
      return errorResponse('Slot ist bereits voll');
    }

    const halbeBeteiligung = event.path.endsWith('/halb');
    const spieler = await getItem(`TRAINING_SPIELER#${userId}`, 'METADATA');
    const now = new Date().toISOString();

    await putItem({
      PK: `TRAINING_SLOT#${slotId}`, SK: `ANMELDUNG#${userId}`,
      slotId, spielerId: userId,
      spielerName: spieler ? `${spieler.vorname} ${spieler.name}` : userId,
      halbeBeteiligung, angemeldetAm: now,
      entityType: 'TRAINING_ANMELDUNG',
    });

    return successResponse({ message: 'Angemeldet', halbeBeteiligung });
  } catch (error) {
    console.error('Anmelden error:', error);
    return errorResponse('Internal server error', 500);
  }
}

export async function abmelden(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const userId = event.requestContext.authorizer?.userId;
    if (!userId) return errorResponse('Nicht autorisiert', 401);

    const slotId = event.pathParameters?.slotId;
    if (!slotId) return errorResponse('Slot ID erforderlich');

    await deleteItem(`TRAINING_SLOT#${slotId}`, `ANMELDUNG#${userId}`);
    return successResponse({ message: 'Abgemeldet' });
  } catch (error) {
    console.error('Abmelden error:', error);
    return errorResponse('Internal server error', 500);
  }
}

export async function getAnmeldungen(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const slotId = event.pathParameters?.slotId;
    if (!slotId) return errorResponse('Slot ID erforderlich');

    const items = await queryItems(`TRAINING_SLOT#${slotId}`, 'ANMELDUNG#');
    return successResponse(items);
  } catch (error) {
    console.error('Get anmeldungen error:', error);
    return errorResponse('Internal server error', 500);
  }
}
