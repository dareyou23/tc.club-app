import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { successResponse, errorResponse } from '../utils/response';
import { getItem, putItem, queryItems, deleteItem } from '../utils/dynamodb';

export async function getGruppe(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const platzId = event.pathParameters?.id;
    if (!platzId) return errorResponse('Platz ID erforderlich');

    const members = await queryItems(`TRAINING_PLATZ#${platzId}`, 'GRUPPE#');
    return successResponse(members);
  } catch (error) {
    console.error('Get gruppe error:', error);
    return errorResponse('Internal server error', 500);
  }
}

export async function addToGruppe(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const rolle = event.requestContext.authorizer?.rolle;
    if (rolle !== 'trainings_verwalter' && rolle !== 'admin') {
      return errorResponse('Nicht autorisiert', 403);
    }

    const platzId = event.pathParameters?.id;
    if (!platzId || !event.body) return errorResponse('Platz ID und Body erforderlich');

    const { spielerId } = JSON.parse(event.body);
    if (!spielerId) return errorResponse('spielerId erforderlich');

    const platz = await getItem(`TRAINING_PLATZ#${platzId}`, 'METADATA');
    if (!platz) return errorResponse('Platz nicht gefunden', 404);

    // Check group size
    const members = await queryItems(`TRAINING_PLATZ#${platzId}`, 'GRUPPE#');
    if (members.length >= (platz.gruppengroesse as number)) {
      return errorResponse(`Buchungsgruppe ist voll (max. ${platz.gruppengroesse})`);
    }

    // Check spieler exists and is active
    const spieler = await getItem(`TRAINING_SPIELER#${spielerId}`, 'METADATA');
    if (!spieler || !spieler.aktiv) return errorResponse('Spieler nicht gefunden oder inaktiv', 404);

    const now = new Date().toISOString();
    await putItem({
      PK: `TRAINING_PLATZ#${platzId}`, SK: `GRUPPE#${spielerId}`,
      GSI2PK: `TRAINING_SPIELER_GRUPPEN#${spielerId}`,
      GSI2SK: `TRAINING_PLATZ#${platzId}`,
      platzId, spielerId,
      spielerName: `${spieler.vorname} ${spieler.name}`,
      beigetretenAm: now,
      entityType: 'TRAINING_GRUPPE_MITGLIED',
    });

    return successResponse({ message: 'Spieler zur Gruppe hinzugefügt' }, 201);
  } catch (error) {
    console.error('Add to gruppe error:', error);
    return errorResponse('Internal server error', 500);
  }
}

export async function removeFromGruppe(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const rolle = event.requestContext.authorizer?.rolle;
    if (rolle !== 'trainings_verwalter' && rolle !== 'admin') {
      return errorResponse('Nicht autorisiert', 403);
    }

    const platzId = event.pathParameters?.id;
    const spielerId = event.pathParameters?.spielerId;
    if (!platzId || !spielerId) return errorResponse('Platz ID und Spieler ID erforderlich');

    await deleteItem(`TRAINING_PLATZ#${platzId}`, `GRUPPE#${spielerId}`);
    return successResponse({ message: 'Spieler aus Gruppe entfernt' });
  } catch (error) {
    console.error('Remove from gruppe error:', error);
    return errorResponse('Internal server error', 500);
  }
}
