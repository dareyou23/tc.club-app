# ⚠️ NACH DEM NÄCHSTEN VERCEL-DEPLOY PRÜFEN

## CSP + Next.js Inline-Scripts

Am 2026-04-04 wurde eine Content-Security-Policy in `frontend/next.config.js` hinzugefügt mit `script-src 'self'`.

Next.js generiert in Produktion Inline-Scripts für Hydration (`__NEXT_DATA__`, etc.).
Diese werden von `script-src 'self'` blockiert.

### Symptom
Seite bleibt nach Deploy weiß oder React-Hydration schlägt fehl (Console: "Refused to execute inline script").

### Fix
In `frontend/next.config.js` die script-src Zeile anpassen:

```javascript
// Option A: unsafe-inline erlauben (einfach, weniger sicher)
"script-src 'self' 'unsafe-inline'",

// Option B: Next.js Nonce-Support (sicherer, mehr Aufwand)
// Siehe: https://nextjs.org/docs/app/building-your-application/configuring/content-security-policy
```

### Status
- [ ] Nach erstem Deploy mit CSP testen
- [ ] Falls weiße Seite: Option A oder B umsetzen
