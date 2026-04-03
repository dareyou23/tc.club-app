import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { successResponse, errorResponse } from '../utils/response';
import { queryItems, queryGSI1, queryGSI2 } from '../utils/dynamodb';

export async function getMeinKostenkonto(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const userId = event.requestContext.authorizer?.userId;
    if (!userId) return errorResponse('Nicht autorisiert', 401);

    // Get active saison
    const aktive = await queryGSI1('TRAINING_SAISON_STATUS#aktiv');
    if (!aktive.length) return successResponse([]);
    const saisonId = aktive[0].id as string;

    // Get player's groups
    const gruppen = await queryGSI2(`TRAINING_SPIELER_GRUPPEN#${userId}`);
    const kostenkonten = [];

    for (const g of gruppen) {
      const platzId = g.platzId as string;
      const items = await queryItems(`TRAINING_KOSTENKONTO#${saisonId}#${platzId}`, `SPIELER#${userId}`);
      if (items.length) kostenkonten.push({ ...items[0], platzId });
    }

    return successResponse(kostenkonten);
  } catch (error) {
    console.error('Get mein kostenkonto error:', error);
    return errorResponse('Internal server error', 500);
  }
}

export async function getGruppenKosten(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const rolle = event.requestContext.authorizer?.rolle;
    if (rolle !== 'trainings_verwalter' && rolle !== 'admin') {
      return errorResponse('Nicht autorisiert', 403);
    }

    const platzId = event.pathParameters?.id;
    if (!platzId) return errorResponse('Platz ID erforderlich');

    const aktive = await queryGSI1('TRAINING_SAISON_STATUS#aktiv');
    if (!aktive.length) return successResponse([]);
    const saisonId = aktive[0].id as string;

    const items = await queryItems(`TRAINING_KOSTENKONTO#${saisonId}#${platzId}`);
    return successResponse(items);
  } catch (error) {
    console.error('Get gruppen kosten error:', error);
    return errorResponse('Internal server error', 500);
  }
}
