# Security Audit — tc.club-app

Datum: 2026-04-04 (abgeschlossen)
Gesamtbewertung: 8/10 (nach Fixes, vorher 6/10)

---

## ERLEDIGT

### FIX-2: JWT_SECRET Default entfernt ✅
Default-Wert aus template.yaml entfernt. Parameter muss beim Deployment gesetzt werden.

### FIX-3: toggleZuweisung Autorisierung ✅
Nur Verwalter/Admin oder eigene spielerId dürfen Zuweisungen ändern.

### FIX-4: Impersonate Input-Validierung ✅
Zod-Schema für spielerId ergänzt.

### FIX-5: Rate-Limiting passwort-vergessen ✅
3 req/s auf /auth/passwort-vergessen und /auth/reset-password.

### FIX-6: Passwort-Komplexität ✅
Mindestens 8 Zeichen + Großbuchstabe + Kleinbuchstabe + Ziffer in allen Schemas.

### FIX-7: Token-Lebensdauer + Refresh-Endpoint ✅
Access-Token: 1h → 15min. Refresh-Token: 30d → 7d. Neuer /auth/refresh Endpoint.
Frontend erneuert Token automatisch vor Ablauf.

### FIX-8: Impersonate nur lokal ✅
Impersonierung in Produktion deaktiviert (STAGE-Variable). Audit-Logging nicht nötig.

### FIX-10: CSP-Header ✅
Content-Security-Policy in next.config.js. ⚠️ Nach Deploy testen (siehe TODO_NACH_DEPLOY.md).

### FIX-11: Refresh-Token 7 Tage ✅
Mit FIX-7 erledigt.

### FIX-12: SES-Berechtigung eingeschränkt ✅
Resource von `*` auf verifizierte SES-Identities im eigenen Account.

### FIX-15: Authorizer-Cache 60s ✅
Von 300s auf 60s reduziert.

---

## ÜBERSPRUNGEN (akzeptables Risiko)

### FIX-1: CORS Wildcard
Bleibt auf `*`. Nachholen bei Vereins-Hosting.

### FIX-9: Temporäres Passwort per Mail
Verwalter/MF gibt das PW direkt weiter. SES-Kosten nicht gerechtfertigt.

### FIX-14: getSlotZuweisungen/getGruppe ohne Auth-Check
Vereinsmitglieder sehen sich gegenseitig — gewünschtes Verhalten.

---

## OFFEN (niedrige Priorität)

### FIX-13: localStorage → HttpOnly Cookies
Aufwand 4-6h. Nachholen bei Vereins-Hosting. CSP (FIX-10) schützt gegen XSS.

### FIX-16: DynamoDB Scans → GSI-Queries
Performance-Optimierung, kein akutes Security-Problem. API Gateway Throttling begrenzt Risiko.

### FIX-17: Dependency-Audit
Dependabot oder `npm audit` regelmäßig einrichten.

---

## POSITIV

- JWT-Auth mit Custom Lambda Authorizer
- bcrypt Hashing (10 Rounds)
- Zod-Validierung auf allen Endpoints
- RBAC mit 4 Rollen + Superadmin-Schutz
- Security-Headers (CSP, X-Frame-Options DENY, HSTS, nosniff)
- DynamoDB Encryption at Rest + PITR
- API Gateway Throttling + Rate-Limiting auf Auth-Endpoints
- Erstanmeldungs-Flow erzwingt PW-Änderung
- Passwort-vergessen: gleiche Antwort (kein User-Enumeration)
- Minimale IAM-Policies (Read vs. CRUD getrennt)
- Git-History bereinigt (Hardcoded PWs + Personendaten entfernt)
- Impersonierung nur in lokaler Entwicklung

---

## GEPLANT: Vereins-Hosting

Sobald die App auf alle Mannschaften ausgeweitet wird, wird sie nicht mehr privat über Vercel gehostet, sondern über den Verein. Dann relevant:

- CORS von `*` auf die Vereins-Domain einschränken (FIX-1 nachholen)
- HttpOnly Cookies statt localStorage (FIX-13)
- Datenschutzerklärung / DSGVO-Hinweis auf der Seite
- Impressum (Vereinsangaben)
- Auftragsverarbeitungsvertrag (AVV) mit AWS und Vercel
- Verantwortlichen für Datenschutz im Verein benennen
- Backup-Strategie dokumentieren (DynamoDB PITR ist aktiv, aber Prozess für Restore definieren)
