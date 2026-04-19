# Security Audit — tc.club-app

Datum: 2026-04-19 (Re-Audit nach Fixes)
Vorheriges Audit: 2026-04-04
Gesamtbewertung: 8.5/10

---

## STATUS DER BEHOBENEN ISSUES

- ✅ JWT_Secret Default entfernt — Parameter required beim Deploy
- ✅ toggleZuweisung Autorisierung — nur Verwalter/Admin oder eigene spielerId
- ✅ Impersonate Input-Validierung — Zod-Schema
- ✅ Impersonate nur lokal — STAGE-Variable, in Prod deaktiviert
- ✅ Rate-Limiting auf passwort-vergessen und reset-password (3 req/s)
- ✅ Passwort-Komplexität — Groß+Klein+Zahl in allen Schemas
- ✅ Access-Token 15min, Refresh-Token 7d, /auth/refresh Endpoint
- ✅ Frontend Auto-Token-Refresh vor Ablauf
- ✅ CSP-Header mit script-src, connect-src, frame-ancestors
- ✅ SES-Berechtigung auf eigene Identities eingeschränkt
- ✅ Authorizer-Cache 60s statt 300s
- ✅ Navigation: Trainings-Links nur für Gruppenmitglieder
- ✅ Navigation: Meden/Festspiel nur für gemeldete Spieler
- ✅ Git-History bereinigt (Passwörter + Personendaten)
- ✅ Hardcoded Passwörter aus Scripts entfernt
- ✅ DB-Backup aus Repo entfernt

---

## NEUE FINDINGS

### NEU-1: CSP erlaubt 'unsafe-inline' für script-src (NIEDRIG)
**Datei:** `frontend/next.config.js`
Next.js braucht `'unsafe-inline'` für Hydration-Scripts. Das schwächt CSP etwas.
→ Akzeptabel. Für strikte CSP müsste Next.js Nonce-Support implementiert werden (hoher Aufwand).

### NEU-2: connect-src erlaubt http://localhost:* (NIEDRIG)
**Datei:** `frontend/next.config.js`
Für lokale Entwicklung nötig. In Produktion (Vercel) kein Risiko, da kein localhost erreichbar.
→ Akzeptabel. Optional: Über Umgebungsvariable nur in Dev setzen.

### NEU-3: Impersonate-Response gibt setzlistePosition nicht mit (INFO)
**Datei:** `backend/src/handlers/auth.ts` — `handleImpersonate()`
Beim Impersonieren fehlt `setzlistePosition` im User-Objekt. Nur relevant für lokale Entwicklung.
→ Kein Produktions-Risiko (Impersonate ist in Prod deaktiviert).

### NEU-4: Refresh-Endpoint gibt keine User-Daten zurück (INFO)
**Datei:** `backend/src/handlers/auth.ts` — `handleRefresh()`
Der Refresh-Endpoint gibt nur einen neuen Access-Token zurück, keine aktualisierten User-Daten. Wenn sich die Rolle eines Users ändert, sieht das Frontend das erst nach erneutem Login.
→ Akzeptabel für Vereins-App. Rollenänderungen sind selten.

---

## OFFEN (niedrige Priorität, unverändert)

### CORS Wildcard
AllowedOrigin Default ist jetzt `https://tennis-training.vercel.app`, aber die API Gateway Cors-Config nutzt noch `'*'`. Nachholen bei Vereins-Hosting.

### localStorage für Tokens
Refresh-Token in localStorage. CSP schützt gegen XSS. HttpOnly Cookies bei Vereins-Hosting nachholen.

### DynamoDB Scans
Mehrere Handler nutzen ScanCommand. Performance-Thema, kein Security-Problem. API Gateway Throttling begrenzt Risiko.

### Dependency-Audit
`npm audit` zeigt 32 Vulnerabilities im Frontend (Next.js Abhängigkeiten). Dependabot einrichten.

---

## POSITIV

- JWT-Auth mit Custom Lambda Authorizer (15min Access, 7d Refresh)
- Refresh-Endpoint mit User-Aktivitätsprüfung
- bcrypt Hashing (10 Rounds)
- Zod-Validierung auf allen Endpoints inkl. Passwort-Komplexität
- RBAC mit 4 Rollen + Superadmin-Schutz
- Impersonierung nur in lokaler Entwicklung
- CSP + Security-Headers (X-Frame-Options DENY, HSTS, nosniff)
- DynamoDB Encryption at Rest + PITR
- API Gateway Throttling + Rate-Limiting auf Auth-Endpoints
- Erstanmeldungs-Flow erzwingt PW-Änderung
- Passwort-vergessen: gleiche Antwort (kein User-Enumeration)
- Minimale IAM-Policies (Read vs. CRUD getrennt)
- SES-Berechtigung auf eigene Identities
- Navigation: Feature-Sichtbarkeit basierend auf Gruppenmitgliedschaft und Meldeliste
- Git-History bereinigt

---

## GEPLANT: Vereins-Hosting

Sobald die App über den Verein gehostet wird:

- CORS von `*` auf die Vereins-Domain einschränken
- HttpOnly Cookies statt localStorage
- Datenschutzerklärung / DSGVO-Hinweis
- Impressum (Vereinsangaben)
- AVV mit AWS und Vercel
- Verantwortlichen für Datenschutz benennen
- Backup-Strategie dokumentieren
