import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { successResponse, errorResponse } from '../utils/response';
import { queryItems, queryGSI1, putItem, getItem } from '../utils/dynamodb';
import { z } from 'zod';

export async function getBenachrichtigungen(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const userId = event.requestContext.authorizer?.userId;
    if (!userId) return errorResponse('Nicht autorisiert', 401);

    const items = await queryItems(`TRAINING_BENACHRICHTIGUNG#${userId}`);
    // Sort newest first
    items.sort((a, b) => (b.createdAt as string).localeCompare(a.createdAt as string));
    return successResponse(items.slice(0, 50));
  } catch (error) {
    console.error('Get benachrichtigungen error:', error);
    return errorResponse('Internal server error', 500);
  }
}

export async function markAsGelesen(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const userId = event.requestContext.authorizer?.userId;
    if (!userId) return errorResponse('Nicht autorisiert', 401);

    const { sk } = JSON.parse(event.body || '{}');
    if (!sk) return errorResponse('SK erforderlich');

    const item = await getItem(`TRAINING_BENACHRICHTIGUNG#${userId}`, sk);
    if (!item) return errorResponse('Benachrichtigung nicht gefunden', 404);

    await putItem({ ...item, gelesen: true, GSI1PK: undefined, GSI1SK: undefined });
    return successResponse({ message: 'Als gelesen markiert' });
  } catch (error) {
    console.error('Mark as gelesen error:', error);
    return errorResponse('Internal server error', 500);
  }
}

export async function getUnreadCount(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const userId = event.requestContext.authorizer?.userId;
    if (!userId) return errorResponse('Nicht autorisiert', 401);

    const items = await queryGSI1(`TRAINING_BENACHRICHTIGUNG_UNGELESEN#${userId}`);
    return successResponse({ count: items.length });
  } catch (error) {
    console.error('Get unread count error:', error);
    return errorResponse('Internal server error', 500);
  }
}

const SendSchema = z.object({
  platzId: z.string().min(1),
  titel: z.string().min(1).max(200),
  nachricht: z.string().min(1).max(2000),
});

export async function sendNachricht(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const userId = event.requestContext.authorizer?.userId;
    const rolle = event.requestContext.authorizer?.rolle;
    if (!userId) return errorResponse('Nicht autorisiert', 401);
    if (rolle !== 'admin' && rolle !== 'trainings_verwalter') {
      return errorResponse('Nur Verwalter/Admin dürfen Nachrichten senden', 403);
    }

    const body = SendSchema.parse(JSON.parse(event.body || '{}'));

    // Platz laden um Spieler zu finden
    const platz = await getItem(`TRAINING_PLATZ#${body.platzId}`, 'METADATA');
    if (!platz) return errorResponse('Platz nicht gefunden', 404);

    const spielerIds: string[] = (platz.spielerIds as string[]) || [];
    if (spielerIds.length === 0) return errorResponse('Keine Spieler in dieser Trainingsrunde');

    const now = new Date().toISOString();
    const platzName = (platz.name as string) || 'Training';

    for (const sid of spielerIds) {
      await putItem({
        PK: `TRAINING_BENACHRICHTIGUNG#${sid}`,
        SK: `${now}#nachricht#${body.platzId}`,
        GSI1PK: `TRAINING_BENACHRICHTIGUNG_UNGELESEN#${sid}`,
        GSI1SK: now,
        spielerId: sid,
        typ: 'nachricht',
        titel: `📢 ${body.titel}`,
        nachricht: `[${platzName}] ${body.nachricht}`,
        gelesen: false,
        createdAt: now,
        entityType: 'TRAINING_BENACHRICHTIGUNG',
      });
    }

    return successResponse({ message: `Nachricht an ${spielerIds.length} Spieler gesendet` });
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse('Ungültige Eingabe', 400);
    console.error('Send nachricht error:', error);
    return errorResponse('Internal server error', 500);
  }
}
