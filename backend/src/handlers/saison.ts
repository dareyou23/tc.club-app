import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { successResponse, errorResponse } from '../utils/response';
import { getItem, putItem, queryGSI1, docClient, TABLE_NAME } from '../utils/dynamodb';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';

const SaisonSchema = z.object({
  name: z.string().min(1).max(100),
  typ: z.enum(['winter', 'sommer']),
  startDatum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDatum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

// Letzter Freitag im September eines Jahres
function letzterFreitagImSeptember(year: number): Date {
  const d = new Date(year, 9, 0); // 30. September
  while (d.getDay() !== 5) d.setDate(d.getDate() - 1);
  return d;
}

// Berechne laufende + nächste Saison
// Saisons können sich überlappen:
// - Winter (Halle): letzter Freitag im September → 30. April nächstes Jahr
// - Sommer (Außen): 1. April → Tag vor letztem Freitag im September
// Im April laufen beide parallel (Halle + Außen)
function berechneSaisons(): Array<{ name: string; typ: 'winter' | 'sommer'; startDatum: string; endDatum: string }> {
  const today = new Date();
  const year = today.getFullYear();
  const saisons: Array<{ name: string; typ: 'winter' | 'sommer'; startDatum: string; endDatum: string }> = [];

  const winterStart = letzterFreitagImSeptember(year);
  const winterStartPrev = letzterFreitagImSeptember(year - 1);
  const sommerStart = new Date(year, 3, 1); // 1. April
  const sommerEnd = new Date(winterStart);
  sommerEnd.setDate(sommerEnd.getDate() - 1);
  const winterEndPrev = new Date(year, 3, 30); // 30. April

  const fmt = (d: Date) => d.toISOString().split('T')[0];

  if (today >= winterStart) {
    // Ab letztem Freitag im September: Winter läuft, Sommer nächstes Jahr planen
    const endDate = new Date(year + 1, 3, 30);
    saisons.push({
      name: `Winter ${year}/${year + 1}`,
      typ: 'winter',
      startDatum: fmt(winterStart),
      endDatum: fmt(endDate),
    });
    const nextSommerStart = new Date(year + 1, 3, 1);
    const nextWinterStart = letzterFreitagImSeptember(year + 1);
    const nextSommerEnd = new Date(nextWinterStart);
    nextSommerEnd.setDate(nextSommerEnd.getDate() - 1);
    saisons.push({
      name: `Sommer ${year + 1}`,
      typ: 'sommer',
      startDatum: fmt(nextSommerStart),
      endDatum: fmt(nextSommerEnd),
    });
  } else if (today >= sommerStart) {
    // Ab 1. April: Sommer läuft (evtl. parallel zu Winter im April)
    saisons.push({
      name: `Sommer ${year}`,
      typ: 'sommer',
      startDatum: fmt(sommerStart),
      endDatum: fmt(sommerEnd),
    });
    // Winter vom Vorjahr läuft noch bis 30. April
    if (today <= winterEndPrev) {
      saisons.push({
        name: `Winter ${year - 1}/${year}`,
        typ: 'winter',
        startDatum: fmt(winterStartPrev),
        endDatum: fmt(winterEndPrev),
      });
    }
    // Nächste: Winter dieses Jahres
    const winterEnd = new Date(year + 1, 3, 30);
    saisons.push({
      name: `Winter ${year}/${year + 1}`,
      typ: 'winter',
      startDatum: fmt(winterStart),
      endDatum: fmt(winterEnd),
    });
  } else {
    // Jan-März: Winter vom Vorjahr läuft, Sommer dieses Jahres planen
    saisons.push({
      name: `Winter ${year - 1}/${year}`,
      typ: 'winter',
      startDatum: fmt(winterStartPrev),
      endDatum: fmt(winterEndPrev),
    });
    saisons.push({
      name: `Sommer ${year}`,
      typ: 'sommer',
      startDatum: fmt(sommerStart),
      endDatum: fmt(sommerEnd),
    });
  }

  return saisons;
}

export async function ensureSaisons(_event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const rolle = _event.requestContext.authorizer?.rolle;
    if (rolle !== 'admin') return errorResponse('Nur Admins', 403);

    const result = await doEnsureSaisons();
    return successResponse(result);
  } catch (error) {
    console.error('Ensure saisons error:', error);
    return errorResponse('Internal server error', 500);
  }
}

// Scheduled: wird von EventBridge aufgerufen (kein API Gateway Auth)
export async function scheduledEnsureSaisons(): Promise<void> {
  try {
    const result = await doEnsureSaisons();
    console.log(`Scheduled ensureSaisons: ${result.length} Saisons geprüft/angelegt`);
  } catch (error) {
    console.error('Scheduled ensure saisons error:', error);
    throw error;
  }
}

async function doEnsureSaisons(): Promise<any[]> {
  const calculated = berechneSaisons();

  // Alle existierenden Saisons laden
  const existing = await docClient.send(new ScanCommand({
    TableName: TABLE_NAME,
    FilterExpression: 'entityType = :type',
    ExpressionAttributeValues: { ':type': 'TRAINING_SAISON' },
  }));
  const existingItems = existing.Items || [];

  const result: any[] = [];
  const now = new Date().toISOString();
  const today = new Date().toISOString().split('T')[0];

  for (const s of calculated) {
    const found = existingItems.find((e: any) => e.name === s.name);
    if (found) {
      result.push(found);
    } else {
      const id = uuidv4();
      const isAktiv = s.startDatum <= today && s.endDatum >= today;
      const status = isAktiv ? 'aktiv' : 'geplant';

      const item = {
        PK: `TRAINING_SAISON#${id}`,
        SK: 'METADATA',
        GSI1PK: `TRAINING_SAISON_STATUS#${status}`,
        GSI1SK: `TRAINING_SAISON#${s.startDatum}`,
        id, name: s.name, typ: s.typ,
        startDatum: s.startDatum, endDatum: s.endDatum,
        status,
        createdAt: now, updatedAt: now,
        entityType: 'TRAINING_SAISON',
      };
      await putItem(item);
      result.push(item);
    }
  }

  return result;
}

export async function listSaisons(_event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const result = await docClient.send(new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: 'entityType = :type',
      ExpressionAttributeValues: { ':type': 'TRAINING_SAISON' },
    }));
    const saisons = (result.Items || []).sort((a, b) =>
      (b.startDatum as string).localeCompare(a.startDatum as string)
    );
    return successResponse(saisons);
  } catch (error) {
    console.error('List saisons error:', error);
    return errorResponse('Internal server error', 500);
  }
}

export async function getAktiveSaison(_event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const items = await queryGSI1('TRAINING_SAISON_STATUS#aktiv');
    if (!items.length) return errorResponse('Keine aktive Saison gefunden', 404);
    return successResponse(items[0]);
  } catch (error) {
    console.error('Get active saison error:', error);
    return errorResponse('Internal server error', 500);
  }
}

export async function createSaison(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const rolle = event.requestContext.authorizer?.rolle;
    if (rolle !== 'admin') return errorResponse('Nur Admins können Saisons anlegen', 403);

    if (!event.body) return errorResponse('Request body required');
    const body = SaisonSchema.parse(JSON.parse(event.body));

    // Prüfe Überschneidung mit aktiver Saison
    const aktive = await queryGSI1('TRAINING_SAISON_STATUS#aktiv');
    if (aktive.length > 0) {
      const existing = aktive[0];
      const newStart = new Date(body.startDatum);
      const newEnd = new Date(body.endDatum);
      const exStart = new Date(existing.startDatum as string);
      const exEnd = new Date(existing.endDatum as string);
      if (newStart <= exEnd && newEnd >= exStart) {
        return errorResponse('Zeitraum überschneidet sich mit aktiver Saison');
      }
    }

    const id = uuidv4();
    const now = new Date().toISOString();

    await putItem({
      PK: `TRAINING_SAISON#${id}`,
      SK: 'METADATA',
      GSI1PK: `TRAINING_SAISON_STATUS#geplant`,
      GSI1SK: `TRAINING_SAISON#${body.startDatum}`,
      id, name: body.name, typ: body.typ,
      startDatum: body.startDatum, endDatum: body.endDatum,
      status: 'geplant',
      createdAt: now, updatedAt: now,
      entityType: 'TRAINING_SAISON',
    });

    return successResponse({ id, name: body.name, status: 'geplant' }, 201);
  } catch (error) {
    console.error('Create saison error:', error);
    return errorResponse('Internal server error', 500);
  }
}

export async function aktiviereSaison(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const rolle = event.requestContext.authorizer?.rolle;
    if (rolle !== 'admin') return errorResponse('Nur Admins können Saisons aktivieren', 403);

    const saisonId = event.pathParameters?.id;
    if (!saisonId) return errorResponse('Saison ID erforderlich');

    const saison = await getItem(`TRAINING_SAISON#${saisonId}`, 'METADATA');
    if (!saison) return errorResponse('Saison nicht gefunden', 404);

    const now = new Date().toISOString();

    // Vorherige aktive Saison archivieren
    const aktive = await queryGSI1('TRAINING_SAISON_STATUS#aktiv');
    for (const s of aktive) {
      await putItem({
        ...s,
        status: 'archiviert',
        GSI1PK: 'TRAINING_SAISON_STATUS#archiviert',
        updatedAt: now,
      });
    }

    // Neue Saison aktivieren
    await putItem({
      ...saison,
      status: 'aktiv',
      GSI1PK: 'TRAINING_SAISON_STATUS#aktiv',
      updatedAt: now,
    });

    return successResponse({ message: 'Saison aktiviert' });
  } catch (error) {
    console.error('Activate saison error:', error);
    return errorResponse('Internal server error', 500);
  }
}