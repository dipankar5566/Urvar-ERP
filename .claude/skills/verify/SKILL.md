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
supervisor/super123. `node phase3-verify.mjs` covers the Inventory Depth flow:
warehouse transfer (raw material FIFO + a specific finished-goods batch, incl.
a `hold`-status batch to confirm transfers aren't QC-gated but adjustments still
are), same-warehouse transfer rejection, Expiry/Aging tabs, zone-scoped goods
receipt, and the dashboard Stock Alerts card. `node phase4-verify.mjs` covers
Procurement: vendor creation, a multi-line draft PO, the numbering split
between `PO-` (production orders) and `PUR-` (purchase orders), the
draft→approved→partially_received→closed status machine driven entirely by
Goods Receipt's PO-linked picker, rate-history auto-suggest on a repeat PO,
Edit/Cancel controls disappearing once a PO leaves `draft`/`approved`, the
Dashboard Quick-PO shortcut, and ad-hoc (no PO) Goods Receipt still working
unchanged.

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
- **Sonner toast text lags one action behind when you click-then-immediately-read
  it in a tight Playwright loop** — `page.locator("[data-sonner-toast]").last()`
  can return the *previous* toast because the new one hasn't mounted yet. Don't
  trust toast text as evidence for a multi-step flow; verify the actual outcome
  via `sqlite3` (row values, `audit_log` ordering) instead. This isn't an app bug,
  just a test-harness race — seen repeatedly verifying the Phase 2 QC workflow.
- **A locator like `button:has-text('Adjust')` matches substrings across the
  whole page** — e.g. it matched both the sidebar's "Adjustment" nav trigger and
  a dialog's "Adjust" submit button, and Playwright silently clicked the first
  DOM match (the wrong one), leaving the intended action untested while looking
  like it passed. Scope dialog-submit clicks to
  `[role=dialog] button[type=submit]:has-text('...')`, and scope picker options
  with `.find(o => o.startsWith(exactPrefix))` instead of `.includes()` — a loose
  `.includes()` match against a list of similar option labels (e.g. multiple
  batch numbers) silently selects the first match, not necessarily the one you
  meant, and the mistake produces a passing-looking result instead of an error.
- **After completing/holding/releasing a batch or order in one script run,
  re-derive "which one is fresh" from the DB (`select id, batch_no, qc_status
  from batches`) before writing the next script** — don't assume a specific ID
  or that a button (e.g. "Hold") is still present; state from the previous run
  changes what actions are even available on the page.
- **Two dev servers can be running at once** (a leftover from a previous session
  plus a fresh one) — `lsof -i :3000` may report an *unrelated* app on this
  machine (a different project's "Urvar HR" login page also lives at :3000).
  Confirm with `curl -s http://localhost:PORT/login | grep -o 'id="username"'`
  (this app's login form) before trusting a port, and cross-check with `ps aux
  | grep next-server` / `lsof -i -P -sTCP:LISTEN | grep node` for the actual
  urvar-erp process's port.
- **Masters → Warehouses → per-row "Zone" button opens a dialog with `warehouseId`
  baked in as a hidden field**, not a `<select>`; scope the button click to that
  warehouse's table row (e.g. `page.locator("tr", { has: page.locator("text=<name>")
  }).locator("button:has-text('Zone')")`) rather than picking a warehouse in the
  dialog — there isn't one.
- **To test the QC-dispatch-gate-vs-transfer divergence (transfers aren't
  QC-gated, adjustments still are) without waiting for a real hold**, just
  flip one batch's `qc_status` directly: `sqlite3 data/urvar.db "update batches
  set qc_status='hold' where id=<id>"`. Combined with backdating `expiry_date`
  the same way for the Expiry tab/dashboard checks — both are synthetic test
  data left in `data/urvar.db` after a verify run, harmless in dev but worth
  noting if inspecting the DB afterward looks odd.
- **Two prefixes look alike but hit different tables**: `PO-YYMM-###` is a
  production order (`production_orders.order_no`), `PUR-YYMM-###` is a vendor
  purchase order (`purchase_orders.po_no`) — `src/lib/numbering.ts`'s
  `DOC_NUMBER_TARGETS`. Don't grep for "PO-" expecting only one kind of
  document.
- **The Goods Receipt "Purchase Order" `<select>` only renders at all once
  `openPOLines.length > 0`** — with zero approved/partially-received PO lines
  in the DB (e.g. a bare seed, or every PO still `draft`), `#gr-po` doesn't
  exist in the DOM and a Playwright locator for it will just time out; check
  for its presence rather than assuming it's always there.
- **A `partially_received` PO can never legitimately hit the
  "cancel a PO with receipts" server-side rejection through the UI** — any
  receipt flips status straight from `approved` to `partially_received`, and
  the Cancel button is only rendered for `draft`/`approved`, so the check in
  `cancelPurchaseOrder` (reject if any line's `receivedQty > 0`) is unreachable
  in normal use. That's intentional defense-in-depth, not dead code to "fix" —
  confirm the UI gating (button absent) rather than trying to force the
  action call through the interface.
- **New Order dialog: don't assume a product's own name matches the formula
  linked to it.** `formulas.productId` can point somewhere unexpected (e.g.
  the "Vermicompost Standard" formula is linked to product id 2, "Enriched
  Vermicompost", not product id 1, "Vermicompost" itself) — this drifts as
  the user edits Masters. Check `select id,name,product_id from formulas`
  first and select whichever product actually has an active formula, or the
  `#po-formula` select stays stuck on "No formula for this product" and
  every later step silently has nothing to submit.
- **Forcing a derived "overdue" state without waiting in real time**: for
  anything anchored on a bed's `order_beds.assigned_at` (bed maintenance due
  dates, "days in bed") and not yet backed by its own log row, backdate that
  one column — `sqlite3 data/urvar.db "update order_beds set assigned_at =
  datetime('now','-11 days') where id = <id>"` — rather than trying to
  backdate individual log rows. A task that already has a log entry anchors
  on that entry instead, so this only affects tasks still showing "never
  logged".
- **Reversing a test production order's stock effects**: `stock_balances` is
  a plain running sum of `inventory_transactions` for each
  `(item, warehouse, zone, lot, batch)` key (see `postTransaction` in
  `src/lib/ledger.ts`) — deleting transaction rows directly does *not*
  recompute it. After `DELETE FROM inventory_transactions WHERE ref_id=<id>
  ...`, manually add back the exact deleted quantities to the matching
  `stock_balances` rows (or delete the row outright if it was keyed on a
  `batch_id` you're also deleting, e.g. a `production_output` row's finished-
  goods balance). Check `select id,type,item_id,lot_id,batch_id,qty,ref_type,
  ref_id from inventory_transactions where ref_type='production_order' and
  ref_id=<id>` (plus any `bed_maintenance_log`/batch-linked rows) first to
  get the exact deltas before touching anything.
  action call through the interface.
- **Playwright verification scripts must live inside the repo to `import
  "playwright"`** — Node resolves ESM packages from the script file's own
  path, not the cwd, so a script in the session scratchpad can't see the
  repo's `node_modules`. Copy it to the repo root (`./x.tmp.mjs`), run, and
  delete it after; don't add playwright anywhere else.
- **Never `setPointerCapture` on an SVG that also has clickable children.**
  Capturing on pointerdown retargets the eventual `click` to the capturing
  element, so the child `<g role="button">` handlers silently never fire —
  a Playwright click "succeeds" but selects nothing. The layout map's
  pan/zoom deliberately skips capture for this reason (comment in
  `layout-view.tsx`); the symptom in a test is a detail-panel locator
  timing out after an apparently-successful bed click.
- **Clicking a rotated/diagonal SVG polygon by locator can miss** — Playwright
  aims at the bounding-box centre, which for a thin diagonal bed lies outside
  the polygon. Compute the polygon's centroid from its `points` attribute and
  `page.mouse.click()` there (see the map verification pattern), or drive
  selection through the zone-summary chip buttons instead.
- **Stale CSS survives a dev-server restart** — Turbopack's persistent cache
  (`.next/dev/...`) can keep serving an *old* copy of `globals.css` design
  tokens alongside the new one (the stale `.dark` block can win the cascade,
  so light mode looks right while dark mode shows old colors). If a token
  edit doesn't show up in the browser, don't debug the CSS — check the served
  chunk for duplicate definitions (`curl ... | grep -o -- '--chart-2:[^;]*'`),
  then `rm -rf .next` and restart the dev server.
- **`npm run db:migrate` (drizzle-kit migrate) is broken in this environment** —
  it exits 1 with *no error output* even on a fresh empty DB, and the
  `__drizzle_migrations` ledger never matched the actually-applied files. Do
  not burn time debugging its "no such column" prepare errors: apply new
  migration SQL directly to `data/urvar.db` (split file content on
  `--> statement-breakpoint`, execute statements in order — a 5-line
  better-sqlite3/python script or the sqlite3 CLI), then restart the dev
  server (stale prepared-statement metadata). Fresh-install verification:
  move `data/urvar.db*` aside, replay ALL migration files in order, run
  `npm run db:seed`, inspect, then restore the originals (the running dev
  server keeps its fd on the original inode, so a swap-back needs no
  special handling — restart anyway to be safe).
- **The site map is ~1040px tall at desktop width — coordinates below the
  viewport silently swallow pointer events.** `page.mouse.*` at a y past the
  window height fires nothing (no error, gesture just never completes:
  pointerdown logged, pointerup absent). Before driving clicks/drags on the
  map's southern half (Zone 2 / strip area), `window.scrollTo(0, ~500)` and
  recompute — the feet→client helper must re-read `boundingBox()` after
  scrolling. Symptom: an "Add structure" drag that never opens the panel.
- **Sonner toasts (top-right) intercept clicks on the header buttons under
  them** — after an error toast, a Playwright click on Cancel/Save retries
  forever because the hovering retry-pointer keeps the toast alive. Wait for
  the toast to disappear, `page.keyboard.press("Escape")`-style dismiss, or
  assert the toast text and end the scenario there instead of clicking
  through it.
