import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { successResponse, errorResponse } from '../utils/response';
import { getItem, putItem, queryItems, deleteItem } from '../utils/dynamodb';

export async function berechneZuweisung(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const rolle = event.requestContext.authorizer?.rolle;
    if (rolle !== 'trainings_verwalter' && rolle !== 'admin') {
      return errorResponse('Nicht autorisiert', 403);
    }

    if (!event.body) return errorResponse('Request body required');
    const { slotId } = JSON.parse(event.body);
    if (!slotId) return errorResponse('slotId erforderlich');

    const slot = await getItem(`TRAINING_SLOT#${slotId}`, 'METADATA');
    if (!slot) return errorResponse('Slot nicht gefunden', 404);

    const platz = await getItem(`TRAINING_PLATZ#${slot.platzId}`, 'METADATA');
    if (!platz) return errorResponse('Platz nicht gefunden', 404);

    const aktiverPlatz = platz.aktiverPlatz as number;
    const platzId = platz.id as string;
    const saisonId = slot.saisonId as string;

    // 1. Load group members
    const members = await queryItems(`TRAINING_PLATZ#${platzId}`, 'GRUPPE#');
    const memberIds = members.map(m => m.spielerId as string);

    // 2. Load availability for this slot
    const verfuegbarkeiten = await queryItems(`TRAINING_SLOT#${slotId}`, 'VERFUEGBAR#');
    const nichtVerfuegbar = new Set(
      verfuegbarkeiten
        .filter(v => v.status === 'nicht_verfuegbar')
        .map(v => v.spielerId as string)
    );

    // 3. Filter available players (default = verfuegbar)
    const verfuegbar = memberIds.filter(id => !nichtVerfuegbar.has(id));

    if (verfuegbar.length === 0) {
      return successResponse({ zuweisungen: [], warnung: 'Keine verfügbaren Spieler' });
    }

    // 4. Load Stundenkonten
    const stundenkonten = await queryItems(
      `TRAINING_STUNDENKONTO#${saisonId}#${platzId}`
    );
    const stundenMap = new Map<string, number>();
    for (const sk of stundenkonten) {
      stundenMap.set(sk.spielerId as string, sk.stunden as number);
    }

    // 5. Sort: lowest hours first, random tiebreak
    const sorted = verfuegbar
      .map(id => ({ id, stunden: stundenMap.get(id) || 0 }))
      .sort((a, b) => a.stunden - b.stunden || Math.random() - 0.5);

    // 6. Select top N players
    const selected = sorted.slice(0, aktiverPlatz);
    const now = new Date().toISOString();

    // 7. Clear existing auto-assignments
    const existing = await queryItems(`TRAINING_SLOT#${slotId}`, 'ZUWEISUNG#');
    for (const z of existing) {
      if (!z.manuell) {
        await deleteItem(`TRAINING_SLOT#${slotId}`, `ZUWEISUNG#${z.spielerId}`);
      }
    }

    // 8. Create assignments
    const zuweisungen = [];
    for (const s of selected) {
      const spieler = await getItem(`TRAINING_SPIELER#${s.id}`, 'METADATA');
      const spielerName = spieler ? `${spieler.vorname} ${spieler.name}` : s.id;

      await putItem({
        PK: `TRAINING_SLOT#${slotId}`, SK: `ZUWEISUNG#${s.id}`,
        GSI2PK: `TRAINING_SPIELER_ZUWEISUNGEN#${s.id}`,
        GSI2SK: slot.datum as string,
        slotId, spielerId: s.id, spielerName,
        manuell: false, halbeBeteiligung: false,
        createdAt: now,
        entityType: 'TRAINING_ZUWEISUNG',
      });

      // Create notification
      await putItem({
        PK: `TRAINING_BENACHRICHTIGUNG#${s.id}`,
        SK: `${now}#zuweisung`,
        GSI1PK: `TRAINING_BENACHRICHTIGUNG_UNGELESEN#${s.id}`,
        GSI1SK: now,
        spielerId: s.id, typ: 'zuweisung',
        titel: 'Neue Trainingszuweisung',
        nachricht: `Du wurdest für ${slot.datum} ${slot.uhrzeit} eingeteilt.`,
        gelesen: false, slotId,
        createdAt: now,
        entityType: 'TRAINING_BENACHRICHTIGUNG',
      });

      zuweisungen.push({ spielerId: s.id, spielerName, stunden: s.stunden });
    }

    // Update slot status
    await putItem({ ...slot, status: 'zugewiesen', updatedAt: now });

    // Engpass warning
    const warnung = selected.length < aktiverPlatz
      ? `Nur ${selected.length} von ${aktiverPlatz} Plätzen besetzt`
      : undefined;

    return successResponse({ zuweisungen, warnung });
  } catch (error) {
    console.error('Berechne zuweisung error:', error);
    return errorResponse('Internal server error', 500);
  }
}

export async function getSlotZuweisungen(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const slotId = event.pathParameters?.slotId;
    if (!slotId) return errorResponse('Slot ID erforderlich');

    const items = await queryItems(`TRAINING_SLOT#${slotId}`, 'ZUWEISUNG#');
    return successResponse(items);
  } catch (error) {
    console.error('Get zuweisungen error:', error);
    return errorResponse('Internal server error', 500);
  }
}

export async function schliesseSlotAb(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const rolle = event.requestContext.authorizer?.rolle;
    if (rolle !== 'trainings_verwalter' && rolle !== 'admin') {
      return errorResponse('Nicht autorisiert', 403);
    }

    const slotId = event.pathParameters?.slotId;
    if (!slotId) return errorResponse('Slot ID erforderlich');

    const slot = await getItem(`TRAINING_SLOT#${slotId}`, 'METADATA');
    if (!slot) return errorResponse('Slot nicht gefunden', 404);

    const platzId = slot.platzId as string;
    const saisonId = slot.saisonId as string;
    const dauer = slot.dauer as number;
    const hallengebuehr = slot.hallengebuehr as number;
    const trainerkosten = slot.trainerkosten as number | null;
    const now = new Date().toISOString();

    // Get assignments
    const zuweisungen = await queryItems(`TRAINING_SLOT#${slotId}`, 'ZUWEISUNG#');
    const spielendeIds = zuweisungen.map(z => z.spielerId as string);

    // Update Stundenkonten
    for (const spielerId of spielendeIds) {
      const sk = await getItem(`TRAINING_STUNDENKONTO#${saisonId}#${platzId}`, `SPIELER#${spielerId}`);
      const current = sk || { saisonId, platzId, spielerId, stunden: 0, anzahlSlots: 0 };
      await putItem({
        PK: `TRAINING_STUNDENKONTO#${saisonId}#${platzId}`,
        SK: `SPIELER#${spielerId}`,
        ...current,
        stunden: (current.stunden as number) + dauer,
        anzahlSlots: (current.anzahlSlots as number) + 1,
        updatedAt: now,
        entityType: 'TRAINING_STUNDENKONTO',
      });
    }

    // Kostenverteilung
    const members = await queryItems(`TRAINING_PLATZ#${platzId}`, 'GRUPPE#');
    const anzahlSpielende = spielendeIds.length || 1;
    const hallenAnteil = hallengebuehr / anzahlSpielende;

    // Hallengebühren auf Spielende verteilen
    for (const spielerId of spielendeIds) {
      await updateKostenkonto(saisonId, platzId, spielerId, hallenAnteil, 0, now);
    }

    // Trainerkosten solidarisch auf alle Gruppenmitglieder
    if (trainerkosten && trainerkosten > 0) {
      const anzahlMitglieder = members.length || 1;
      const trainerAnteil = trainerkosten / anzahlMitglieder;
      for (const m of members) {
        await updateKostenkonto(saisonId, platzId, m.spielerId as string, 0, trainerAnteil, now);
      }
    }

    // Mark slot as completed
    await putItem({ ...slot, status: 'abgeschlossen', updatedAt: now });

    return successResponse({ message: 'Slot abgeschlossen', spielende: spielendeIds.length });
  } catch (error) {
    console.error('Schliesse slot ab error:', error);
    return errorResponse('Internal server error', 500);
  }
}

export async function toggleZuweisung(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const userId = event.requestContext.authorizer?.userId;
    if (!userId) return errorResponse('Nicht autorisiert', 401);

    const slotId = event.pathParameters?.slotId;
    const spielerId = event.pathParameters?.spielerId;
    if (!slotId || !spielerId) return errorResponse('Slot ID und Spieler ID erforderlich');

    const slot = await getItem(`TRAINING_SLOT#${slotId}`, 'METADATA');
    if (!slot) return errorResponse('Slot nicht gefunden', 404);

    const existing = await getItem(`TRAINING_SLOT#${slotId}`, `ZUWEISUNG#${spielerId}`);
    const now = new Date().toISOString();

    if (existing) {
      // Remove assignment
      await deleteItem(`TRAINING_SLOT#${slotId}`, `ZUWEISUNG#${spielerId}`);
      return successResponse({ action: 'removed' });
    } else {
      // Add assignment
      const spieler = await getItem(`TRAINING_SPIELER#${spielerId}`, 'METADATA');
      const spielerName = spieler ? `${spieler.vorname} ${spieler.name}` : spielerId;

      await putItem({
        PK: `TRAINING_SLOT#${slotId}`, SK: `ZUWEISUNG#${spielerId}`,
        GSI2PK: `TRAINING_SPIELER_ZUWEISUNGEN#${spielerId}`,
        GSI2SK: slot.datum as string,
        slotId, spielerId, spielerName,
        manuell: true, halbeBeteiligung: false,
        createdAt: now,
        entityType: 'TRAINING_ZUWEISUNG',
      });
      return successResponse({ action: 'added' });
    }
  } catch (error) {
    console.error('Toggle zuweisung error:', error);
    return errorResponse('Internal server error', 500);
  }
}


async function updateKostenkonto(
  saisonId: string, platzId: string, spielerId: string,
  hallenBetrag: number, trainerBetrag: number, now: string
) {
  const kk = await getItem(
    `TRAINING_KOSTENKONTO#${saisonId}#${platzId}`,
    `SPIELER#${spielerId}`
  );
  const current = kk || {
    saisonId, platzId, spielerId,
    hallengebuehren: 0, trainerkosten: 0, gesamtkosten: 0, anzahlSlots: 0,
  };

  const newHallen = (current.hallengebuehren as number) + hallenBetrag;
  const newTrainer = (current.trainerkosten as number) + trainerBetrag;

  await putItem({
    PK: `TRAINING_KOSTENKONTO#${saisonId}#${platzId}`,
    SK: `SPIELER#${spielerId}`,
    ...current,
    hallengebuehren: Math.round(newHallen * 100) / 100,
    trainerkosten: Math.round(newTrainer * 100) / 100,
    gesamtkosten: Math.round((newHallen + newTrainer) * 100) / 100,
    anzahlSlots: (current.anzahlSlots as number) + (hallenBetrag > 0 ? 1 : 0),
    updatedAt: now,
    entityType: 'TRAINING_KOSTENKONTO',
  });
}
