import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { successResponse, errorResponse } from '../utils/response';
import { getItem, putItem, queryGSI1, deleteItem } from '../utils/dynamodb';

const PlatzSchema = z.object({
  saisonId: z.string().uuid(),
  name: z.string().min(1).max(200),
  wochentag: z.number().min(0).max(6),
  uhrzeit: z.string().regex(/^\d{2}:\d{2}$/),
  uhrzeitBis: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  dauer: z.number().min(30).max(180),
  ort: z.string().min(1).max(200),
  hallengebuehr: z.number().min(0),
  trainerkosten: z.number().min(0).nullable(),
  trainerName: z.string().max(100).optional(),
  nurHallentraining: z.boolean().default(false),
  platzTyp: z.enum(['training', 'saisonplanung']).default('training'),
  buchungsmodus: z.enum(['faire_verteilung', 'spontan_anmeldung']),
  aktiverPlatz: z.number().min(1).max(10).default(2),
  gruppengroesse: z.number().min(2).max(20).default(4),
});

function checkVerwalterOrAdmin(event: APIGatewayProxyEvent): string | null {
  const rolle = event.requestContext.authorizer?.rolle;
  if (rolle === 'trainings_verwalter' || rolle === 'club_manager' || rolle === 'admin') return null;
  return 'Nicht autorisiert';
}

async function checkVerwalterOrMF(event: APIGatewayProxyEvent): Promise<string | null> {
  if (!checkVerwalterOrAdmin(event)) return null; // Verwalter/Admin OK
  // Prüfe ob MF
  const userId = event.requestContext.authorizer?.userId as string | undefined;
  if (!userId) return 'Nicht autorisiert';
  const sp = await getItem(`TRAINING_SPIELER#${userId}`, 'METADATA');
  if (sp?.mannschaftsfuehrer) return null;
  return 'Nicht autorisiert';
}

export async function listPlaetze(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    // Get active saison
    const aktive = await queryGSI1('TRAINING_SAISON_STATUS#aktiv');
    const geplant = await queryGSI1('TRAINING_SAISON_STATUS#geplant');
    const saisons = [...aktive, ...geplant];
    if (!saisons.length) return successResponse([]);

    // Plätze aus allen relevanten Saisons laden
    const allPlaetze: Record<string, unknown>[] = [];
    for (const saison of saisons) {
      const saisonId = saison.id as string;
      const plaetze = await queryGSI1(`TRAINING_SAISON#${saisonId}`, 'TRAINING_PLATZ#');
      allPlaetze.push(...plaetze);
    }
    return successResponse(allPlaetze);
  } catch (error) {
    console.error('List plaetze error:', error);
    return errorResponse('Internal server error', 500);
  }
}

export async function createPlatz(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const authError = await checkVerwalterOrMF(event);
    if (authError) return errorResponse(authError, 403);
    if (!event.body) return errorResponse('Request body required');

    const body = PlatzSchema.parse(JSON.parse(event.body));

    // Validate saison exists
    const saison = await getItem(`TRAINING_SAISON#${body.saisonId}`, 'METADATA');
    if (!saison) return errorResponse('Saison nicht gefunden', 404);

    const id = uuidv4();
    const now = new Date().toISOString();

    await putItem({
      PK: `TRAINING_PLATZ#${id}`, SK: 'METADATA',
      GSI1PK: `TRAINING_SAISON#${body.saisonId}`,
      GSI1SK: `TRAINING_PLATZ#${body.wochentag}#${body.uhrzeit}`,
      id, ...body,
      createdAt: now, updatedAt: now,
      entityType: 'TRAINING_PLATZ',
    });

    // Generate recurring slots
    await generateSlots(id, body, saison);

    return successResponse({ id, name: body.name }, 201);
  } catch (error) {
    console.error('Create platz error:', error);
    return errorResponse('Internal server error', 500);
  }
}

async function generateSlots(
  platzId: string,
  platz: z.infer<typeof PlatzSchema>,
  saison: Record<string, unknown>
) {
  const start = new Date(saison.startDatum as string);
  const end = new Date(saison.endDatum as string);

  // JS: 0=Sunday, we use 0=Monday → convert
  const jsWochentag = (platz.wochentag + 1) % 7;

  // Find first matching weekday
  const current = new Date(start);
  while (current.getDay() !== jsWochentag) {
    current.setDate(current.getDate() + 1);
  }

  const now = new Date().toISOString();

  while (current <= end) {
    const slotId = uuidv4();
    const datum = current.toISOString().split('T')[0];

    await putItem({
      PK: `TRAINING_SLOT#${slotId}`, SK: 'METADATA',
      GSI1PK: `TRAINING_PLATZ#${platzId}`,
      GSI1SK: `TRAINING_SLOT#${datum}`,
      GSI2PK: `TRAINING_SAISON_SLOTS#${platz.saisonId}`,
      GSI2SK: `${datum}#${platzId}`,
      id: slotId, platzId, saisonId: platz.saisonId,
      datum, wochentag: platz.wochentag, uhrzeit: platz.uhrzeit,
      dauer: platz.dauer, hallengebuehr: platz.hallengebuehr,
      trainerkosten: platz.trainerkosten,
      status: 'offen', buchungsmodus: platz.buchungsmodus,
      createdAt: now, updatedAt: now,
      entityType: 'TRAINING_SLOT',
    });

    current.setDate(current.getDate() + 7);
  }
}

export async function getPlatzSlots(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const platzId = event.pathParameters?.id;
    if (!platzId) return errorResponse('Platz ID erforderlich');

    const slots = await queryGSI1(`TRAINING_PLATZ#${platzId}`, 'TRAINING_SLOT#');
    // Sort by date
    slots.sort((a, b) => (a.datum as string).localeCompare(b.datum as string));
    return successResponse(slots);
  } catch (error) {
    console.error('Get platz slots error:', error);
    return errorResponse('Internal server error', 500);
  }
}

const UpdatePlatzSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  uhrzeit: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  uhrzeitBis: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  dauer: z.number().min(30).max(180).optional(),
  ort: z.string().min(1).max(200).optional(),
  hallengebuehr: z.number().min(0).optional(),
  trainerkosten: z.number().min(0).nullable().optional(),
  trainerName: z.string().max(100).optional().nullable(),
  platzTyp: z.enum(['training', 'saisonplanung']).optional(),
  buchungsmodus: z.enum(['faire_verteilung', 'spontan_anmeldung']).optional(),
  aktiverPlatz: z.number().min(1).max(10).optional(),
  gruppengroesse: z.number().min(2).max(20).optional(),
  anzahlPlaetze: z.number().min(1).max(10).optional(),
});

export async function getPlatz(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const platzId = event.pathParameters?.id;
    if (!platzId) return errorResponse('Platz ID erforderlich');

    const platz = await getItem(`TRAINING_PLATZ#${platzId}`, 'METADATA');
    if (!platz) return errorResponse('Platz nicht gefunden', 404);

    return successResponse(platz);
  } catch (error) {
    console.error('Get platz error:', error);
    return errorResponse('Internal server error', 500);
  }
}

export async function updatePlatz(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const authError = await checkVerwalterOrMF(event);
    if (authError) return errorResponse(authError, 403);

    const platzId = event.pathParameters?.id;
    if (!platzId) return errorResponse('Platz ID erforderlich');
    if (!event.body) return errorResponse('Request body required');

    const platz = await getItem(`TRAINING_PLATZ#${platzId}`, 'METADATA');
    if (!platz) return errorResponse('Platz nicht gefunden', 404);

    const body = UpdatePlatzSchema.parse(JSON.parse(event.body));
    const now = new Date().toISOString();

    // Merge updates
    const updated = { ...platz, ...body, updatedAt: now };
    // Remove null values for optional fields
    if (body.trainerName === null) updated.trainerName = undefined;
    if (body.uhrzeitBis === null) updated.uhrzeitBis = undefined;

    await putItem(updated);

    return successResponse(updated);
  } catch (error) {
    console.error('Update platz error:', error);
    return errorResponse('Internal server error', 500);
  }
}


export async function deletePlatz(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const authError = await checkVerwalterOrMF(event);
    if (authError) return errorResponse(authError, 403);

    const platzId = event.pathParameters?.id;
    if (!platzId) return errorResponse('Platz ID erforderlich');

    const platz = await getItem(`TRAINING_PLATZ#${platzId}`, 'METADATA');
    if (!platz) return errorResponse('Platz nicht gefunden', 404);

    // Delete future slots
    const slots = await queryGSI1(`TRAINING_PLATZ#${platzId}`, 'TRAINING_SLOT#');
    const today = new Date().toISOString().split('T')[0];
    for (const slot of slots) {
      if ((slot.datum as string) >= today) {
        await deleteItem(`TRAINING_SLOT#${slot.id}`, 'METADATA');
      }
    }

    await deleteItem(`TRAINING_PLATZ#${platzId}`, 'METADATA');
    return successResponse({ message: 'Platz und zukünftige Slots gelöscht' });
  } catch (error) {
    console.error('Delete platz error:', error);
    return errorResponse('Internal server error', 500);
  }
}
