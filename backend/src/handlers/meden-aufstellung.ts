import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { successResponse, errorResponse } from '../utils/response';
import { queryItems, putItem, docClient, TABLE_NAME, getItem } from '../utils/dynamodb';
import { isAuthenticated, isVerwalterOrAdmin, getSpielerIdFromEvent } from '../utils/auth-helpers';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';

// Stammmannschaft aus Rang ableiten (§26 TVM WSpO)
function getStammMannschaft(rang: number | undefined): number {
  if (!rang || rang < 1) return 4;
  if (rang <= 6) return 1;
  if (rang <= 12) return 2;
  if (rang <= 18) return 3;
  return 4;
}

// GET /meden/aufstellung/{spieltagId} — Aufstellung + Festspiel-Infos
export async function getAufstellung(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    if (!isAuthenticated(event)) return errorResponse('Nicht autorisiert', 403);
    const spieltagId = event.pathParameters?.spieltagId;
    if (!spieltagId) return errorResponse('spieltagId fehlt');

    const items = await queryItems(`MEDEN_SPIELTAG#${spieltagId}`, 'AUFSTELLUNG#');
    return successResponse(items);
  } catch (error) {
    console.error('Get aufstellung error:', error);
    return errorResponse('Internal server error', 500);
  }
}

// POST /meden/aufstellung/{spieltagId} — Aufstellung setzen
// Body: { spielerIds: string[] }
export async function setAufstellung(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    // Verwalter/Admin oder MF
    const userId = event.requestContext.authorizer?.userId as string | undefined;
    if (!isVerwalterOrAdmin(event)) {
      if (!userId) return errorResponse('Nicht autorisiert', 403);
      const sp = await getItem(`TRAINING_SPIELER#${userId}`, 'METADATA');
      if (!sp?.mannschaftsfuehrer) return errorResponse('Nicht autorisiert', 403);
    }
    const spieltagId = event.pathParameters?.spieltagId;
    if (!spieltagId || !event.body) return errorResponse('spieltagId und Body erforderlich');

    const { spielerIds } = JSON.parse(event.body) as { spielerIds: string[] };
    if (!spielerIds || !Array.isArray(spielerIds)) return errorResponse('spielerIds Array erforderlich');

    // Spieltag laden um Mannschaft zu bestimmen
    const spieltag = await queryItems(`MEDEN_SPIELTAG#${spieltagId}`, 'METADATA');
    if (!spieltag.length) return errorResponse('Spieltag nicht gefunden', 404);
    const stMannschaft = spieltag[0].mannschaft as number;

    // Alle Spieler laden für Rang-Info
    const alleSpieler = await docClient.send(new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: 'entityType = :t',
      ExpressionAttributeValues: { ':t': 'TRAINING_SPIELER' },
    }));
    const spielerMap = new Map<string, any>();
    for (const s of alleSpieler.Items || []) spielerMap.set(s.id as string, s);

    // Alle bisherigen Einsätze laden für Festspiel-Check
    const alleEinsaetze = await docClient.send(new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: 'entityType = :t',
      ExpressionAttributeValues: { ':t': 'MEDEN_EINSATZ' },
    }));

    // Einsätze pro Spieler pro Mannschaft zählen
    const einsatzCount: Record<string, Record<number, number>> = {};
    for (const e of alleEinsaetze.Items || []) {
      const sid = e.spielerId as string;
      const m = e.mannschaft as number;
      if (!einsatzCount[sid]) einsatzCount[sid] = {};
      einsatzCount[sid][m] = (einsatzCount[sid][m] || 0) + 1;
    }

    const now = new Date().toISOString();
    const warnungen: string[] = [];

    for (const spielerId of spielerIds) {
      const sp = spielerMap.get(spielerId);
      const rang = sp?.setzlistePosition as number | undefined;
      const stammM = getStammMannschaft(rang);
      const name = sp ? `${sp.vorname} ${sp.name}` : spielerId;

      // Festspiel-Check: Spieler in höherer Mannschaft als Stamm?
      if (stMannschaft < stammM) {
        // Aushelfen nach oben — wie oft schon in dieser Mannschaft?
        const bisherige = einsatzCount[spielerId]?.[stMannschaft] || 0;
        if (bisherige >= 3) {
          // Bereits festgespielt — darf nicht mehr in niedrigeren Mannschaften
          warnungen.push(`⚠️ ${name} ist in M${stMannschaft} festgespielt (${bisherige} Einsätze). Darf nicht mehr in M${stammM}+ spielen.`);
        } else if (bisherige === 2) {
          warnungen.push(`⚠️ ${name}: 3. Einsatz in M${stMannschaft}! Wird danach festgespielt.`);
          // Automatisch Kernmannschaft umstellen wenn festgespielt in höherer Mannschaft
          if (sp && sp.kern && stMannschaft < sp.kern) {
            await putItem({ ...sp, kern: stMannschaft, updatedAt: new Date().toISOString() });
            warnungen.push(`ℹ️ ${name}: Kernmannschaft automatisch auf M${stMannschaft} geändert (festgespielt).`);
          }
        } else {
          warnungen.push(`ℹ️ ${name} hilft aus (Stamm: M${stammM}, Einsatz ${bisherige + 1}/3 in M${stMannschaft})`);
        }
      }

      // Aufstellung speichern
      await putItem({
        PK: `MEDEN_SPIELTAG#${spieltagId}`, SK: `AUFSTELLUNG#${spielerId}`,
        spieltagId, spielerId, mannschaft: stMannschaft,
        stammMannschaft: stammM, rang,
        entityType: 'MEDEN_AUFSTELLUNG',
        createdAt: now, updatedAt: now,
      });

      // Einsatz erfassen
      await putItem({
        PK: `MEDEN_EINSATZ#${spielerId}`, SK: `${spieltagId}#M${stMannschaft}`,
        spielerId, spieltagId, mannschaft: stMannschaft,
        stammMannschaft: stammM, istAushelfen: stMannschaft < stammM,
        datum: spieltag[0].datum,
        entityType: 'MEDEN_EINSATZ',
        createdAt: now,
      });
    }

    return successResponse({ spieltagId, spielerIds, warnungen });
  } catch (error) {
    console.error('Set aufstellung error:', error);
    return errorResponse('Internal server error', 500);
  }
}

// GET /meden/festspiel-status — Festspiel-Übersicht aller Spieler
export async function getFestspielStatus(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    if (!isAuthenticated(event)) return errorResponse('Nicht autorisiert', 403);

    // Alle Einsätze laden
    const alleEinsaetze = await docClient.send(new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: 'entityType = :t',
      ExpressionAttributeValues: { ':t': 'MEDEN_EINSATZ' },
    }));

    // Alle Spieler laden
    const alleSpieler = await docClient.send(new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: 'entityType = :t',
      ExpressionAttributeValues: { ':t': 'TRAINING_SPIELER' },
    }));

    const spielerMap = new Map<string, any>();
    for (const s of alleSpieler.Items || []) spielerMap.set(s.id as string, s);

    // Einsätze pro Spieler pro Mannschaft
    const einsatzData: Record<string, { mannschaft: number; count: number; einsaetze: any[] }[]> = {};
    for (const e of alleEinsaetze.Items || []) {
      const sid = e.spielerId as string;
      const m = e.mannschaft as number;
      if (!einsatzData[sid]) einsatzData[sid] = [];
      let entry = einsatzData[sid].find(x => x.mannschaft === m);
      if (!entry) { entry = { mannschaft: m, count: 0, einsaetze: [] }; einsatzData[sid].push(entry); }
      entry.count++;
      entry.einsaetze.push({ datum: e.datum, spieltagId: e.spieltagId });
    }

    // Festspiel-Status berechnen
    const result = Object.entries(einsatzData).map(([spielerId, mannschaften]) => {
      const sp = spielerMap.get(spielerId);
      const stammM = getStammMannschaft(sp?.setzlistePosition);
      const festgespielt = mannschaften.filter(m => m.mannschaft < stammM && m.count >= 3);
      return {
        spielerId,
        name: sp ? `${sp.vorname} ${sp.name}` : spielerId,
        stammMannschaft: stammM,
        rang: sp?.setzlistePosition,
        mannschaften,
        festgespielt: festgespielt.length > 0,
        festgespieltIn: festgespielt.map(f => f.mannschaft),
      };
    });

    return successResponse(result);
  } catch (error) {
    console.error('Get festspiel status error:', error);
    return errorResponse('Internal server error', 500);
  }
}
