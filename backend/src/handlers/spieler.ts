import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { successResponse, errorResponse } from '../utils/response';
import { getItem, putItem, queryItems, deleteItem, docClient, TABLE_NAME } from '../utils/dynamodb';
import { getRolle, isSuperadmin, isVerwalterOrAdmin, isClubManager } from '../utils/auth-helpers';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';

const CreateSpielerSchema = z.object({
  name: z.string().min(1).max(100),
  vorname: z.string().min(1).max(100),
  email: z.string().email().max(255),
  password: z.string().min(8).max(100),
  rolle: z.enum(['spieler', 'trainings_verwalter', 'club_manager', 'admin']),
});

export async function listSpieler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    // Verwalter/Admin oder MF darf Spieler sehen
    const userId = event.requestContext.authorizer?.userId as string | undefined;
    if (!isVerwalterOrAdmin(event)) {
      // Prüfe ob User MF ist
      if (!userId) return errorResponse('Nicht autorisiert', 403);
      const spielerItem = await getItem(`TRAINING_SPIELER#${userId}`, 'METADATA');
      if (!spielerItem?.mannschaftsfuehrer) return errorResponse('Nicht autorisiert', 403);
    }

    const result = await docClient.send(new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: 'entityType = :type',
      ExpressionAttributeValues: { ':type': 'TRAINING_SPIELER' },
    }));

    // lastLogin aus User-Datensätzen holen
    const userResult = await docClient.send(new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: 'entityType = :type',
      ExpressionAttributeValues: { ':type': 'TRAINING_USER' },
      ProjectionExpression: 'id, lastLogin',
    }));
    const lastLoginMap = new Map<string, string>();
    for (const u of userResult.Items || []) {
      if (u.lastLogin) lastLoginMap.set(u.id as string, u.lastLogin as string);
    }

    let spieler = (result.Items || []).map(s => ({
      ...s,
      lastLogin: lastLoginMap.get(s.id as string) || null,
    } as Record<string, unknown>)).sort((a, b) =>
      (a.name as string).localeCompare(b.name as string)
    );

    // Trainings_Verwalter darf den Superadmin nicht sehen
    if (!isSuperadmin(event)) {
      spieler = spieler.filter(s => s.rolle !== 'admin');
    }

    return successResponse(spieler);
  } catch (error) {
    console.error('List spieler error:', error);
    return errorResponse('Internal server error', 500);
  }
}

export async function createSpieler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    if (!isVerwalterOrAdmin(event)) return errorResponse('Nicht autorisiert', 403);

    if (!event.body) return errorResponse('Request body required');
    const body = CreateSpielerSchema.parse(JSON.parse(event.body));

    // Trainings_Verwalter darf keine Admins anlegen
    if (!isSuperadmin(event) && body.rolle === 'admin') {
      return errorResponse('Nur der Superadmin kann die Admin-Rolle vergeben', 403);
    }

    const id = uuidv4();
    const now = new Date().toISOString();
    const email = body.email.toLowerCase();

    // Spieler-Datensatz
    await putItem({
      PK: `TRAINING_SPIELER#${id}`,
      SK: 'METADATA',
      GSI1PK: `TRAINING_EMAIL#${email}`,
      GSI1SK: 'TRAINING_SPIELER',
      id, name: body.name, vorname: body.vorname, email,
      rolle: body.rolle, aktiv: true,
      createdAt: now, updatedAt: now,
      entityType: 'TRAINING_SPIELER',
    });

    // User-Datensatz (Auth)
    const hashedPassword = await bcrypt.hash(body.password, 10);
    await putItem({
      PK: `TRAINING_USER#${id}`,
      SK: 'AUTH',
      GSI1PK: `TRAINING_EMAIL#${email}`,
      GSI1SK: 'TRAINING_USER',
      id, email, password: hashedPassword,
      rolle: body.rolle, passwordChangeRequired: true,
      aktiv: true,
      createdAt: now, updatedAt: now,
      entityType: 'TRAINING_USER',
    });

    return successResponse({ id, name: body.name, vorname: body.vorname, email, rolle: body.rolle, aktiv: true }, 201);
  } catch (error) {
    console.error('Create spieler error:', error);
    return errorResponse('Internal server error', 500);
  }
}

const UpdateSpielerSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  vorname: z.string().min(1).max(100).optional(),
  email: z.string().email().max(255).optional(),
  rolle: z.enum(['spieler', 'trainings_verwalter', 'club_manager', 'admin']).optional(),
  aktiv: z.boolean().optional(),
  telefon: z.string().max(30).optional(),
  password: z.string().min(8).max(100).optional(),
  kern: z.number().min(1).max(4).nullable().optional(),
  mannschaftsfuehrer: z.boolean().optional(),
});

export async function updateSpieler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const userId = event.requestContext.authorizer?.userId as string | undefined;
    
    // Verwalter/Admin darf alles, MF darf nur kern setzen
    let isMFUser = false;
    if (!isVerwalterOrAdmin(event)) {
      if (!userId) return errorResponse('Nicht autorisiert', 403);
      const callerSpieler = await getItem(`TRAINING_SPIELER#${userId}`, 'METADATA');
      if (!callerSpieler?.mannschaftsfuehrer) return errorResponse('Nicht autorisiert', 403);
      isMFUser = true;
    }

    const spielerId = event.pathParameters?.id;
    if (!spielerId || !event.body) return errorResponse('Spieler ID und Body erforderlich');

    const spieler = await getItem(`TRAINING_SPIELER#${spielerId}`, 'METADATA');
    if (!spieler) return errorResponse('Spieler nicht gefunden', 404);

    const body = UpdateSpielerSchema.parse(JSON.parse(event.body));
    const now = new Date().toISOString();

    // MF darf nur kern setzen
    if (isMFUser) {
      if (body.kern !== undefined) {
        const updated = { ...spieler, kern: body.kern, updatedAt: now };
        await putItem(updated);
        return successResponse(updated);
      }
      return errorResponse('Mannschaftsführer darf nur Kernmannschaft setzen', 403);
    }

    // Trainings_Verwalter darf keine Admin-Rolle vergeben
    if (!isSuperadmin(event) && body.rolle === 'admin') {
      return errorResponse('Nur der Superadmin kann die Admin-Rolle vergeben', 403);
    }

    // Trainings_Verwalter darf Superadmin-Account nicht bearbeiten
    if (!isSuperadmin(event) && spieler.rolle === 'admin') {
      return errorResponse('Der Superadmin-Account kann nicht bearbeitet werden', 403);
    }

    // Admin setzt Passwort direkt
    if (body.password) {
      const user = await getItem(`TRAINING_USER#${spielerId}`, 'AUTH');
      if (!user) return errorResponse('User-Datensatz nicht gefunden', 404);
      const hashedPassword = await bcrypt.hash(body.password, 10);
      await putItem({ ...user, password: hashedPassword, passwordChangeRequired: false, updatedAt: now });
      return successResponse({ message: 'Passwort gesetzt' });
    }

    const updated = { ...spieler, ...body, updatedAt: now };
    await putItem(updated);

    // Sync rolle to user record if changed
    if (body.rolle) {
      const user = await getItem(`TRAINING_USER#${spielerId}`, 'AUTH');
      if (user) await putItem({ ...user, rolle: body.rolle, updatedAt: now });
    }

    return successResponse(updated);
  } catch (error) {
    console.error('Update spieler error:', error);
    return errorResponse('Internal server error', 500);
  }
}

export async function deaktiviereSpieler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    if (!isVerwalterOrAdmin(event)) return errorResponse('Nicht autorisiert', 403);

    const spielerId = event.pathParameters?.id;
    if (!spielerId) return errorResponse('Spieler ID erforderlich');

    const spieler = await getItem(`TRAINING_SPIELER#${spielerId}`, 'METADATA');
    if (!spieler) return errorResponse('Spieler nicht gefunden', 404);

    // Trainings_Verwalter darf Superadmin nicht deaktivieren
    if (!isSuperadmin(event) && spieler.rolle === 'admin') {
      return errorResponse('Der Superadmin-Account kann nicht deaktiviert werden', 403);
    }

    const now = new Date().toISOString();
    await putItem({ ...spieler, aktiv: false, updatedAt: now });

    const user = await getItem(`TRAINING_USER#${spielerId}`, 'AUTH');
    if (user) await putItem({ ...user, aktiv: false, updatedAt: now });

    // TODO: Aus zukünftigen Zuweisungen und Buchungsgruppen entfernen

    return successResponse({ message: 'Spieler deaktiviert' });
  } catch (error) {
    console.error('Deactivate spieler error:', error);
    return errorResponse('Internal server error', 500);
  }
}

export async function deleteSpieler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    if (!isSuperadmin(event)) return errorResponse('Nur Admin darf Spieler löschen', 403);

    const spielerId = event.pathParameters?.id;
    if (!spielerId) return errorResponse('Spieler ID erforderlich');

    const spieler = await getItem(`TRAINING_SPIELER#${spielerId}`, 'METADATA');
    if (!spieler) return errorResponse('Spieler nicht gefunden', 404);

    // Superadmin-Account darf nicht gelöscht werden
    if (spieler.rolle === 'admin') {
      return errorResponse('Der Superadmin-Account kann nicht gelöscht werden', 403);
    }

    // Spieler- und User-Datensatz löschen
    await deleteItem(`TRAINING_SPIELER#${spielerId}`, 'METADATA');
    await deleteItem(`TRAINING_USER#${spielerId}`, 'AUTH');

    return successResponse({ message: 'Spieler gelöscht' });
  } catch (error) {
    console.error('Delete spieler error:', error);
    return errorResponse('Internal server error', 500);
  }
}

