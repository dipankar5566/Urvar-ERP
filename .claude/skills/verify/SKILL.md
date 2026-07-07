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
  formula/workflow template — the required-but-empty `<select>`s block native form
  submission *silently* (no toast, dialog just stays open). Always `selectOption`
  "Vermicompost" first, then **wait for the dependent selects to repopulate** before
  filling the rest — after `selectOption("#po-product", ...)`, do
  `page.waitForFunction(() => document.querySelector("#po-formula")?.value !== "")`.
  Playwright's `selectOption` returns before React commits the re-render of sibling
  selects (formula/template), so filling qty immediately after is a race that submits
  with an empty required field.
- **Never manually delete/recreate the SQLite file while `npm run dev` is running.**
  better-sqlite3 keeps its fd open; on Unix the process keeps reading the old unlinked
  inode, so the server silently serves stale (pre-reset) data until restarted. If you
  need a clean DB (`rm data/urvar.db*` + migrate + seed), **restart the dev server
  afterward** — `TaskStop` the background task, then `npm run dev` again.
- **FormDialog only closes on success.** A dialog still open after submit = the action
  failed (or a required field blocked it, see above); the base-ui overlay then swallows
  all page clicks (Playwright timeouts on unrelated elements usually mean a stuck dialog).
- **Server errors** don't always toast; check the dev-server output file for stack traces.
- **Never import values from a `"use client"` module into a server component** — they
  arrive as client-reference proxies (undefined lookups). Shared constants live in plain
  modules like `src/modules/batches/badges.ts`.
- Timestamps are stored UTC; display goes through `fmtDateTime` (`src/lib/dates.ts`).
  Date-only stamps must use `localDateISO`, never `toISOString().slice(0,10)` (IST rollback bug).
- **Masters → Formulas/Workflows edit dialogs**: double-check the Product dropdown
  before saving — picking the wrong product here breaks order creation for every other
  product silently downstream (their dependent selects go empty, see above). Sanity
  check after any Masters edit: `sqlite3 data/urvar.db "select f.name, p.name from
  formulas f join products p on p.id=f.product_id;"` should read sensibly.
- **Site layout / bed positions: never eyeball a rendered PDF image to place beds —
  extract the actual vector coordinates.** `pip3 install pymupdf`, then
  `page.get_drawings()` gives every line's exact PDF-space endpoints grouped by
  stroke color. Solve an affine transform from PDF-space to feet-space using ≥3
  points whose real-world positions you already know (matched by edge-length, e.g.
  a boundary corner where two dimensioned edges meet) via
  `numpy.linalg.lstsq(hstack([P, ones]), Q)`; verify residuals are near zero before
  trusting it. This caught two real bugs an eyeballed reading missed: a bed block
  overflowing 10ft past a diagonal zone-divider line, and the true bed count/shape
  (27 individual beds — 12 in Zone 1 including 4 diagonal ones, 15 in Zone 2 with a
  mix of two lengths) being nothing like the "10 + 15 uniform grid" the verbal spec
  implied. Beds are stored as a general `(x1,y1)-(x2,y2)` centerline + width, not
  `(posX,posY,orientation)` — several are not axis-aligned. Always re-verify bed
  placement with a real point-in-polygon test (not visual inspection) after any
  reposition: see the Python snippet pattern used in commit history around
  `site-geometry.ts`.
- **After schema changes to `beds`/`zones` (or any DROP TABLE), restart the dev
  server** even if you didn't delete the DB file — Drizzle/better-sqlite3 can hold
  stale prepared-statement metadata for the old column set. `drizzle-kit generate`
  also needs an interactive TTY to resolve rename-vs-drop+add ambiguity; in this
  environment, use `drizzle-kit generate --custom` for an empty migration file and
  hand-write the SQL instead of fighting the prompt.
- **SQLite rejects `ALTER TABLE ... ADD COLUMN ... NOT NULL DEFAULT (datetime('now'))`**
  ("Cannot add a column with non-constant default") — that's only a problem for
  NOT NULL columns with a dynamic default; a nullable additive column is fine.
  For the NOT NULL + dynamic-default case, recreate the table instead: `CREATE
  TABLE x_new (...)`, `INSERT INTO x_new SELECT ...`, `DROP TABLE x`, `ALTER TABLE
  x_new RENAME TO x`, then recreate its indexes.
- **Stored timestamps come in two different formats in this app** — JS
  `new Date().toISOString()` (`"...T...Z"`) vs SQLite's `datetime('now')` column
  default (`"YYYY-MM-DD HH:MM:SS"`, no `T`, no `Z`, implicitly UTC). Never
  `Date.parse` either directly — use `parseStoredDate()` / `fmtDateTime()` from
  `src/lib/dates.ts`, which normalize both. A naive `Date.parse(x + "Z")` on the
  SQLite format produces an invalid/unreliable date silently.
- **Verifying "live" / polling features needs two Playwright pages, not one.**
  Open Tab A on the page under test and never touch it again. Drive the state
  change through Tab B (or direct DB writes) exactly like a second real user
  would. Then `await pageA.waitForTimeout(pollIntervalMs + buffer)` with zero
  interaction on Tab A, and assert its DOM changed. If you `reload()` or otherwise
  touch Tab A, you've verified navigation, not polling — pattern used in
  `realtime-verify-2.mjs`.
- **To test a "stale/overdue" flag without a real multi-day wait**, backdate the
  relevant row directly: `sqlite3 data/urvar.db "update <table> set <timestamp col>
  = datetime('now','-2 days') where id=<id>"`, then reload/poll and assert the
  warning appears; record a fresh row and assert it clears.
- **When an action does delete-then-reinsert on a join table to "update" an
  assignment** (e.g. replacing a set of linked rows), check whether any column
  on that table carries meaning tied to *when the row was created* (like an
  `assignedAt`). Delete+reinsert resets it for every row, not just the ones that
  actually changed — diff the old vs. new set and only touch what changed.
