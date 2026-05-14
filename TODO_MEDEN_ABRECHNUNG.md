# Meden-Abrechnung — Feature-Spec

## Überblick

Jeder Mannschaftsführer (MF) verwaltet die Abrechnung seiner Mannschaft über die Saison.
Pro Spieltag gibt der MF die Kosten ein, die auf die Spieler der Aufstellung verteilt werden.

## Kostenarten

### Bälle (nur Heimspiele)
- 6 Einzel × 3 Bälle = 18 Bälle (gleiche werden im Doppel genutzt)
- MF gibt Gesamtpreis ein
- Wird durch Anzahl Spieler in der Aufstellung geteilt

### Essen (Heimspiele)
- Essen für eigene Mannschaft + Gäste
- MF gibt Gesamtbetrag ein
- Wird durch Anzahl Spieler in der Aufstellung geteilt

### Getränke / Gästerunde (Auswärtsspiele)
- Gästerunde die man den Gegnern ausgibt
- MF gibt Gesamtbetrag ein
- Wird durch Anzahl Spieler in der Aufstellung geteilt

### Eigener Deckel (optional)
- Sonstige Kosten die auf die Spieler verteilt werden
- MF gibt Betrag + Beschreibung ein

## Verteilung

- Kosten werden IMMER durch die Anzahl der Spieler in der Aufstellung geteilt
- Aufstellung kann 6, 7 oder 8 Spieler haben (Doppel-Besetzung variiert)
- Die Aufstellung kommt aus dem bestehenden MEDEN_AUFSTELLUNG-Datensatz

## Belege

- Optional: Foto des Belegs hochladen (S3)
- Pre-signed URL für Upload
- Beleg ist für alle Spieler der Mannschaft einsehbar

## Berechtigungen

- MF der jeweiligen Mannschaft: Kosten eingeben, Belege hochladen
- Verwalter/Admin: Alles sehen und bearbeiten
- Spieler: Eigenen Saldo sehen, Belege einsehen

## Datenmodell (DynamoDB)

```
PK: MEDEN_ABRECHNUNG#{spieltagId}
SK: KOSTEN#{uuid}
Felder:
  - spieltagId
  - mannschaft (1-4)
  - kategorie: 'baelle' | 'essen' | 'getraenke' | 'sonstiges'
  - betrag (Gesamtbetrag)
  - beschreibung (optional, z.B. "5 Dosen Head Tour")
  - belegUrl (optional, S3-URL)
  - anzahlSpieler (aus Aufstellung)
  - anteilProSpieler (berechnet: betrag / anzahlSpieler)
  - erfasstVon (MF userId)
  - createdAt
  entityType: 'MEDEN_ABRECHNUNG'
```

## API-Endpoints

- `POST /meden/abrechnung/{spieltagId}` — Kosten erfassen (MF)
- `GET /meden/abrechnung/{spieltagId}` — Kosten eines Spieltags
- `GET /meden/abrechnung/saldo/{mannschaft}` — Saldo aller Spieler einer Mannschaft
- `GET /meden/abrechnung/mein-saldo` — Eigener Saldo (Spieler)
- `POST /meden/abrechnung/upload-url` — Pre-signed S3 Upload-URL
- `DELETE /meden/abrechnung/{spieltagId}/{kostenId}` — Kosten löschen (MF)

## Infrastruktur

- S3-Bucket für Belege (im template.yaml)
- Lambda mit S3-Zugriff für Pre-signed URLs
- Lifecycle-Rule: Belege nach 2 Jahren löschen (optional)

## Frontend

- Neue Seite: `/meden/abrechnung`
  - MF: Kosten-Eingabe pro Spieltag, Beleg-Upload, Gesamtübersicht
  - Spieler: Eigener Saldo, Beleg-Einsicht
- Navigation: Link "Abrechnung" für MF + Spieler mit Aufstellung
