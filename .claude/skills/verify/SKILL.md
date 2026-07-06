---
name: verify
description: Build, launch, and drive Urvar ERP to verify changes end-to-end in a real browser.
---

# Verifying Urvar ERP

## Launch

```bash
npm run dev          # starts on port 3000, or 3001 if 3000 is busy — CHECK THE LOG for the actual port
```

Port 3000 is often occupied by another app on this machine. Always read the dev-server
output for the real port before driving the app.

DB: SQLite at `data/urvar.db`. Reset transactional data between walkthrough runs
(masters/users survive):

```bash
sqlite3 data/urvar.db "DELETE FROM inventory_transactions; DELETE FROM stock_balances; DELETE FROM batch_inputs; DELETE FROM batches; DELETE FROM stage_readings; DELETE FROM order_stages; DELETE FROM production_orders; DELETE FROM lots; DELETE FROM audit_log;"
```

## Drive

Playwright is a devDependency and uses system Chrome (no browser download):

```js
const browser = await chromium.launch({ channel: "chrome", headless: true });
```

`node e2e-walkthrough.mjs` runs the full manufacturing loop with screenshots into
`e2e-shots/`: login → goods receipts → production order → start (FIFO issue) →
stage readings → complete → batch traceability → dashboard. Logins: admin/admin123,
supervisor/super123.

For a quick authenticated curl (bypasses the login form):

```bash
COOKIE=$(node -e "
const {createHmac} = require('crypto');
const enc = Buffer.from(JSON.stringify({uid:1,exp:Date.now()+86400000})).toString('base64url');
console.log(enc + '.' + createHmac('sha256','urvar-dev-secret-change-in-production').update(enc).digest('hex'));")
curl -H "Cookie: urvar_session=$COOKIE" http://localhost:PORT/dashboard
```

## Gotchas

- **Playwright selectors**: `text=Foo` matches substrings anywhere (including body copy).
  Use `button:has-text('Foo')` for buttons.
- **New Order dialog**: the default product is alphabetical (Cow Dung FYM) which has no
  formula — the required-but-empty formula `<select>` blocks native form submission
  silently. Select "Vermicompost" first.
- **FormDialog only closes on success.** A dialog still open after submit = the action
  failed; the base-ui overlay then swallows all page clicks (Playwright timeouts on
  unrelated elements usually mean a stuck dialog).
- **Server errors** don't always toast; check the dev-server output file for stack traces.
- **Never import values from a `"use client"` module into a server component** — they
  arrive as client-reference proxies (undefined lookups). Shared constants live in plain
  modules like `src/modules/batches/badges.ts`.
- Timestamps are stored UTC; display goes through `fmtDateTime` (`src/lib/dates.ts`).
  Date-only stamps must use `localDateISO`, never `toISOString().slice(0,10)` (IST rollback bug).
