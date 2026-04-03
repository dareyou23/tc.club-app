import { APIGatewayProxyEvent } from 'aws-lambda';
import { TrainingRolle } from '../types/entities';

export function getRolle(event: APIGatewayProxyEvent): TrainingRolle | undefined {
  return event.requestContext.authorizer?.rolle as TrainingRolle | undefined;
}

export function checkRolle(event: APIGatewayProxyEvent, erlaubteRollen: TrainingRolle[]): boolean {
  const rolle = getRolle(event);
  return !!rolle && erlaubteRollen.includes(rolle);
}

export function isSuperadmin(event: APIGatewayProxyEvent): boolean {
  return getRolle(event) === 'admin';
}

export function isVerwalterOrAdmin(event: APIGatewayProxyEvent): boolean {
  return checkRolle(event, ['trainings_verwalter', 'club_manager', 'admin']);
}

export function isAuthenticated(event: APIGatewayProxyEvent): boolean {
  return !!event.requestContext.authorizer?.principalId;
}

export function getSpielerIdFromEvent(event: APIGatewayProxyEvent): string | undefined {
  return event.requestContext.authorizer?.userId as string | undefined;
}

export function isMannschaftsfuehrerOrAdmin(event: APIGatewayProxyEvent): boolean {
  // Mannschaftsführer wird über das Spieler-Feld bestimmt, nicht über die Rolle
  // Für API-Zugriff: Verwalter und Admin haben immer Zugriff
  return isVerwalterOrAdmin(event);
}

export function isClubManager(event: APIGatewayProxyEvent): boolean {
  return getRolle(event) === 'club_manager';
}
