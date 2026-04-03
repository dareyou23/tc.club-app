# Club-App Konsolidierung V2 — Lessons Learned & Neustart

## Was schiefgelaufen ist (V1)

Der erste Ansatz war: Meden-Team-Manager leeren, alles neu schreiben, Code aus beiden Apps "inspiriert" übernehmen. Das hat zu folgenden Problemen geführt:

1. **Frontend Auth komplett kaputt**: Login funktionierte, aber API-Calls nach Navigation bekamen 403. Token wurde in localStorage gespeichert, aber nicht korrekt gelesen.
2. **Ursache**: Statt den funktionierenden Auth-Flow der Trainings-App 1:1 zu kopieren, wurde er "neu interpretiert" — andere localStorage-Keys, andere Modul-Struktur, anderer AuthContext.
3. **CORS-Probleme**: Template.yaml wurde neu geschrieben statt aus der funktionierenden Trainings-App kopiert.
4. **GSI-Query-Bugs**: Falsche Key-Expressions bei GSI-Queries.
5. **Next.js Version**: Club-App hatte 15.x, Trainings-App 16.x.

## Kernlektion

**Wenn etwas funktioniert, kopiere es 1:1. Nicht "inspiriert übernehmen", nicht "neu interpretieren". KOPIEREN.**

---

## Neuer Ansatz: Trainings-App als Basis

1. Trainings-App 1:1 in tc.club-app kopieren (backend + frontend)
2. Umbenennen (Package-Namen, Tabellennamen, SAM-Stack)
3. Verifizieren dass alles funktioniert wie in der Trainings-App
4. Rollen erweitern (mannschaftsfuehrer, club_manager)
5. Meden-Module dazubauen (Spieltage, Verfügbarkeit, Aufstellung, Einsatz, ICS)
6. Spieler-Modell erweitern (LK, Setzliste, Stammmannschaft)
7. Spieler-Import + Migration später wenn App fertig

## Rahmenbedingungen

- Tennis-Trainings-Runden und Meden-Saison bleiben produktiv und unverändert
- Spieltage sind in Meden-Saison (werden migriert)
- Spieler sind noch Vorsaison — Aktualisierung wenn Sommersaison-Meldeliste da ist
- Entwicklungsumgebung: macOS, Node.js 25.6.1, Next.js 16.x, React 19.x, AWS eu-central-1
