# 🎾 Tennis-Trainings-Runden

Webanwendung zur Organisation von Hallenplatz-Trainings für einen Tennisverein. Spieler können ihre Verfügbarkeit eintragen, Verwalter organisieren Plätze, Gruppen und Zuweisungen.

**Stand:** 22.03.2026

---

## Saisons

Saisons können sich überlappen:
- **Winter (Halle):** Letzter Freitag im September → 30. April nächstes Jahr
- **Sommer (Außen):** 1. April → Tag vor letztem Freitag im September

Im April laufen beide Saisons parallel (Halle + Außen). Die automatische Saison-Erstellung (`berechneSaisons`) berücksichtigt diese Überlappung.

---

## Architektur

```
Frontend (Next.js)  →  API Gateway  →  Lambda (Node.js 22)  →  DynamoDB
     Vercel              AWS SAM          TypeScript              Single-Table
```

- **Frontend:** Next.js (App Router), React, Tailwind CSS, auf Vercel (geplant)
- **Backend:** AWS SAM, Lambda (arm64), API Gateway REST, Node.js 22
- **Datenbank:** DynamoDB Single-Table-Design mit GSI1 + GSI2
- **Auth:** JWT (1h Access + 30d Refresh), Custom Lambda Authorizer
- **E-Mail:** AWS SES (Passwort-vergessen-Benachrichtigung)
- **Region:** eu-central-1
- **Stack:** `tennis-trainings-runden`

---

## Rollen

| Rolle | Beschreibung |
|---|---|
| `admin` | Unsichtbarer Superadmin (`admin@training.de`). Voller Zugriff inkl. Impersonierung und Saison-Verwaltung. |
| `trainings_verwalter` | Sichtbarer Admin für den Tagesbetrieb. Spieler-, Platz- und Gruppenverwaltung. Kann Superadmin nicht sehen/bearbeiten. |
| `spieler` | Normaler Teilnehmer. Verfügbarkeit eintragen, Termine sehen, Zuweisungen togglen. |

---

## Auth-Flows

### Login
`POST /auth/login` → JWT Access-Token (1h) + Refresh-Token (30d)

### Erstanmeldung (neuer Spieler)
Login mit generiertem PW → `passwordChangeRequired: true` → Redirect auf `/passwort-aendern`
→ Spieler muss neue E-Mail + Telefon + neues Passwort eingeben (`POST /auth/erstanmeldung`)

### PW-Reset durch Verwalter
Verwalter klickt "PW Reset" → Backend generiert zufälliges 8-Zeichen-PW (`crypto.randomBytes`)
→ Modal zeigt temporäres PW → Verwalter teilt es dem Spieler mit
→ Spieler loggt ein → `passwordResetRequired: true` → Redirect auf `/passwort-aendern`
→ Nur neues PW vergeben (keine E-Mail/Telefon-Änderung)

### Passwort vergessen (Self-Service)
Spieler gibt E-Mail auf Login-Seite ein → `POST /auth/passwort-vergessen` (public, kein Auth)
→ SES-Mail an alle `trainings_verwalter` → Verwalter setzt PW manuell zurück

### Impersonierung (nur Admin)
`POST /auth/impersonate` → Admin bekommt Token des Ziel-Spielers (mit `impersonatedBy`-Marker)

---

## API-Endpunkte & Permissions

### Auth (Handler: `auth.ts`)

| Methode | Pfad | Auth | Rollen |
|---|---|---|---|
| POST | `/auth/login` | public | alle |
| POST | `/auth/logout` | JWT | alle |
| POST | `/auth/change-password` | JWT | alle |
| POST | `/auth/erstanmeldung` | JWT | alle |
| POST | `/auth/passwort-vergessen` | public | alle |
| POST | `/auth/reset-password` | JWT | trainings_verwalter, admin |
| POST | `/auth/impersonate` | JWT | admin |

### Spieler (Handler: `spieler.ts`)

| Methode | Pfad | Rollen | Einschränkungen |
|---|---|---|---|
| GET | `/spieler` | trainings_verwalter, admin | Verwalter sieht keinen admin |
| POST | `/spieler` | trainings_verwalter, admin | Verwalter kann keine admin-Rolle vergeben |
| PUT | `/spieler/{id}` | trainings_verwalter, admin | Verwalter kann admin nicht bearbeiten |
| PUT | `/spieler/{id}/deaktivieren` | trainings_verwalter, admin | Verwalter kann admin nicht deaktivieren |
| DELETE | `/spieler/{id}` | trainings_verwalter, admin | Superadmin kann nie gelöscht werden |

### Plätze (Handler: `platz.ts`)

| Methode | Pfad | Rollen |
|---|---|---|
| GET | `/plaetze` | alle |
| GET | `/plaetze/{id}` | alle |
| POST | `/plaetze` | trainings_verwalter, admin |
| PUT | `/plaetze/{id}` | trainings_verwalter, admin |
| DELETE | `/plaetze/{id}` | trainings_verwalter, admin |
| GET | `/plaetze/{id}/slots` | alle |

### Buchungsgruppen (Handler: `gruppe.ts`)

| Methode | Pfad | Rollen |
|---|---|---|
| GET | `/plaetze/{id}/gruppe` | alle |
| POST | `/plaetze/{id}/gruppe` | trainings_verwalter, admin |
| DELETE | `/plaetze/{id}/gruppe/{spielerId}` | trainings_verwalter, admin |


### Verfügbarkeit (Handler: `verfuegbarkeit.ts`)

| Methode | Pfad | Rollen |
|---|---|---|
| GET | `/slots/{id}/verfuegbarkeit` | alle |
| PUT | `/verfuegbarkeit/{slotId}` | alle (eigene) |

Status-Werte: `verfuegbar`, `nicht_verfuegbar`, `keine_angabe`

Frontend: 3-Klick-Toggle pro Termin:
- 1. Klick: ✓ grün (verfügbar)
- 2. Klick: ✗ rot (nicht verfügbar)
- 3. Klick: leer (keine Angabe)

### Zuweisungen (Handler: `zuweisung.ts`)

| Methode | Pfad | Rollen | Hinweis |
|---|---|---|---|
| POST | `/zuweisungen/berechnen` | trainings_verwalter, admin | |
| GET | `/slots/{id}/zuweisungen` | alle | |
| PUT | `/slots/{id}/zuweisungen/{spielerId}` | alle | Gewollt: Spieler-Koordination |
| POST | `/slots/{id}/abschliessen` | trainings_verwalter, admin | |

### Anmeldung (Handler: `anmeldung.ts`)

| Methode | Pfad | Rollen |
|---|---|---|
| POST | `/slots/{id}/anmelden` | alle |
| POST | `/slots/{id}/anmelden/halb` | alle |
| DELETE | `/slots/{id}/anmelden` | alle |

### Saisons (Handler: `saison.ts`)

| Methode | Pfad | Rollen | Hinweis |
|---|---|---|---|
| GET | `/saisons` | alle | |
| GET | `/saisons/aktiv` | alle | |
| POST | `/saisons` | admin | |
| POST | `/saisons/ensure` | admin | Idempotent |
| PUT | `/saisons/{id}/aktivieren` | admin | |
| – | EventBridge `rate(28 days)` | – | Automatische Saison-Erstellung |

### Profil (Handler: `profil.ts`)

| Methode | Pfad | Rollen |
|---|---|---|
| GET | `/profil` | alle (eigenes) |
| PUT | `/profil` | alle (eigenes) |

### Kosten (Handler: `kosten.ts`)

| Methode | Pfad | Rollen |
|---|---|---|
| GET | `/kosten/mein-konto` | alle |
| GET | `/kosten/gruppe/{platzId}` | trainings_verwalter, admin |

### Benachrichtigungen (Handler: `benachrichtigung.ts`)

| Methode | Pfad | Rollen |
|---|---|---|
| GET | `/benachrichtigungen` | alle (eigene) |
| GET | `/benachrichtigungen/ungelesen/count` | alle (eigene) |
| PUT | `/benachrichtigungen/gelesen` | alle (eigene) |

---

## UI / Navigation

- **Vereinslogo:** `ClubLogo.jpg` in `/public`, wird auf Login-Seite (groß, zentriert) und in der Navbar (48px, rund) angezeigt
- **Login-Seite:** Logo + Titel "Trainings-Planer", Passwort-Toggle (🎾), Passwort-vergessen-Flow inline
- **Navbar:** Blau (`bg-blue-700`), Logo links, Desktop-Links mittig/rechts, Benachrichtigungs-Glocke (🔔) mit Unread-Badge
- **Hamburger-Menü (mobil):** Ab `md:` Breakpoint. Animiertes Icon (☰ ↔ ✕), Dropdown mit allen Links + Benachrichtigungen + Logout
- **Impersonierung-Banner:** Gelber Balken oben bei aktiver Impersonierung mit "Zurück zum Admin"-Button
- **Aktive Seite:** Hervorgehoben mit `bg-blue-800` in Desktop und Mobile

---

## Frontend-Seiten

| Pfad | Rollen | Beschreibung |
|---|---|---|
| `/` | alle | Termine-Kalender mit Farbcodierung |
| `/verfuegbarkeit/saisonplanung` | alle | Verfügbarkeit eintragen (Tabs für alle Plätze) |
| `/benachrichtigungen` | alle | Benachrichtigungen |
| `/profil` | alle | Eigenes Profil bearbeiten |
| `/passwort-aendern` | alle | PW ändern / Erstanmeldung / PW-Reset |
| `/login` | public | Login + Passwort vergessen |
| `/verwaltung/plaetze` | trainings_verwalter, admin | Plätze verwalten |
| `/verwaltung/plaetze/neu` | trainings_verwalter, admin | Neuen Platz anlegen |
| `/verwaltung/plaetze/[id]` | trainings_verwalter, admin | Platz bearbeiten |
| `/admin/spieler` | trainings_verwalter, admin | Spieler verwalten |
| `/admin/saisons` | admin | Saisons verwalten |
| `/stundenkonto` | – | Noch nicht implementiert (aus Nav entfernt) |
| `/kosten` | – | Noch nicht implementiert (aus Nav entfernt) |

---

## DynamoDB Schema (Single-Table)

Tabelle: `TennisTrainingsRunden`

| Entity | PK | SK | GSI1PK | GSI1SK |
|---|---|---|---|---|
| User | `TRAINING_USER#{id}` | `AUTH` | `TRAINING_EMAIL#{email}` | `TRAINING_USER` |
| Spieler | `TRAINING_SPIELER#{id}` | `METADATA` | `TRAINING_EMAIL#{email}` | `TRAINING_SPIELER` |
| Saison | `TRAINING_SAISON#{id}` | `METADATA` | – | – |
| Platz | `TRAINING_PLATZ#{id}` | `METADATA` | `TRAINING_SAISON#{saisonId}` | `TRAINING_PLATZ` |
| Slot | `TRAINING_SLOT#{id}` | `METADATA` | `TRAINING_PLATZ#{platzId}` | `TRAINING_SLOT#{datum}` |
| Verfügbarkeit | `TRAINING_SLOT#{slotId}` | `VERF#{spielerId}` | – | – |
| Zuweisung | `TRAINING_SLOT#{slotId}` | `ZUWEISUNG#{spielerId}` | – | – |
| Gruppe | `TRAINING_PLATZ#{platzId}` | `GRUPPE#{spielerId}` | – | – |
| Benachrichtigung | `TRAINING_USER#{userId}` | `BENACHRICHTIGUNG#{timestamp}` | – | – |
| Kosten | `TRAINING_USER#{userId}` | `KOSTEN#{platzId}#{saisonId}` | – | – |

---

## Deployment

### Backend (AWS SAM)
```bash
cd Tennis-Trainings-Runden/backend
npm run build
rm -rf .aws-sam
sam build
sam deploy --resolve-s3 --stack-name tennis-trainings-runden \
  --capabilities CAPABILITY_IAM --region eu-central-1 --no-confirm-changeset
```

### Frontend (Vercel)
```bash
cd Tennis-Trainings-Runden/frontend
# Git push → Vercel Auto-Deploy
# Env: NEXT_PUBLIC_API_URL=https://j4nivcptm8.execute-api.eu-central-1.amazonaws.com/prod
```

### Lokal entwickeln
```bash
cd Tennis-Trainings-Runden/frontend
npm run dev  # → localhost:3003
```
