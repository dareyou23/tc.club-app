import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { successResponse, errorResponse, messageResponse } from '../utils/response';
import { queryGSI1, putItem, getItem } from '../utils/dynamodb';

export async function getProfil(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const userId = event.requestContext.authorizer?.userId;
  if (!userId) return errorResponse('Nicht autorisiert', 401);

  const spieler = await getItem(`TRAINING_SPIELER#${userId}`, 'METADATA');
  if (!spieler) return errorResponse('Spieler nicht gefunden', 404);

  const user = await getItem(`TRAINING_USER#${userId}`, 'AUTH');

  return successResponse({
    id: userId,
    vorname: spieler.vorname || '',
    name: spieler.name || '',
    email: user?.email || spieler.email || '',
    telefon: spieler.telefon || '',
    rolle: user?.rolle || 'spieler',
  });
}

const UpdateProfilSchema = z.object({
  email: z.string().email().max(255),
  telefon: z.string().min(5).max(30),
});

export async function updateProfil(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  if (!event.body) return errorResponse('Request body required');

  const userId = event.requestContext.authorizer?.userId;
  if (!userId) return errorResponse('Nicht autorisiert', 401);

  const body = UpdateProfilSchema.parse(JSON.parse(event.body));
  const newEmail = body.email.toLowerCase();
  const now = new Date().toISOString();

  const user = await getItem(`TRAINING_USER#${userId}`, 'AUTH');
  if (!user) return errorResponse('Benutzer nicht gefunden', 404);

  const oldEmail = (user.email as string).toLowerCase();

  // Prüfe ob neue Email schon vergeben ist (wenn geändert)
  if (newEmail !== oldEmail) {
    const existing = await queryGSI1(`TRAINING_EMAIL#${newEmail}`, 'TRAINING_USER');
    if (existing.length > 0) return errorResponse('Diese E-Mail-Adresse ist bereits vergeben', 400);
  }

  // User-Datensatz aktualisieren
  await putItem({
    ...user,
    email: newEmail,
    GSI1PK: `TRAINING_EMAIL#${newEmail}`,
    updatedAt: now,
  });

  // Spieler-Datensatz aktualisieren
  const spieler = await getItem(`TRAINING_SPIELER#${userId}`, 'METADATA');
  if (spieler) {
    await putItem({
      ...spieler,
      email: newEmail,
      telefon: body.telefon,
      GSI1PK: `TRAINING_EMAIL#${newEmail}`,
      updatedAt: now,
    });
  }

  return successResponse({ message: 'Profil aktualisiert' });
}
