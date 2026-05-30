import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { successResponse, errorResponse } from '../utils/response';
import { queryItems, putItem, deleteItem, getItem, docClient, TABLE_NAME } from '../utils/dynamodb';
import { isAuthenticated, isVerwalterOrAdmin, getSpielerIdFromEvent } from '../utils/auth-helpers';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';

type Kategorie = 'baelle' | 'essen' | 'getraenke' | 'sonstiges';

interface KostenEintrag {
  PK: string;
  SK: string;
  spieltagId: string;
  mannschaft: number;
  kategorie: Kategorie;
  betrag: number;
  beschreibung?: string;
  anzahlSpieler: number;
  anteilProSpieler: number;
  erfasstVon: string;
  entityType: 'MEDEN_ABRECHNUNG';
  createdAt: string;
}

// POST /meden/abrechnung/{spieltagId} — Kosten erfassen
export async function createAbrechnung(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const userId = getSpielerIdFromEvent(event);
    if (!userId) return errorResponse('Nicht autorisiert', 403);

    // MF oder Verwalter/Admin
    const istVerwalter = isVerwalterOrAdmin(event);
    if (!istVerwalter) {
      const sp = await getItem(`TRAINING_SPIELER#${userId}`, 'METADATA');
      if (!sp?.mannschaftsfuehrer) return errorResponse('Nur Mannschaftsführer oder Verwalter', 403);
    }

    const spieltagId = event.pathParameters?.spieltagId;
    if (!spieltagId || !event.body) return errorResponse('spieltagId und Body erforderlich');

    const body = JSON.parse(event.body);
    const { kategorie, betrag, beschreibung } = body as {
      kategorie: Kategorie;
      betrag: number;
      beschreibung?: string;
    };

    // Validierung
    const gueltigeKategorien: Kategorie[] = ['baelle', 'essen', 'getraenke', 'sonstiges'];
    if (!kategorie || !gueltigeKategorien.includes(kategorie)) {
      return errorResponse('Ungültige Kategorie. Erlaubt: baelle, essen, getraenke, sonstiges');
    }
    if (!betrag || typeof betrag !== 'number' || betrag <= 0) {
      return errorResponse('Betrag muss eine positive Zahl sein');
    }
    if (kategorie === 'sonstiges' && !beschreibung) {
      return errorResponse('Beschreibung ist bei Kategorie "sonstiges" erforderlich');
    }

    // Spieltag laden um Mannschaft zu bestimmen
    const spieltagItems = await queryItems(`MEDEN_SPIELTAG#${spieltagId}`, 'METADATA');
    if (!spieltagItems.length) return errorResponse('Spieltag nicht gefunden', 404);
    const spieltag = spieltagItems[0];
    const mannschaft = spieltag.mannschaft as number;

    // Aufstellung laden um Anzahl Spieler zu bestimmen
    const aufstellung = await queryItems(`MEDEN_SPIELTAG#${spieltagId}`, 'AUFSTELLUNG#');
    const anzahlSpieler = aufstellung.length;
    if (anzahlSpieler === 0) {
      return errorResponse('Keine Aufstellung für diesen Spieltag vorhanden. Bitte zuerst Aufstellung setzen.');
    }

    const anteilProSpieler = Math.round((betrag / anzahlSpieler) * 100) / 100;
    const kostenId = uuidv4();
    const now = new Date().toISOString();

    const item: KostenEintrag = {
      PK: `MEDEN_ABRECHNUNG#${spieltagId}`,
      SK: `KOSTEN#${kostenId}`,
      spieltagId,
      mannschaft,
      kategorie,
      betrag,
      beschreibung: beschreibung || undefined,
      anzahlSpieler,
      anteilProSpieler,
      erfasstVon: userId,
      entityType: 'MEDEN_ABRECHNUNG',
      createdAt: now,
    };

    await putItem(item as unknown as Record<string, unknown>);

    return successResponse(item, 201);
  } catch (error) {
    console.error('Create abrechnung error:', error);
    return errorResponse('Internal server error', 500);
  }
}

// GET /meden/abrechnung/{spieltagId} — Kosten eines Spieltags
export async function getAbrechnung(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    if (!isAuthenticated(event)) return errorResponse('Nicht autorisiert', 403);

    const spieltagId = event.pathParameters?.spieltagId;
    if (!spieltagId) return errorResponse('spieltagId fehlt');

    const items = await queryItems(`MEDEN_ABRECHNUNG#${spieltagId}`, 'KOSTEN#');
    return successResponse(items);
  } catch (error) {
    console.error('Get abrechnung error:', error);
    return errorResponse('Internal server error', 500);
  }
}

// DELETE /meden/abrechnung/{spieltagId}/{kostenId} — Kosten löschen
export async function deleteAbrechnung(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const userId = getSpielerIdFromEvent(event);
    if (!userId) return errorResponse('Nicht autorisiert', 403);

    const istVerwalter = isVerwalterOrAdmin(event);
    if (!istVerwalter) {
      const sp = await getItem(`TRAINING_SPIELER#${userId}`, 'METADATA');
      if (!sp?.mannschaftsfuehrer) return errorResponse('Nur Mannschaftsführer oder Verwalter', 403);
    }

    const spieltagId = event.pathParameters?.spieltagId;
    const kostenId = event.pathParameters?.kostenId;
    if (!spieltagId || !kostenId) return errorResponse('spieltagId und kostenId erforderlich');

    // Prüfen ob Eintrag existiert
    const item = await getItem(`MEDEN_ABRECHNUNG#${spieltagId}`, `KOSTEN#${kostenId}`);
    if (!item) return errorResponse('Kosteneintrag nicht gefunden', 404);

    // Nur eigene Einträge löschen (außer Verwalter)
    if (!istVerwalter && item.erfasstVon !== userId) {
      return errorResponse('Nur eigene Einträge können gelöscht werden', 403);
    }

    await deleteItem(`MEDEN_ABRECHNUNG#${spieltagId}`, `KOSTEN#${kostenId}`);
    return successResponse({ deleted: true });
  } catch (error) {
    console.error('Delete abrechnung error:', error);
    return errorResponse('Internal server error', 500);
  }
}

// GET /meden/abrechnung/saldo/{mannschaft} — Saldo aller Spieler einer Mannschaft
export async function getSaldo(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    if (!isAuthenticated(event)) return errorResponse('Nicht autorisiert', 403);

    const mannschaftStr = event.pathParameters?.mannschaft;
    if (!mannschaftStr) return errorResponse('mannschaft fehlt');
    const mannschaft = parseInt(mannschaftStr);
    if (isNaN(mannschaft) || mannschaft < 1 || mannschaft > 4) {
      return errorResponse('Mannschaft muss 1-4 sein');
    }

    // Alle Abrechnungen laden
    const alleAbr = await docClient.send(new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: 'entityType = :t AND mannschaft = :m',
      ExpressionAttributeValues: { ':t': 'MEDEN_ABRECHNUNG', ':m': mannschaft },
    }));

    // Alle Aufstellungen für die betroffenen Spieltage laden
    const spieltagIds = [...new Set((alleAbr.Items || []).map(i => i.spieltagId as string))];
    const spielerSaldo: Record<string, { spielerId: string; name: string; betrag: number; details: any[] }> = {};

    for (const spieltagId of spieltagIds) {
      const aufstellung = await queryItems(`MEDEN_SPIELTAG#${spieltagId}`, 'AUFSTELLUNG#');
      const kosten = (alleAbr.Items || []).filter(i => i.spieltagId === spieltagId);

      // Gesamtkosten für diesen Spieltag
      const gesamtKosten = kosten.reduce((sum, k) => sum + (k.betrag as number), 0);
      const anzahlSpieler = aufstellung.length;
      if (anzahlSpieler === 0) continue;
      const anteilProSpieler = Math.round((gesamtKosten / anzahlSpieler) * 100) / 100;

      for (const a of aufstellung) {
        const spielerId = a.spielerId as string;
        if (!spielerSaldo[spielerId]) {
          // Spieler-Name laden
          const sp = await getItem(`TRAINING_SPIELER#${spielerId}`, 'METADATA');
          spielerSaldo[spielerId] = {
            spielerId,
            name: sp ? `${sp.vorname} ${sp.name}` : spielerId,
            betrag: 0,
            details: [],
          };
        }
        spielerSaldo[spielerId].betrag += anteilProSpieler;
        spielerSaldo[spielerId].details.push({
          spieltagId,
          anteil: anteilProSpieler,
          gesamt: gesamtKosten,
          anzahlSpieler,
        });
      }
    }

    // Beträge runden
    const result = Object.values(spielerSaldo).map(s => ({
      ...s,
      betrag: Math.round(s.betrag * 100) / 100,
    }));

    return successResponse(result);
  } catch (error) {
    console.error('Get saldo error:', error);
    return errorResponse('Internal server error', 500);
  }
}

// GET /meden/abrechnung/mein-saldo — Eigener Saldo
export async function getMeinSaldo(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const userId = getSpielerIdFromEvent(event);
    if (!userId) return errorResponse('Nicht autorisiert', 403);

    // Alle Aufstellungen des Spielers finden
    const meineEinsaetze = await docClient.send(new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: 'entityType = :t AND spielerId = :s',
      ExpressionAttributeValues: { ':t': 'MEDEN_AUFSTELLUNG', ':s': userId },
    }));

    if (!meineEinsaetze.Items?.length) return successResponse({ gesamt: 0, details: [] });

    const details: any[] = [];
    let gesamt = 0;

    for (const einsatz of meineEinsaetze.Items) {
      const spieltagId = einsatz.spieltagId as string;

      // Kosten für diesen Spieltag
      const kosten = await queryItems(`MEDEN_ABRECHNUNG#${spieltagId}`, 'KOSTEN#');
      if (!kosten.length) continue;

      // Aufstellung für Spieleranzahl
      const aufstellung = await queryItems(`MEDEN_SPIELTAG#${spieltagId}`, 'AUFSTELLUNG#');
      const anzahlSpieler = aufstellung.length;
      if (anzahlSpieler === 0) continue;

      const gesamtKosten = kosten.reduce((sum, k) => sum + (k.betrag as number), 0);
      const meinAnteil = Math.round((gesamtKosten / anzahlSpieler) * 100) / 100;

      gesamt += meinAnteil;
      details.push({
        spieltagId,
        mannschaft: einsatz.mannschaft,
        gesamtKosten,
        anzahlSpieler,
        meinAnteil,
        kategorien: kosten.map(k => ({
          kategorie: k.kategorie,
          betrag: k.betrag,
          anteil: Math.round(((k.betrag as number) / anzahlSpieler) * 100) / 100,
        })),
      });
    }

    return successResponse({
      gesamt: Math.round(gesamt * 100) / 100,
      details,
    });
  } catch (error) {
    console.error('Get mein saldo error:', error);
    return errorResponse('Internal server error', 500);
  }
}
