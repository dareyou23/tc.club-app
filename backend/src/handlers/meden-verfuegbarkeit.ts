import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { z } from 'zod';
import { successResponse, errorResponse } from '../utils/response';
import { putItem } from '../utils/dynamodb';
import { isAuthenticated, getSpielerIdFromEvent } from '../utils/auth-helpers';

const SetVerfuegbarkeitSchema = z.object({
  spieltagId: z.string().min(1),
  status: z.enum(['ja', 'nein', 'vielleicht', '']),
});

// POST /meden/verfuegbarkeit — eigene Verfügbarkeit setzen
export async function setMedenVerfuegbarkeit(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    if (!isAuthenticated(event)) return errorResponse('Nicht autorisiert', 403);

    if (!event.body) return errorResponse('Request body required');
    const body = SetVerfuegbarkeitSchema.parse(JSON.parse(event.body));
    const spielerId = getSpielerIdFromEvent(event);
    if (!spielerId) return errorResponse('Spieler-ID nicht gefunden', 403);

    const now = new Date().toISOString();

    await putItem({
      PK: `MEDEN_SPIELTAG#${body.spieltagId}`,
      SK: `VERFUEGBARKEIT#${spielerId}`,
      GSI1PK: `MEDEN_SPIELER#${spielerId}`,
      GSI1SK: `VERFUEGBARKEIT#${body.spieltagId}`,
      spieltagId: body.spieltagId,
      spielerId,
      status: body.status,
      entityType: 'MEDEN_VERFUEGBARKEIT',
      updatedAt: now,
    });

    return successResponse({ spieltagId: body.spieltagId, spielerId, status: body.status });
  } catch (error) {
    console.error('Set meden verfuegbarkeit error:', error);
    return errorResponse('Internal server error', 500);
  }
}
