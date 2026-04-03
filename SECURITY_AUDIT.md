# Security Audit — tc.club-app

Datum: 2026-04-04 (Update)
Vorheriges Audit: 2026-04-03

## Zusammenfassung

Die tc.club-app ist eine Tennis-Club-Verwaltungsanwendung mit Next.js Frontend (Vercel) und AWS Lambda/DynamoDB Backend (SAM). Die Architektur ist solide: JWT-Auth mit Custom Authorizer, Zod-Validierung, bcrypt-Hashing, Security-Headers. Es gibt aber einige kritische und mittlere Findings.

Gesamtbewertung: 7/10 — gute Basis, einige Punkte müssen adressiert werden.

---

## KRITISCH

### 1. Hardcoded Passwörter in Admin-Scripts (im Git-Repository)

**Status: aus vorherigem Audit, prüfen ob behoben**

Mehrere Scripts enthielten das Klartext-Passwort `Dormagen2026!`:
- `backend/reset-pw.js`, `backend/reset-pw-generic.js`, `backend/reset-jonny.js`, `backend/seed-spieler.js`

Empfehlung: Passwörter als CLI-Argument oder Umgebungsvariable. Git-History bereinigen.

### 2. Datenbank-Backup mit Produktionsdaten im Repository

**Status: aus vorherigem Audit, prüfen ob behoben**

`backend/clubapp-backup.json` enthielt vollständigen DynamoDB-Export mit echten Spielerdaten (Namen, E-Mails, Verbands-IDs). DSGVO-relevant.

Empfehlung: Datei entfernen, `.gitignore` ergänzen, Git-History bereinigen.

### 3. CORS AllowOrigin auf Wildcard `*`

**Datei:** `backend/template.yaml` (Zeile 10, Globals, API Cors)

```yaml
AllowedOrigin:
  Type: String
  Default: '*'
```

Sowohl der Parameter-Default als auch die API Gateway Cors-Config und alle GatewayResponses verwenden `'*'`. Das erlaubt Requests von jeder Domain.

Empfehlung: Auf die tatsächliche Frontend-URL einschränken (`https://tennis-training.vercel.app`). Beim Deployment den Parameter explizit setzen.

### 4. JWT_SECRET Default-Wert im Template

**Datei:** `backend/template.yaml` (Zeile 8)

```yaml
JWTSecret:
  Type: String
  NoEcho: true
  Default: 'dev-secret-please-change-in-production'
```

Falls beim Deployment der Parameter nicht überschrieben wird, läuft die Produktion mit einem erratbaren Secret.

Empfehlung: Default entfernen, Parameter als required behandeln. Alternativ aus AWS Secrets Manager laden.

### 5. Temporäres Passwort wird in API-Response zurückgegeben

**Datei:** `backend/src/handlers/auth.ts` — `handleResetPassword()`

```typescript
return successResponse({
  message: 'Passwort wurde zurückgesetzt',
  temporaryPassword,
  email,
});
```

Das temporäre Passwort wird im Klartext an den Client gesendet. Jeder mit Zugriff auf die Netzwerk-Konsole oder Logs sieht es.

Empfehlung: Temporäres Passwort per E-Mail an den Spieler senden statt in der Response. Oder: akzeptables Risiko, da nur Verwalter/Admin diesen Endpoint aufrufen können und das PW sofort geändert werden muss.

---

## HOCH

### 6. Logout invalidiert Token nicht serverseitig

**Datei:** `backend/src/handlers/auth.ts` — `handleLogout()`

```typescript
async function handleLogout(): Promise<APIGatewayProxyResult> {
  return messageResponse('Erfolgreich abgemeldet');
}
```

Der Logout-Handler macht nichts. Das JWT bleibt bis zum Ablauf (1h) gültig. Ein gestohlenes Token kann weiter verwendet werden.

Empfehlung: Token-Blacklist in DynamoDB mit TTL (1h). Alternativ: Access-Token-Lebensdauer auf 15min reduzieren.

### 7. Refresh-Token in localStorage (XSS-Anfällig)

**Datei:** `frontend/src/lib/api.ts`

```typescript
localStorage.setItem('training_token', this.token);
localStorage.setItem('training_refresh_token', this.refreshToken);
```

localStorage ist für jedes Script auf der Seite zugänglich. Bei einer XSS-Lücke können Tokens gestohlen werden. Der Refresh-Token hat 30 Tage Gültigkeit.

Empfehlung: Refresh-Token in einem HttpOnly-Cookie speichern. Oder: akzeptables Risiko bei strikter CSP.

### 8. Kein Refresh-Token-Endpoint implementiert

**Datei:** `backend/src/handlers/auth.ts`

Es gibt keinen `/auth/refresh`-Endpoint. Der Refresh-Token wird generiert und gespeichert, aber nie verwendet. Nach 1h muss der User sich neu einloggen.

Empfehlung: Refresh-Endpoint implementieren oder Refresh-Token-Generierung entfernen.

### 9. Impersonierung ohne Audit-Logging

**Datei:** `backend/src/handlers/auth.ts` — `handleImpersonate()`

Der `impersonatedBy`-Marker wird ins JWT geschrieben, aber nirgends geloggt. Es gibt keine Nachvollziehbarkeit wer wann wen impersoniert hat.

Empfehlung: Impersonierungs-Events in DynamoDB loggen (Admin-ID, Ziel-Spieler-ID, Zeitstempel).

### 10. Keine Input-Validierung bei `handleImpersonate`

**Datei:** `backend/src/handlers/auth.ts` — `handleImpersonate()`

```typescript
const { spielerId } = JSON.parse(event.body);
```

Kein Zod-Schema, keine Validierung der spielerId. Beliebige Strings werden akzeptiert.

Empfehlung: Zod-Schema mit `z.string().uuid()` verwenden.

---

## MITTEL

### 11. SES-Berechtigung zu weit gefasst

**Datei:** `backend/template.yaml` — AuthFunction Policies

```yaml
- Statement:
    - Effect: Allow
      Action:
        - ses:SendEmail
      Resource: '*'
```

Erlaubt E-Mails an beliebige Adressen zu senden.

Empfehlung: Resource auf die verifizierte SES-Identity einschränken.

### 12. Benachrichtigungs-Inhalt nicht sanitisiert

**Datei:** `backend/src/handlers/benachrichtigung.ts` — `sendNachricht()`

Titel und Nachricht werden direkt aus dem Request übernommen und gespeichert. Zod begrenzt die Länge, aber es gibt keine HTML/Script-Sanitisierung.

Empfehlung: Falls Benachrichtigungen als HTML gerendert werden, Input sanitisieren. Bei reinem Text-Rendering ist das Risiko gering.

### 13. DynamoDB Scan-Operationen in mehreren Handlern

**Dateien:** `spieler.ts`, `saison.ts`, `meden-spieltage.ts`, `meden-aufstellung.ts`

Mehrere Handler verwenden `ScanCommand` statt Query. Bei wachsender Datenmenge wird das teuer und langsam. Kein direktes Security-Problem, aber DoS-Vektor bei vielen gleichzeitigen Requests.

Empfehlung: Wo möglich auf GSI-Queries umstellen. API Gateway Throttling ist bereits konfiguriert (50 req/s), was das Risiko begrenzt.

### 14. Keine Rate-Limiting-Durchsetzung auf Code-Ebene für Login

**Datei:** `backend/template.yaml`

API Gateway hat Throttling (5 req/s für `/auth/login`), aber es gibt kein Account-Lockout nach fehlgeschlagenen Versuchen.

Empfehlung: Fehlgeschlagene Login-Versuche zählen und Account nach 5-10 Versuchen temporär sperren.

### 15. `toggleZuweisung` — fehlende Autorisierungsprüfung

**Datei:** `backend/src/handlers/zuweisung.ts` — `toggleZuweisung()`

Jeder authentifizierte User kann Zuweisungen für beliebige Spieler togglen. Es wird nur geprüft ob der User eingeloggt ist, nicht ob er Verwalter ist oder ob es sein eigener Slot ist.

```typescript
const userId = event.requestContext.authorizer?.userId;
if (!userId) return errorResponse('Nicht autorisiert', 401);
// ... keine weitere Rollenprüfung
```

Empfehlung: Prüfen ob der User Verwalter/Admin ist ODER ob `spielerId === userId`.

### 16. `getSlotZuweisungen` — keine Autorisierungsprüfung

**Datei:** `backend/src/handlers/zuweisung.ts` — `getSlotZuweisungen()`

Jeder authentifizierte User kann Zuweisungen für jeden Slot abrufen. Kein Check ob der User zur Gruppe gehört.

Empfehlung: Prüfen ob User Verwalter/Admin ist oder Mitglied der Buchungsgruppe.

### 17. `getGruppe` — keine Autorisierungsprüfung

**Datei:** `backend/src/handlers/gruppe.ts` — `getGruppe()`

Jeder authentifizierte User kann die Mitglieder jeder Buchungsgruppe sehen.

Empfehlung: Akzeptabel wenn gewünscht (Vereinsmitglieder sehen sich gegenseitig), aber dokumentieren.

### 18. Passwort-vergessen E-Mail enthält Spielernamen

**Datei:** `backend/src/handlers/auth.ts` — `handlePasswortVergessen()`

```typescript
Data: `...${spieler.vorname} ${spieler.name} (${email}) hat eine Passwort-Reset-Anfrage gestellt...`
```

Der Name des Spielers wird in der E-Mail an alle Verwalter gesendet. Das ist funktional korrekt, aber die E-Mail geht unverschlüsselt.

Empfehlung: Geringes Risiko, da nur an Verwalter. Akzeptabel.

---

## NIEDRIG

### 19. Authorizer cached Policy für 300 Sekunden

**Datei:** `backend/template.yaml`

```yaml
ReauthorizeEvery: 300
```

Wenn ein User deaktiviert wird, kann er noch bis zu 5 Minuten weiter zugreifen.

Empfehlung: Auf 60 Sekunden reduzieren oder akzeptieren.

### 20. Keine Content-Security-Policy (CSP)

**Datei:** `frontend/next.config.js`

Gute Security-Headers vorhanden (X-Frame-Options, HSTS, X-Content-Type-Options, Permissions-Policy), aber kein CSP-Header.

Empfehlung: CSP hinzufügen, mindestens `default-src 'self'; script-src 'self'`.

### 21. Error-Responses könnten Informationen leaken

Mehrere Handler geben bei Zod-Validierungsfehlern die konkreten Fehlermeldungen zurück. Das ist hilfreich für die Entwicklung, könnte aber Angreifern Schema-Informationen geben.

Empfehlung: In Produktion generische Fehlermeldungen verwenden.

### 22. `listSpieler` verwendet zwei Scan-Operationen

**Datei:** `backend/src/handlers/spieler.ts`

Zwei volle Table-Scans pro Aufruf (Spieler + User für lastLogin). Bei vielen Spielern ineffizient.

Empfehlung: lastLogin im Spieler-Datensatz speichern oder GSI nutzen.

---

## POSITIV (was gut gemacht ist)

- JWT-basierte Auth mit Custom Lambda Authorizer
- bcrypt Passwort-Hashing (10 Rounds)
- Zod-Validierung auf allen wichtigen Endpoints
- Rollenbasierte Zugriffskontrolle (RBAC) mit 4 Rollen
- Superadmin-Schutz (Verwalter kann Admin nicht sehen/bearbeiten/löschen)
- Security-Headers im Frontend (X-Frame-Options DENY, HSTS, nosniff)
- DynamoDB Encryption at Rest + Point-in-Time Recovery
- API Gateway Throttling konfiguriert
- Erstanmeldungs-Flow erzwingt E-Mail- und Passwort-Änderung
- Passwort-vergessen gibt immer gleiche Antwort (kein User-Enumeration)
- `.env*.local` in `.gitignore`
- NoEcho auf JWTSecret Parameter
- Minimale IAM-Policies (Read vs. CRUD getrennt)
