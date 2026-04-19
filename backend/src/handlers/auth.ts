import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { successResponse, errorResponse, messageResponse } from '../utils/response';
import { queryGSI1, putItem, getItem, docClient, TABLE_NAME } from '../utils/dynamodb';
import { getRolle, isSuperadmin, isVerwalterOrAdmin } from '../utils/auth-helpers';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';

const LoginSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(100),
});

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(100),
  newPassword: z.string().min(8).max(100)
    .regex(/[A-Z]/, 'Mindestens ein Großbuchstabe erforderlich')
    .regex(/[a-z]/, 'Mindestens ein Kleinbuchstabe erforderlich')
    .regex(/\d/, 'Mindestens eine Ziffer erforderlich'),
});

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const path = event.path;
    if (path.endsWith('/login')) return handleLogin(event);
    if (path.endsWith('/refresh')) return handleRefresh(event);
    if (path.endsWith('/logout')) return handleLogout();
    if (path.endsWith('/change-password')) return handleChangePassword(event);
    if (path.endsWith('/reset-password')) return handleResetPassword(event);
    if (path.endsWith('/impersonate')) return handleImpersonate(event);
    if (path.endsWith('/erstanmeldung')) return handleErstanmeldung(event);
    if (path.endsWith('/passwort-vergessen')) return handlePasswortVergessen(event);
    return errorResponse('Route not found', 404);
  } catch (error) {
    console.error('Auth error:', error);
    return errorResponse('Internal server error', 500);
  }
}

async function handleLogin(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  if (!event.body) return errorResponse('Request body required');

  const body = LoginSchema.parse(JSON.parse(event.body));
  const email = body.email.toLowerCase();

  // Query user by email via GSI1
  const users = await queryGSI1(`TRAINING_EMAIL#${email}`, 'TRAINING_USER');
  if (!users.length) return errorResponse('Ungültige Anmeldedaten', 401);

  const user = users[0];
  if (!user.aktiv) return errorResponse('Konto deaktiviert', 403);
  if (!user.password) return errorResponse('Ungültige Anmeldedaten', 401);

  const isValid = await bcrypt.compare(body.password, user.password as string);
  if (!isValid) return errorResponse('Ungültige Anmeldedaten', 401);

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) throw new Error('JWT_SECRET environment variable is not set');

  const accessToken = jwt.sign(
    { id: user.id, email: user.email, rolle: user.rolle },
    jwtSecret,
    { expiresIn: '15m' }
  );

  const refreshToken = jwt.sign(
    { id: user.id, email: user.email, rolle: user.rolle, type: 'refresh' },
    jwtSecret,
    { expiresIn: '7d' }
  );

  // Load spieler profile
  const spieler = await getItem(`TRAINING_SPIELER#${user.id}`, 'METADATA');

  // lastLogin setzen (nur echte Logins, nicht Impersonate)
  const now = new Date().toISOString();
  await putItem({ ...user, lastLogin: now, updatedAt: now });

  return successResponse({
    accessToken,
    refreshToken,
    expiresIn: 900,
    user: {
      id: user.id,
      email: user.email,
      name: spieler?.name || '',
      vorname: spieler?.vorname || '',
      rolle: user.rolle,
      aktiv: user.aktiv,
      mannschaftsfuehrer: spieler?.mannschaftsfuehrer || false,
      kern: spieler?.kern || null,
      setzlistePosition: spieler?.setzlistePosition || null,
      passwordChangeRequired: user.passwordChangeRequired || false,
      passwordResetRequired: user.passwordResetRequired || false,
    },
  });
}

async function handleLogout(): Promise<APIGatewayProxyResult> {
  return messageResponse('Erfolgreich abgemeldet');
}

async function handleRefresh(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  if (!event.body) return errorResponse('Request body required');

  const RefreshSchema = z.object({ refreshToken: z.string().min(1) });
  const body = RefreshSchema.parse(JSON.parse(event.body));

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) throw new Error('JWT_SECRET environment variable is not set');

  try {
    const decoded = jwt.verify(body.refreshToken, jwtSecret) as { id: string; email: string; rolle: string; type?: string };
    if (decoded.type !== 'refresh') return errorResponse('Ungültiger Token-Typ', 401);

    // Prüfe ob User noch aktiv ist
    const user = await getItem(`TRAINING_USER#${decoded.id}`, 'AUTH');
    if (!user || !user.aktiv) return errorResponse('Konto deaktiviert', 403);

    // Aktuelle Rolle aus DB nehmen (falls geändert seit Token-Erstellung)
    const accessToken = jwt.sign(
      { id: decoded.id, email: user.email, rolle: user.rolle },
      jwtSecret,
      { expiresIn: '15m' }
    );

    return successResponse({ accessToken, expiresIn: 900 });
  } catch {
    return errorResponse('Refresh-Token ungültig oder abgelaufen', 401);
  }
}

async function handleChangePassword(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  if (!event.body) return errorResponse('Request body required');

  const userId = event.requestContext.authorizer?.userId;
  if (!userId) return errorResponse('Nicht autorisiert', 401);

  const body = ChangePasswordSchema.parse(JSON.parse(event.body));

  const user = await getItem(`TRAINING_USER#${userId}`, 'AUTH');
  if (!user) return errorResponse('Benutzer nicht gefunden', 404);

  const isValid = await bcrypt.compare(body.currentPassword, user.password as string);
  if (!isValid) return errorResponse('Aktuelles Passwort ist falsch', 400);

  const hashedPassword = await bcrypt.hash(body.newPassword, 10);
  const now = new Date().toISOString();

  await putItem({
    ...user,
    password: hashedPassword,
    passwordChangeRequired: false,
    passwordResetRequired: false,
    updatedAt: now,
  });

  return messageResponse('Passwort erfolgreich geändert');
}

async function handleResetPassword(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  if (!event.body) return errorResponse('Request body required');

  // Trainings_Verwalter und Admin dürfen Passwörter zurücksetzen
  if (!isVerwalterOrAdmin(event)) return errorResponse('Nicht autorisiert', 403);

  try {
    const ResetSchema = z.object({
      email: z.string().email().max(255),
    });
    const body = ResetSchema.parse(JSON.parse(event.body));
    const email = body.email.toLowerCase();

    // Trainings_Verwalter darf Superadmin-PW nicht zurücksetzen
    if (!isSuperadmin(event) && email === 'admin@training.de') {
      return errorResponse('Der Superadmin-Account kann nicht zurückgesetzt werden', 403);
    }

    // User per E-Mail suchen
    const users = await queryGSI1(`TRAINING_EMAIL#${email}`, 'TRAINING_USER');
    if (!users.length) {
      // Aus Sicherheitsgründen: Immer gleiche Antwort
      return successResponse({
        message: 'Falls ein Account mit dieser E-Mail existiert, wurde das Passwort zurückgesetzt.',
        temporaryPassword: null,
      });
    }

    const user = users[0];

    // Zufälliges temporäres Passwort (8 Zeichen, kopierbar für Verwalter)
    const crypto = await import('crypto');
    const temporaryPassword = crypto.randomBytes(6).toString('base64url').slice(0, 8);
    const hashedPassword = await bcrypt.hash(temporaryPassword, 10);
    const now = new Date().toISOString();

    await putItem({
      ...user,
      password: hashedPassword,
      passwordChangeRequired: false,
      passwordResetRequired: true,
      updatedAt: now,
    });

    return successResponse({
      message: 'Passwort wurde zurückgesetzt',
      temporaryPassword,
      email,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse('Ungültige Eingabe: ' + error.issues.map((e: any) => e.message).join(', '), 400);
    }
    throw error;
  }
}

async function handleImpersonate(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  // Impersonate nur in lokaler Entwicklung erlaubt
  const stage = process.env.STAGE || 'prod';
  if (stage !== 'local') {
    return errorResponse('Impersonierung ist nur in der lokalen Entwicklung verfügbar', 403);
  }

  const rolle = event.requestContext.authorizer?.rolle;
  if (rolle !== 'admin') return errorResponse('Nur Admins können Spieler impersonieren', 403);

  if (!event.body) return errorResponse('Request body required');
  const ImpersonateSchema = z.object({ spielerId: z.string().min(1) });
  const body = ImpersonateSchema.parse(JSON.parse(event.body));
  const spielerId = body.spielerId;

  // Load target user
  const user = await getItem(`TRAINING_USER#${spielerId}`, 'AUTH');
  if (!user) return errorResponse('Benutzer nicht gefunden', 404);

  const spieler = await getItem(`TRAINING_SPIELER#${spielerId}`, 'METADATA');
  if (!spieler) return errorResponse('Spieler nicht gefunden', 404);

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) throw new Error('JWT_SECRET environment variable is not set');
  const adminId = event.requestContext.authorizer?.userId;

  // Token für den Ziel-Spieler ausstellen, mit Marker dass es impersoniert ist
  const accessToken = jwt.sign(
    { id: spielerId, email: user.email, rolle: user.rolle, impersonatedBy: adminId },
    jwtSecret,
    { expiresIn: '1h' }
  );

  return successResponse({
    accessToken,
    expiresIn: 3600,
    user: {
      id: spielerId,
      email: user.email,
      name: spieler.name || '',
      vorname: spieler.vorname || '',
      rolle: user.rolle,
      aktiv: user.aktiv,
      mannschaftsfuehrer: spieler.mannschaftsfuehrer || false,
      kern: spieler.kern || null,
      passwordChangeRequired: false, // Beim Impersonieren nicht erzwingen
    },
  });
}


const ErstanmeldungSchema = z.object({
  currentPassword: z.string().min(1).max(100),
  newPassword: z.string().min(8).max(100)
    .regex(/[A-Z]/, 'Mindestens ein Großbuchstabe erforderlich')
    .regex(/[a-z]/, 'Mindestens ein Kleinbuchstabe erforderlich')
    .regex(/\d/, 'Mindestens eine Ziffer erforderlich'),
  email: z.string().email().max(255),
  telefon: z.string().min(5).max(30),
});

async function handleErstanmeldung(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  if (!event.body) return errorResponse('Request body required');

  const userId = event.requestContext.authorizer?.userId;
  if (!userId) return errorResponse('Nicht autorisiert', 401);

  const body = ErstanmeldungSchema.parse(JSON.parse(event.body));

  // 1. User-Datensatz laden und Passwort prüfen
  const user = await getItem(`TRAINING_USER#${userId}`, 'AUTH');
  if (!user) return errorResponse('Benutzer nicht gefunden', 404);

  const isValid = await bcrypt.compare(body.currentPassword, user.password as string);
  if (!isValid) return errorResponse('Aktuelles Passwort ist falsch', 400);

  const now = new Date().toISOString();
  const hashedPassword = await bcrypt.hash(body.newPassword, 10);
  const newEmail = body.email.toLowerCase();

  // 2. E-Mail muss sich ändern (generierte Mails sind erratbar)
  const oldEmail = (user.email as string).toLowerCase();
  if (newEmail === oldEmail) return errorResponse('Bitte eine andere E-Mail-Adresse als die aktuelle eingeben', 400);

  // 3. Prüfe ob neue Email schon vergeben ist
  const existing = await queryGSI1(`TRAINING_EMAIL#${newEmail}`, 'TRAINING_USER');
  if (existing.length > 0) return errorResponse('Diese E-Mail-Adresse ist bereits vergeben', 400);

  // 3. User-Datensatz aktualisieren (Passwort + Email + passwordChangeRequired)
  await putItem({
    ...user,
    email: newEmail,
    password: hashedPassword,
    passwordChangeRequired: false,
    GSI1PK: `TRAINING_EMAIL#${newEmail}`,
    updatedAt: now,
  });

  // 4. Spieler-Datensatz aktualisieren (Email + Telefon)
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

  return successResponse({ message: 'Erstanmeldung abgeschlossen' });
}

const sesClient = new SESClient({ region: 'eu-central-1' });

async function handlePasswortVergessen(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  if (!event.body) return errorResponse('Request body required');

  try {
    const PwVergessenSchema = z.object({ email: z.string().email().max(255) });
    const body = PwVergessenSchema.parse(JSON.parse(event.body));
    const email = body.email.toLowerCase();

    // Spieler suchen (stille Antwort wenn nicht gefunden)
    const spielerResults = await queryGSI1(`TRAINING_EMAIL#${email}`, 'TRAINING_SPIELER');
    if (!spielerResults.length) {
      return successResponse({ message: 'Anfrage gesendet' });
    }

    const spieler = spielerResults[0];

    // Alle Trainings_Verwalter + Admins finden
    const verwalterResult = await docClient.send(new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: 'entityType = :type AND (rolle = :verwalter OR rolle = :admin)',
      ExpressionAttributeValues: { ':type': 'TRAINING_USER', ':verwalter': 'trainings_verwalter', ':admin': 'admin' },
    }));

    const verwalterUsers = (verwalterResult.Items || []).filter(u => u.aktiv && u.email);
    const verwalterEmails = verwalterUsers.map(u => u.email as string);

    if (verwalterEmails.length === 0) {
      console.warn('Keine Trainings_Verwalter/Admins gefunden für Passwort-vergessen-Mail');
      return successResponse({ message: 'Anfrage gesendet' });
    }

    const fromEmail = process.env.SES_FROM_EMAIL || 'noreply@training.de';

    // E-Mail senden
    await sesClient.send(new SendEmailCommand({
      Source: fromEmail,
      Destination: { ToAddresses: verwalterEmails },
      Message: {
        Subject: { Data: 'Passwort-Reset-Anfrage – Tennis Training', Charset: 'UTF-8' },
        Body: {
          Text: {
            Data: `Hallo,\n\n${spieler.vorname} ${spieler.name} (${email}) hat eine Passwort-Reset-Anfrage gestellt.\n\nBitte setze das Passwort in der Spieler-Verwaltung zurück:\n${process.env.FRONTEND_URL || 'https://tennis-training.vercel.app'}/admin/spieler\n\nViele Grüße,\nTennis-Trainings-Runden System`,
            Charset: 'UTF-8',
          },
        },
      },
    }));

    // In-App-Benachrichtigung für jeden Verwalter/Admin
    const now = new Date().toISOString();
    for (const u of verwalterUsers) {
      const pk = u.PK as string; // TRAINING_USER#<uuid>
      const userId = pk.replace('TRAINING_USER#', '');
      await putItem({
        PK: `TRAINING_BENACHRICHTIGUNG#${userId}`,
        SK: `${now}#pw-reset-req#${spieler.PK}`,
        GSI1PK: `TRAINING_BENACHRICHTIGUNG_UNGELESEN#${userId}`,
        GSI1SK: now,
        spielerId: userId,
        typ: 'pw_reset_anfrage',
        titel: '🔑 Passwort-Reset-Anfrage',
        nachricht: `${spieler.vorname} ${spieler.name} (${email}) bittet um Passwort-Reset.`,
        gelesen: false,
        createdAt: now,
        entityType: 'TRAINING_BENACHRICHTIGUNG',
      });
    }

    return successResponse({ message: 'Anfrage gesendet' });
  } catch (error) {
    console.error('Passwort-vergessen error:', error);
    // Auch bei Fehlern gleiche Antwort (Security)
    return successResponse({ message: 'Anfrage gesendet' });
  }
}
