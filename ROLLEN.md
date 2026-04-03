# Rollen in der Club-App

## Spieler (Basis-Rolle, jeder hat sie)
- Eigene Verfügbarkeit für Spieltage melden (ja/nein/vielleicht)
- Eigene Kernmannschaft-Spieltage priorisiert sehen
- Eigenes Profil bearbeiten (Email, Telefon)
- Trainings-Termine sehen, Spontan-Anmeldung
- Eigenes Stunden-/Kostenkonto einsehen
- Benachrichtigungen empfangen

## Mannschaftsführer (MF) — pro Mannschaft einer
- Alles was Spieler können, plus:
- Spieler-Verwaltung sehen (Liste, aber kein Anlegen/Löschen)
- PW Reset für Spieler durchführen
- Aufstellung für seine Kernmannschaft erstellen
- Verfügbarkeits-Matrix seiner Mannschaft sehen (wer hat ja/nein/vielleicht gemeldet)
- Alle Einsätze über ALLE Mannschaften sehen (für Festspiel-Tracking)
- Festspiel-Warnungen sehen (Spieler X hat 2/3 Einsätze in M2)
- Nachrichten an seine Mannschaft senden

## Trainings-Verwalter
- Alles was Spieler können, plus:
- Trainingsplätze verwalten (CRUD)
- Zuweisungen bearbeiten
- Spieler-Verwaltung (anlegen, bearbeiten, PW setzen)
- Nachrichten an Trainingsgruppen senden

## Club Manager
- Alles was MF können, plus:
- Spieler bearbeiten (Name, Email, Rolle)
- Trainierende anlegen (Spieler ohne Rang/Setzliste — reine Trainings-Teilnehmer)
- NICHT: Meden-Spieler anlegen (kommt über Verbandslisten-Import durch Admin)
- PW setzen / PW Reset
- MF-Checkbox setzen
- Kern-Mannschaft setzen
- Trainingsplätze verwalten (CRUD)
- Zuweisungen bearbeiten
- Aufstellung für ALLE Mannschaften
- Verfügbarkeits-Matrix alle Mannschaften
- Festspiel-Übersicht
- Nachrichten senden
- Letzter-Login Spalte sehen
- NICHT: Impersonate
- NICHT: Spieler löschen

## Admin (app_manager)
- Alles was alle anderen können
- Impersonate (als anderer Spieler einloggen)
- Rollen vergeben (MF-Checkbox, Kern-Mannschaft)
- Spieler löschen
- Unsichtbar für andere Rollen in der Spielerliste

## Zusammenspiel MF + Kern
- MF-Flag wird in der Spieler-Verwaltung per Checkbox gesetzt
- Die Kernmannschaft (M1-M4) bestimmt FÜR WELCHE Mannschaft der MF zuständig ist
- Beispiel: Markus Wages hat MF=true und Kern=M4 → ist Mannschaftsführer der 4. Mannschaft
- Ein Spieler kann MF sein ohne Kern (dann sieht er alle Mannschaften)
- Pro Mannschaft sollte nur ein MF gesetzt sein (wird nicht technisch erzwungen)
