export type TrainingRolle = 'spieler' | 'trainings_verwalter' | 'club_manager' | 'admin';
export type Buchungsmodus = 'faire_verteilung' | 'spontan_anmeldung';
export type PlatzTyp = 'training' | 'saisonplanung';
export type SlotStatus = 'offen' | 'zugewiesen' | 'abgeschlossen' | 'ausgefallen';

export interface TrainingUser {
  id: string;
  email: string;
  name: string;
  vorname: string;
  rolle: TrainingRolle;
  aktiv: boolean;
  mannschaftsfuehrer?: boolean;
  kern?: number | null;
  passwordChangeRequired: boolean;
  passwordResetRequired?: boolean;
}

export interface TrainingSaison {
  id: string;
  name: string;
  typ: 'winter' | 'sommer';
  startDatum: string;
  endDatum: string;
  status: 'aktiv' | 'archiviert' | 'geplant';
}

export interface Hallenplatz {
  id: string;
  saisonId: string;
  name: string;
  wochentag: number;
  uhrzeit: string;
  uhrzeitBis?: string;
  dauer: number;
  ort: string;
  hallengebuehr: number;
  trainerkosten: number | null;
  trainerName?: string;
  platzTyp: PlatzTyp;
  buchungsmodus: Buchungsmodus;
  aktiverPlatz: number;
  gruppengroesse: number;
}

export interface TrainingsSlot {
  id: string;
  platzId: string;
  datum: string;
  uhrzeit: string;
  dauer: number;
  status: SlotStatus;
  buchungsmodus: Buchungsmodus;
  hallengebuehr: number;
  trainerkosten: number | null;
}

export interface ApiResponse<T = undefined> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}
