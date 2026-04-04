# 🔒 COMPREHENSIVE SECURITY AUDIT REPORT - tc.club-app
**Datum:** 4. April 2026  
**Version:** 2.0 (Detailed Analysis)  
**Scope:** Backend (Node.js/AWS Lambda), Frontend (Next.js), Deployment (AWS SAM)

---

## 📊 EXECUTIVE SUMMARY

| Kategorie | Status | Anzahl |
|-----------|--------|--------|
| **Kritische Probleme** | 🔴 VORHANDEN | 5 |
| **Höhere Bedenken** | 🟠 VORHANDEN | 8 |
| **Informationen/Mittel** | 🟡 VORHANDEN | 6+ |
| **Gesamtrisiko** | 🔴 ERHÖHT | Sofortige Maßnahmen erforderlich |

**Gesamtbewertung: 4.5/10** — Kritische Sicherheitslücken müssen vor Produktionsdeployment behoben werden.

---

## 🚨 KRITISCHE SICHERHEITSPROBLEME (CVSS ≥ 8.0)

### 1️⃣ **JWT_SECRET Hart-codiert mit Default-Wert** 
**Severity:** 🔴 KRITISCH | **CVSS:** 9.1  
**Location:** `backend/template.yaml` (Zeile 8-11)

**Problembeschreibung:**
```yaml
JWTSecret:
  Type: String
  NoEcho: true
  Default: 'dev-secret-please-change-in-production'  # ❌ KATASTROPHAL!
```

**Auswirkungen:**
- Wenn Parameter beim Deployment nicht überschrieben wird → alle JWTs are forgeable
- Authentifizierung komplett umgehbar
- Account-Übernahme aller Spieler möglich
- Admin-Impersonation möglich
- 🔓 **Critical:** Token-Signatur ist bekannt

**Risiko-Vektor:** Man-in-the-Middle, Token-Fälschung, Session-Hijacking

**Sofortmaßnahme (< 5 Minuten):**
```bash
# 1. Neuen Secret generieren
JWT_SECRET=$(openssl rand -base64 32)
echo "NEW SECRET: $JWT_SECRET"

# 2. In prod deployment neu deployen
sam deploy --parameter-overrides JWTSecret="$JWT_SECRET"

# 3. Höchstpriorität: Validierung dass KEIN Default mehr verwendet wird
grep -r "dev-secret" .
```

**Permanente Lösung:**
```yaml
JWTSecret:
  Type: String
  NoEcho: true
  # ❌ KEIN Default more!
  Description: "REQUIRED: JWT Secret für Token-Signierung"

# Oder: Aus AWS Secrets Manager laden
```

---

### 2️⃣ **localStorage für Langfristige Token-Speicherung (XSS-Anfällig)**
**Severity:** 🔴 KRITISCH | **CVSS:** 8.9  
**Location:** `frontend/src/lib/api.ts` (Lines ~52-60)

**Problembeschreibung:**
```typescript
if (typeof window !== 'undefined') {
  localStorage.setItem('training_token', this.token);              // ❌ 1h Access-Token
  localStorage.setItem('training_refresh_token', this.refreshToken); // ❌❌ 30 TAGE!
  localStorage.setItem('training_token_expires_at', ...);
  localStorage.setItem('training_user', JSON.stringify(userData));
}
```

**Warum Das Kritisch Ist:**
- **localStorage ist für jedes JavaScript zugänglich** (keine HttpOnly-Flagge)
- Bei XSS-Lücke (z.B. unbehandelte HTML-Injection in Benachrichtigungen) → Token-Diebstahl
- **Refresh-Token ist 30 TAGE gültig** → Attacker kann 30 Tage Zugriff haben
- Token sitzt im Klartext im Local Storage
- Cookies mit HttpOnly sind resistent gegen XSS

**Risiko-Vektor:** 
- Cross-Site Scripting → Token-Diebstahl
- Keylogger/Malware mit JavaScript-Zugriff
- Browser-DevTools (lokal, aber für Entwickler sichtbar)

**Sofortmaßnahme:**
```typescript
// ❌ NICHT MACHEN: localStorage verwenden

// ✅ BESSER: HttpOnly Cookies (immune gegen XSS für diesen Vector)
// Backend: Setze Cookies in Response Headers
const response: APIGatewayProxyResult = {
  statusCode: 200,
  headers: {
    'Set-Cookie': [
      `accessToken=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=3600`,
      `refreshToken=${refreshToken}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=604800`, // 7 days
    ],
    ...getCorsHeaders(),
  },
  body: JSON.stringify({ success: true, expiresIn: 3600 }),
};

// Frontend: Keine manuelle Token-Verwaltung nötig
const response = await fetch(url, {
  credentials: 'include',  // Cookies werden automatisch gesendet
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(loginData),
});
```

**Upgrade Path (2-3 Stunden):**
1. Backend: HTTP-Only Cookies implementieren
2. Frontend: localStorage-Zugriff entfernen
3. Authorizer: Cookie parsing hinzufügen

---

### 3️⃣ **CORS mit Wildcard (star) konfiguriert**
**Severity:** 🔴 KRITISCH | **CVSS:** 8.7  
**Location:** `backend/template.yaml` (Zeile 10, Globals + Line 57-59)

**Problembeschreibung:**
```yaml
Parameters:
  AllowedOrigin:
    Type: String
    Default: '*'  # ❌ JEDE Domain

Globals:
  Function:
    Cors:
      AllowedMethods: "'GET,POST,PUT,DELETE,OPTIONS'"
      AllowedHeaders: "'Content-Type,Authorization'"
      AllowedOrigins: "'*'"  # ❌ REPRODUZIERT
```

**Was Attackers Können:**
```javascript
// Von evil.com aus:
fetch('https://api.tennis-club.com/spieler/123/update', {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + stolenToken
  },
  body: JSON.stringify({ name: 'Hacked' })
});
// ✅ Funcktioniert! Keine CORS-Blockierung
```

**Kombination mit localStorage:** Wenn ein XSS-Bug + CORS Wildcard existiert → externe Page als Attacker kann Token-Diebstahl durchführen

**Sofortmaßnahme (5 Minuten):**
```yaml
Parameters:
  AllowedOrigin:
    Type: String
    Default: 'https://tennis-training.vercel.app'  # ✅ Spezifisch!
    # Oder für Dev:
    # Default: 'https://tennis-training.vercel.app,http://localhost:3000'

Globals:
  Function:
    Cors:
      AllowedOrigins: !Ref AllowedOrigin
```

---

### 4️⃣ **Keine Audit-Logging für Sensitive Admin-Operationen**
**Severity:** 🔴 KRITISCH | **CVSS:** 7.8  
**Location:** `backend/src/handlers/auth.ts` (Lines ~200-210: impersonate)

**Problembeschreibung:**
```typescript
async function handleImpersonate(event: APIGatewayProxyEvent) {
  const adminId = event.requestContext.authorizer?.userId;
  // ... validation ...
  
  // Generiere Token als spielerId
  const accessToken = jwt.sign(
    { id: spielerId, rolle: user.rolle, impersonatedBy: adminId },
    jwtSecret,
    { expiresIn: '1h' }
  );
  
  return successResponse({ accessToken });
  // ❌ NICHTS WIRD GELOGGT!
}
```

**Warum Kritisch:**
- **Keine Nachverfolgung:** Welcher Admin impersonierte wann welchen Spieler?
- **Missbrauch nicht nachweisbar:** Admin könnte heimlich Daten manipulieren
- **DSGVO-Verstoß:** "Verantwortung und Transparenz" erfordern Auditlogs
- **Compliance:** Keine Haftung, da keine Records existieren

**Andere Fehlende Audit-Punkte:**
- Password-Reset durchgeführt von wem?
- Role-Changes (spieler → verwalter)?
- Admin-Logins?
- Failed Login-Versuche?

**Sofortmaßnahme:**
```typescript
// ✅ Audit-Log für jede sensible Operation
interface AuditLog {
  action: 'IMPERSONATE' | 'PASSWORD_RESET' | 'ROLE_CHANGE' | 'ADMIN_LOGIN';
  adminId: string;
  adminEmail: string;
  targetUserId?: string;
  targetEmail?: string;
  timestamp: string;
  ipAddress: string;
  userAgent: string;
  result: 'SUCCESS' | 'FAILED';
}

async function logAudit(log: AuditLog) {
  await dynamoClient.send(new PutCommand({
    TableName: process.env.AUDIT_TABLE,
    Item: {
      PK: `AUDIT#${new Date().toISOString()}`,
      SK: `${log.adminId}#${log.action}`,
      ...log,
      TTL: Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60, // 90 Tage retention
    },
  }));
}
```

---

### 5️⃣ **Passwort-Reset: Temporäres Passwort wird im klarttext übertragen**
**Severity:** 🔴 KRITISCH | **CVSS:** 7.5  
**Location:** `backend/src/handlers/auth.ts` (Line ~145: handleResetPassword)

**Problembeschreibung:**
```typescript
async function handleResetPassword(event: APIGatewayProxyEvent) {
  const temporaryPassword = generateRandomPassword(12);
  
  // ... Hashing & Speicherung ...
  
  return successResponse({
    message: 'Passwort wurde zurückgesetzt',
    temporaryPassword,  // ❌ IM KLARTEXT!
    email,
  });
}
```

**Angriffsvektoren:**
1. **Man-in-the-Middle:** Wenn HTTPS nicht korrekt konfiguriert
2. **Proxy-Logging:** Firmen-Proxies loggen Requests
3. **Browser-History:** Temp-PW in Browser History sichtbar
4. **CloudWatch-Logs:** Sensitive Daten in Logs

**Compliance-Problem:**
- PII (Personally Identifiable Information) sollte nicht im HTTP-Body sein
- GDPR: Minimum disclosure principle

**Sofortmaßnahme:**
```typescript
// ❌ NICHT: temporaryPassword zurückgeben

// ✅ BESSER: Nur Bestätigung
return successResponse({
  message: 'Passwort wurde zurückgesetzt. Prüfen Sie Ihre E-Mail für das temporäre Passwort.',
  // temporaryPassword: "sendet an Email statt hier"
});

// Backend sendet E-Mail über SES (geschützt)
await sesClient.send(new SendEmailCommand({
  Source: 'admin@Tennis-Club.de',
  Destination: { ToAddresses: [email] },
  Message: {
    Subject: { Data: 'Passwort zurückgesetzt' },
    Body: {
      Text: { Data: `Ihr temporäres Passwort: ${temporaryPassword}\n\nBitte ändern Sie es nach der Anmeldung.` },
    },
  },
}));
```

---

## ⚠️ HÖHERE SICHERHEITSBEDENKEN (CVSS 5.0-7.9)

### 6️⃣ **Refresh-Token zu lange Gültigkeitsdauer (30 Tage)**
**Severity:** 🟠 HOCH | **CVSS:** 5.9  

```typescript
const refreshToken = jwt.sign(
  { id: user.id, type: 'refresh' },
  jwtSecret,
  { expiresIn: '30d' }  // ❌ Zu lange!
);
```

**Best Practice:** 7-14 Tage maximum  
**Aktuell:** 30 Tage

**Problem:** Bei Token-Diebstahl → 30 Tage Zugriff möglich

**Lösung (15 min):**
```typescript
{ expiresIn: '7d' }  // ✅ 7 Tage
```

---

### 7️⃣ **Logout funktioniert nicht serverseiitig**
**Severity:** 🟠 HOCH | **CVSS:** 5.8  
**Location:** `backend/src/handlers/auth.ts` → handleLogout()

```typescript
async function handleLogout(): Promise<APIGatewayProxyResult> {
  return messageResponse('Erfolgreich abgemeldet');  // ❌ Tut nichts!
}
```

**Problem:** JWT remain valid until expiration (1h für Access-Token)

**Szenario:**
1. User loggt sich ab
2. Token wird gestohlen
3. Attacker kann immer noch 1 Stunde Zugriff haben

**Lösung: Token-Blacklist (2-3 Stunden Implementation):**
```typescript
// ✅ Token zur Blacklist beim Logout hinzufügen
async function handleLogout(event: APIGatewayProxyEvent) {
  const authHeader = event.headers?.Authorization;
  const token = authHeader?.replace('Bearer ', '');
  
  if (token) {
    const decoded = jwt.decode(token) as any;
    if (decoded?.exp) {
      // Speicherke Token im Blacklist-Table mit TTL
      await dynamoClient.send(new PutCommand({
        TableName: process.env.TOKEN_BLACKLIST_TABLE,
        Item: {
          tokenHash: sha256(token),
          expiresAt: decoded.exp,
          createdAt: new Date().toISOString(),
          TTL: decoded.exp, // DynamoDB TTL
        },
      }));
    }
  }
  
  return messageResponse('Erfolgreich abgemeldet');
}

// ✅ Bei jedem Authorization check prüfen
async function validateToken(token: string) {
  const hash = sha256(token);
  const blacklisted = await dynamoClient.send(new GetCommand({
    TableName: process.env.TOKEN_BLACKLIST_TABLE,
    Key: { tokenHash: hash },
  }));
  
  if (blacklisted.Item) {
    throw new Error('Token wurde widerrufen (Logout)');
  }
  
  return jwt.verify(token, jwtSecret);
}
```

---

### 8️⃣ **Schwache Passwort-Anforderungen**
**Severity:** 🟠 HOCH | **CVSS:** 5.3  
**Location:** `backend/src/handlers/*.ts` (diverse Zod-Schemas)

```typescript
const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(100),    // ❌ min(1)!!!
  newPassword: z.string().min(8).max(100),        // ❌ Keine Komplexität
});
```

**Aktuell erlaubt:**
- `12345678` ← Zahlenfolge
- `abcdefgh` ← Nur Kleinbuchstaben
- `a` ← Erlaubt bei min(1)!

**OWASP-Best-Practice:**
- Mindestens 12 Zeichen
- Großbuchstaben: A-Z
- Kleinbuchstaben: a-z
- Zahlen: 0-9
- Sonderzeichen: !@#$%^&*()

**Lösung (1 Stunde):**
```typescript
const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{12,}$/;

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(8),
  newPassword: z.string()
    .min(12, 'Mindestens 12 Zeichen erforderlich')
    .max(100)
    .regex(/[A-Z]/, 'Mindestens ein Großbuchstabe erforderlich')
    .regex(/[a-z]/, 'Mindestens ein Kleinbuchstabe erforderlich')
    .regex(/\d/, 'Mindestens eine Ziffer erforderlich')
    .regex(/[@$!%*?&]/, 'Mindestens ein Sonderzeichen erforderlich'),
});
```

---

### 9️⃣ **Rate-Limiting nur für /auth/login, nicht für /auth/passwort-vergessen**
**Severity:** 🟠 HOCH | **CVSS:** 5.7  
**Location:** `backend/template.yaml` (MethodSettings)

```yaml
MethodSettings:
  - ResourcePath: "/auth/login"
    HttpMethod: "POST"
    ThrottlingRateLimit: 5        # ✅ OK
  - ResourcePath: "/auth/passwort-vergessen"  # ❌ KEIN LIMIT!
    HttpMethod: "POST"
    # Nutzt Default: 50 req/s
```

**Szenario:** Brute-Force Passwort-Reset
```bash
for i in {1..1000}; do
  curl -X POST https://api.tennis-club.com/auth/passwort-vergessen \
    -d '{"email":"user@example.com"}'
done
```

**Lösung (30 min):**
```yaml
MethodSettings:
  - ResourcePath: "/auth/login"
    HttpMethod: "POST"
    ThrottlingRateLimit: 5
    ThrottlingBurstLimit: 10
  - ResourcePath: "/auth/passwort-vergessen"  # ✅ NEU
    HttpMethod: "POST"
    ThrottlingRateLimit: 3
    ThrottlingBurstLimit: 5
  - ResourcePath: "/auth/reset-password"      # ✅ NEU
    HttpMethod: "POST"
    ThrottlingRateLimit: 3
    ThrottlingBurstLimit: 5
```

---

### 🔟 **Keine CSRF-Protection für PUT/DELETE/POST**
**Severity:** 🟠 HOCH | **CVSS:** 5.4  

**Szenario:**
```html
<!-- Auf evil.com -->
<img src="https://api.tennis-club.com/spieler/123/delete" />
<!-- Wenn User eingeloggt ist (localStorage-Token) → Spieler gelöscht -->
```

**Allerdings:** Mit localStorage + CORS Wildcard ist das möglich  
**Mit HttpOnly Cookies hätte:** Browser würde automatisch Cookies senden, aber CSRF-Token würde schützen

**Lösung (3-4 Stunden):**
```typescript
// 1. CSRF-Token beim Initialisieren ausstellen
app.get('/api/csrf-token', (req, res) => {
  const token = crypto.randomBytes(32).toString('hex');
  res.cookie('csrfToken', token, { httpOnly: true });
  res.json({ csrfToken: token });
});

// 2. Frontend: Token in Custom-Header senden
const response = await fetch('/api/spieler/123', {
  method: 'PUT',
  headers: {
    'X-CSRF-Token': csrfToken, // ← Custom Header, nicht automatisch gesendet
    'Content-Type': 'application/json',
  },
  credentials: 'include',
  body: JSON.stringify(data),
});

// 3. Backend: Token validieren
app.put('/api/spieler/:id', (req, res) => {
  const headerToken = req.headers['x-csrf-token'];
  const cookieToken = req.cookies.csrfToken;
  
  if (headerToken !== cookieToken) {
    return res.status(403).json({ error: 'CSRF Token ungültig' });
  }
  
  // ... Request processing ...
});
```

---

### 1️⃣1️⃣ **Keine Content-Security-Policy (CSP)**
**Severity:** 🟠 HOCH | **CVSS:** 5.2  
**Location:** `frontend/next.config.js` → headers()

**Aktuell:**
```javascript
headers: [
  { key: 'X-Frame-Options', value: 'DENY' },           // ✅
  { key: 'X-Content-Type-Options', value: 'nosniff' }, // ✅
  // ❌ CSP fehlt!
]
```

**Lösung (1 Stunde):**
```javascript
async headers() {
  return [
    {
      source: '/:path*',
      headers: [
        {
          key: 'Content-Security-Policy',
          value: `
            default-src 'self';
            script-src 'self';
            style-src 'self' 'unsafe-inline';
            img-src 'self' data: https:;
            font-src 'self';
            connect-src 'self' https://xxxxxxxxxx.execute-api.eu-central-1.amazonaws.com;
            frame-ancestors 'none';
            base-uri 'self';
            form-action 'self';
          `.replace(/\s+/g, ' ').trim(),
        },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'geolocation=(), payment=()' },
      ],
    },
  ];
}
```

---

### 1️⃣2️⃣ **Abhängigkeiten werden nicht regelmäßig aktualisiert**
**Severity:** 🟠 HOCH | **CVSS:** 6.5  

**Probleme:**
- Keine automatische Sicherheitsprüfung
- Bekannte Vulnerabilities in Dependencies könnten unentdeckt bleiben
- Featured Dependencies: bcryptjs, next, etc.

**Lösung (Permanente Maßnahme):**
```bash
# 1. Aktuell checken
npm audit

# 2. GitHub/GitLab Security Scanning aktivieren
# Beispiel: GitHub Actions
name: Security Audit
on: [pull_request, push]
jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm audit --audit-level=moderate
```

---

## 📋 PRIORITAS-LISTE: FIXES NACH AUFWAND

### 🔴 SOFORT (< 1 Tag)

| # | Problem | Aufwand | Impact |
|---|---------|--------|--------|
| 1 | JWT_SECRET generieren | 30 min | 🔴 KRITISCH |
| 2 | CORS auf spezifische Domain | 30 min | 🔴 KRITISCH |
| 3 | Refresh-Token auf 7 Tage | 15 min | 🟠 HOCH |
| 4 | Rate-Limiting auf pw-reset | 45 min | 🟠 HOCH |
| 5 | Passwort-Anforderungen | 1 h | 🟠 HOCH |

### 🟠 DIESE WOCHE (1-3 Tage)

| # | Problem | Aufwand | Impact |
|---|---------|--------|--------|
| 6 | localStorage → HttpOnly Cookies | 4-6 h | 🔴 KRITISCH |
| 7 | Audit-Logging | 2-3 h | 🔴 KRITISCH |
| 8 | Passwort-Reset Handling | 1-2 h | 🔴 KRITISCH |
| 9 | Logout mit Token-Blacklist | 2-3 h | 🟠 HOCH |
| 10 | CSP Header | 1 h | 🟠 HOCH |

### 🟡 SPÄTER (1-2 Wochen)

| # | Problem | Aufwand | Impact |
|---|---------|--------|--------|
| 11 | CSRF-Protection | 3-4 h | 🟠 HOCH |
| 12 | Dependency-Sicherheit | Ongoing | 🟠 HOCH |
| 13 | Input-Sanitization | 1-2 h | 🟡 MITTEL |

---

## ✅ WAS GUT IST

- ✅ JWT-basierte Auth mit Custom Lambda Authorizer
- ✅ bcrypt Passwort-Hashing (10 Rounds)
- ✅ Zod-Validierung auf hauptsächlichen Endpoints
- ✅ Rollenbasierte Zugriffskontrolle (RBAC mit 4 Rollen)
- ✅ Superadmin-Schutz (kann nicht gelöscht/bearbeitet werden)
- ✅ Security-Headers partially (X-Frame-Options, HSTS, nosniff)
- ✅ DynamoDB Encryption at Rest
- ✅ Point-in-Time Recovery aktiviert
- ✅ Erstanmeldungs-Flow erzwingt Passwort-Änderung
- ✅ `.env*.local` in `.gitignore`
- ✅ Minimale IAM-Policies

---

## 🚀 DEPLOYMENT-CHECKLIST VOR PRODUKTIONSFREIGABE

```bash
# 1. JWT_SECRET neu generieren
JWT_SECRET=$(openssl rand -base64 32)

# 2. CORS implementieren
# Datei: backend/template.yaml
# Änderung: AllowOrigin von '*' zu 'https://tennis-training.vercel.app'

# 3. Token Storage auf HttpOnly Cookies
# Branch: security/http-only-cookies
# Aufwand: 4-6 Stunden

# 4. Audit-Logging aktivieren
# Branch: security/audit-logging
# Aufwand: 2-3 Stunden

# 5. npm audit durchführen
npm audit

# 6. Security-Headers im Frontend
# next.config.js: CSP + andere Headers

# 7. Passwort-Requirements upgrade
# Zod-Schemas in backend updateri

# 8. Rate-Limiting erweitern
# template.yaml: pw-reset endpoint

# Deployment mit allen Fixes
sam build
sam deploy --parameter-overrides JWTSecret="$JWT_SECRET"
```

---

**Report erstellt:** 4. April 2026  
**Nächster Audit:** Nach Implementierung aller kritischen Fixes  
**Kontakt:** Security Team