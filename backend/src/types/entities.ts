// Rollen
export type TrainingRolle = 'spieler' | 'trainings_verwalter' | 'club_manager' | 'admin';

// Saison
export type SaisonTyp = 'winter' | 'sommer';
export type SaisonStatus = 'aktiv' | 'archiviert' | 'geplant';

// Buchungsmodus
export type Buchungsmodus = 'faire_verteilung' | 'spontan_anmeldung';

// Platz-Typ
export type PlatzTyp = 'training' | 'saisonplanung';

// Slot-Status
export type SlotStatus = 'offen' | 'zugewiesen' | 'abgeschlossen' | 'ausgefallen';

// Verfügbarkeit
export type VerfuegbarkeitStatus = 'verfuegbar' | 'nicht_verfuegbar';

// Benachrichtigungs-Typ
export type BenachrichtigungTyp = 'zuweisung' | 'engpass' | 'aenderung';

// --- Entitäten ---

export interface TrainingSpieler {
  id: string;
  name: string;
  vorname: string;
  email: string;
  rolle: TrainingRolle;
  aktiv: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TrainingUser {
  id: string;
  email: string;
  password: string;
  rolle: TrainingRolle;
  passwordChangeRequired: boolean;
  aktiv: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TrainingSaison {
  id: string;
  name: string;
  typ: SaisonTyp;
  startDatum: string;
  endDatum: string;
  status: SaisonStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Hallenplatz {
  id: string;
  saisonId: string;
  name: string;
  wochentag: number; // 0=Mo ... 6=So
  uhrzeit: string;   // HH:MM
  dauer: number;     // Minuten
  ort: string;
  hallengebuehr: number;
  trainerkosten: number | null;
  buchungsmodus: Buchungsmodus;
  platzTyp: PlatzTyp;
  aktiverPlatz: number;
  gruppengroesse: number;
  createdAt: string;
  updatedAt: string;
}

export interface GruppeMitglied {
  platzId: string;
  spielerId: string;
  spielerName: string;
  beigetretenAm: string;
}

export interface TrainingsSlot {
  id: string;
  platzId: string;
  saisonId: string;
  datum: string;
  wochentag: number;
  uhrzeit: string;
  dauer: number;
  hallengebuehr: number;
  trainerkosten: number | null;
  status: SlotStatus;
  buchungsmodus: Buchungsmodus;
  createdAt: string;
  updatedAt: string;
}

export interface Verfuegbarkeit {
  slotId: string;
  spielerId: string;
  status: VerfuegbarkeitStatus;
  updatedAt: string;
}

export interface Zuweisung {
  slotId: string;
  spielerId: string;
  spielerName: string;
  manuell: boolean;
  halbeBeteiligung: boolean;
  createdAt: string;
}

export interface Stundenkonto {
  saisonId: string;
  platzId: string;
  spielerId: string;
  stunden: number; // Minuten
  anzahlSlots: number;
  updatedAt: string;
}

export interface Kostenkonto {
  saisonId: string;
  platzId: string;
  spielerId: string;
  hallengebuehren: number;
  trainerkosten: number;
  gesamtkosten: number;
  anzahlSlots: number;
  updatedAt: string;
}

export interface Benachrichtigung {
  spielerId: string;
  typ: BenachrichtigungTyp;
  titel: string;
  nachricht: string;
  gelesen: boolean;
  slotId: string | null;
  createdAt: string;
}

export interface SpontanAnmeldung {
  slotId: string;
  spielerId: string;
  spielerName: string;
  halbeBeteiligung: boolean;
  angemeldetAm: string;
}
