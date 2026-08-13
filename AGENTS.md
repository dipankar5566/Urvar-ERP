<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Urvar ERP

Custom manufacturing ERP for Urvar Natural Pvt. Ltd. (organic fertilizer / vermicompost).
**Scope is final**: Production, Quality Control, Inventory, Procurement. CRM, Sales, Finance,
and HR are permanently out — separate applications already cover them. Don't propose building
any of the four.

## Architecture rules

- **Stack**: Next.js 16 (App Router, Turbopack, async-only `cookies()`/`params`, `proxy.ts`
  not `middleware.ts`) + Drizzle ORM + PostgreSQL (`node-postgres` `Pool`, connection string in
  `DATABASE_URL`) + Tailwind + shadcn/ui (Base UI variant — `@base-ui/react`, not Radix).
  The project began on better-sqlite3; `data/urvar.db` is a leftover of that and is no longer
  read by anything — the live database is Postgres. Because the pool may hand a different
  connection to each query, anything that must run inside one transaction takes the `tx`
  handed to it (`DbOrTx`) rather than closing over the module-level `db`.
- **Mutations are Server Actions, not API routes.** No internal REST/JSON endpoints for CRUD —
  every write is a `"use server"` function in a module's `actions.ts`, called directly from a
  client component via `useTransition` or through `FormDialog`.
- **Every stock movement goes through `postTransaction()`** (`src/lib/ledger.ts`). Never write
  to `stock_balances` directly. `inventory_transactions` is the immutable, append-only source
  of truth; `stock_balances` is a derived running total keyed on
  `(itemId, warehouseId, zoneId, lotId, batchId)` — the ledger function maintains both in the
  same call.
- **Every multi-step mutation runs inside `atomic()`** (`db.transaction`, also in
  `ledger.ts`) — partial writes on error are not acceptable. **Two deliberate exceptions:**
  `procurement/actions.ts` and `production/actions.ts` had their `atomic()` wrappers removed
  on request and now write directly on `db`. Consequences that are live in those two modules,
  not hypothetical: a FIFO shortage part-way through `startProductionOrder` leaves earlier
  materials already issued (reverse them with a manual stock adjustment before retrying, or
  they are consumed twice); a failed line insert in `savePurchaseOrder`'s edit branch leaves
  the PO with no lines; and concurrent `completeProductionOrder` calls can collide on the
  `UNIQUE batches.batch_no`. Guard clauses in those two files therefore validate *before* the
  first write and `return { ok: false }` instead of throwing mid-sequence — keep that ordering
  when editing them. Every other module still uses `atomic()`; don't remove it from them.
- **Every mutation calls `writeAudit()`** — action name, entity, entityId, before/after JSON.
- **Zod-validate every Server Action's input**, return the shared `ActionResult` type
  (`{ ok: true } | { ok: false; error: string }`, defined in `src/modules/masters/actions.ts`,
  imported everywhere else).
- **RBAC via `requireUser()` / `requireAdmin()`** (`src/lib/session.ts`) called first thing
  inside every action — never trust client-side role checks alone (the UI hides buttons the
  wrong role shouldn't see, but the action re-checks regardless).
- **FIFO lot selection is centralized** in `pickFifoLots()` (`src/lib/fifo.ts`) — reused by
  production issue, bed maintenance, and warehouse transfers. Don't reimplement FIFO inline.
  Each returned pick carries a `zoneId` (`stock_balances` is keyed on zone as well as lot) —
  **always pass `pick.zoneId` through to `postTransaction`**, never omit it. This was a real
  bug: omitting it makes `postTransaction` target a zone-less balance row instead of the one
  FIFO actually picked from, throwing a false "insufficient stock" error even when the real
  stock is sitting right there in a zone.
- **The QC dispatch gate**: negative stock adjustments against `finished_good` batches are
  blocked unless `batches.qcStatus = 'released'` — this is currently the *only* place finished
  goods leave the system, so it's where QC is enforced. Warehouse transfers are deliberately
  **not** QC-gated (a transfer is a location change, not a dispatch) — if you add a new path
  that removes finished-goods stock, decide explicitly which side of that line it's on and say
  so in a comment.
- **Schema changes are additive by default.** New columns are nullable FKs or have defaults;
  existing flows (ad-hoc Goods Receipt with no vendor/PO, a warehouse with zero zones, etc.)
  must keep working unchanged after the change ships. Breaking an existing table shape needs a
  deliberate reason, not just convenience.
- **Wide-parameter data uses a flexible parameter/value table**, not new fixed columns per
  parameter — see `stage_readings` and `batch_test_results` for the pattern. Reach for this
  whenever the parameter list is open-ended (lab tests, readings) rather than a fixed, known set.
- **Derived time-based status is computed on read, never stored.** `getBedLayout()`
  (`src/modules/layout/queries.ts`) is the reference: `stale`, `hasDeviation`, and bed
  maintenance due-dates (watering/turning/bio-enzyme) are all recomputed fresh on every call
  from a log table plus an anchor timestamp — there's no cron job and no "status" column that
  could drift out of sync. Follow this for any new due/overdue/stale concept instead of a
  scheduled-job table.
- **Production cost distinguishes "unknown" from "zero."** `lots.rate` and
  `batches.laborCost`/`overheadCost` are nullable, never defaulted — null means no cost was ever
  recorded (e.g. an ad-hoc Goods Receipt left the rate blank), and cost calculations must
  exclude that line from totals rather than treat it as ₹0, or the total silently understates
  real cost. See `getBatchDetail()` (`src/modules/batches/queries.ts`) for the pattern. Material
  cost is derived/traced (rate × qty consumed, per lot, via `batch_inputs`); labor/overhead are
  manual lump-sum entries at Complete Order time, not calculated from any timesheet or wage
  data — none exists in this app. A lot's `rate` is copied automatically from its PO line when
  linked; ad-hoc receipts get a manual optional field. If a lot is later found PO-linked but
  still missing a rate (predates this feature), backfill it from `purchase_order_lines.rate`
  directly rather than asking for manual re-entry — the correct number already exists there.
- **Never sum a quantity across products/items without checking they share a unit.** Different
  products can have different `uom` (ton/litre/kg/...) — a blind `sum(qty)` silently adds
  incompatible units into one meaningless number. The Dashboard's production summary is
  per-product for exactly this reason (`getDashboardData()`'s `productionByProduct`) — it
  replaced an earlier cumulative-KPI design that had this bug. The same rule shapes every
  chart: charts (recharts, shared wrappers in `src/components/charts.tsx`) plot ONE entity's
  series at a time behind a product/item selector — never multiple entities with different
  units on a shared axis.
- **All user-facing numbers go through `src/lib/format.ts`** — `fmtQty` (up to 3 decimals,
  en-IN grouping), `fmtMoney` (₹ + lakh/crore grouping), `fmtPct`. Never render a raw
  `Number(x.toFixed(n))` in JSX; the shared formatters are what keep 1,45,000 looking the same
  on every page. (CSV exports and numeric input defaults stay raw — formatters are for display.)
- **All site-map geometry is data, not code.** Zone outlines (`zones.polygon` + label anchor),
  the plot boundary, the access strip, and structures like the Machine Shed all live in the DB
  (`site_features` table, JSON `[x,y][]` polygons in site-plan feet, y grows north) and are
  rendered by `layout-map/layout-view.tsx` from `getBedLayout()`. The constants in
  `src/modules/layout/site-geometry.ts` are the surveyed **seed source only** — editing them
  does not change an existing installation's map; change the DB rows instead. Structures can
  optionally link to a `warehouses` row via `site_features.warehouse_id` (the Machine Shed &
  Godown does). Admins edit all of this on the map itself ("Edit layout" on `/layout-map`,
  desktop-only): `layout-editor.tsx` accumulates a client-side draft and persists it in ONE
  atomic `saveLayoutEdits()` call guarded by a layout-version fingerprint
  (`computeLayoutVersion()`) so concurrent edits conflict loudly instead of clobbering. Beds
  are **retired, never deleted** (`beds.active = 0` — history survives; `getBedLayout` filters
  them out everywhere), and occupied beds refuse retirement. Overlap/outside-zone conditions
  are *warnings*, not save blockers — real sites cheat margins. The one hard blocker is a
  self-intersecting ("bowtie") polygon — it breaks point-in-polygon everywhere, so the editor
  disables Save and the action rejects it. The editor's "Zones & plot" tool reshapes zone
  outlines, the plot boundary, and the access strip vertex-by-vertex (drag to move, press an
  edge midpoint to insert, double-click to remove) and draws whole new zones click-by-click
  (auto-coded Z3, Z4…); zone map labels are draggable. New zones become assignable to beds only
  after saving (a draft bed can't reference an unsaved zone id). Shared geometry math
  (point-in-polygon, bed quad, SAT overlap, self-intersection) lives in
  `src/modules/layout/geometry.ts`, used by both the editor and the server action.
- **`drizzle-kit migrate` does not work in this environment** — it exits 1 with no error
  output even against a fresh DB, and the `__drizzle_migrations` ledger is permanently out of
  sync with reality (migrations were never successfully applied through it). Apply new
  migration SQL files directly instead: split on `--> statement-breakpoint` and execute against
  the `DATABASE_URL` database, then restart the dev server. Keep writing migration files as the
  upgrade record regardless. Also: don't mix ALTERs with DML that reads the new columns in one
  file — split DDL (see 0010) and backfill (0011) so each file prepares cleanly on its own.
  Note there is no `psql`/`pg_dump` on this machine — run SQL through a small Node script using
  the `pg` client (with `dotenv` for `DATABASE_URL`), and take backups the same way.
- **Status colors are semantic theme tokens**, defined once in `globals.css`: `--success`
  (healthy/composting), `--warning` (needs attention), `--info` (structures/informational),
  plus the categorical `--chart-1..5` ramp for chart series. Use `text-success`,
  `fill-warning`, `bg-info/15` etc. — never hardcode `emerald-*`/`amber-*`/`sky-*` utility
  classes for status meaning. Badge variant maps live in each module's plain `badges.ts`
  (`production/badges.ts`, `procurement/badges.ts`, `batches/badges.ts`, `quality/badges.ts`),
  never exported from a `"use client"` file.

## Naming conventions

- **Database**: `snake_case` table and column names; Drizzle schema fields are `camelCase` and
  map automatically (e.g. `text("po_no")` → `poNo`). Table names are plural snake_case
  (`warehouse_zones`, `purchase_order_lines`).
- **Document numbering**: `PREFIX-YYMM-###` via `nextDocNumber()` and the `DOC_NUMBER_TARGETS`
  registry in `src/lib/numbering.ts`. Current prefixes: `LOT`, `PO` (**production orders** —
  `order_no`, do not reuse for anything else), `CAPA`, `TRF` (transfers), `PUR` (vendor
  purchase orders — deliberately not `PO`, which was already taken). Adding a new document
  type means adding one entry to that registry, not inventing a parallel numbering scheme.
  Batch numbers are the one exception: `UV-{productCode}-{YYMMDD}-##` via `nextBatchNumber()`.
- **Module folders**: `src/modules/<domain>/` holds `actions.ts` (`"use server"` mutations),
  `queries.ts` (read-only Drizzle selects, no `"use server"`), `types.ts` (`InferSelectModel`
  re-exports + shared constants/enums), and optionally `badges.ts` (status → label/variant
  lookup maps shared between server and client components — never import a value from a
  `"use client"` file into a server component, keep these in plain modules).
- **Route folders**: `src/app/(app)/<route>/` holds `page.tsx` (async Server Component — fetch
  data, `requireUser()`/`requireAdmin()`, pass everything down as props) and
  `<route>-view.tsx` (`"use client"`, holds all interactivity: dialogs, forms, tabs). Nested
  detail routes follow `<route>/[id]/page.tsx` (see `production/[id]`, `batches/[id]`).
- **Every `actions.ts` defines its own local `fail(e: unknown): ActionResult` helper** at the
  top — copy the existing one, don't add a shared import for it (deliberately duplicated, kept
  trivial on purpose).
- **Dialogs**: simple single-level forms use `FormDialog` + `NativeSelect`
  (`src/components/form-dialog.tsx`), which wires a plain `<form>` straight to a Server Action.
  Dialogs needing client-side derived state (conditional fields, dynamic line items, rate
  lookups) are hand-built with `Dialog`/`DialogContent` from `src/components/ui/dialog.tsx` and
  call the action via `useTransition` — see `FormulaDialog` (`masters/formula-editor.tsx`) or
  `PODialog` (`procurement/procurement-view.tsx`) as the reference pattern for a new one.

## Deployment reality — read before touching a build or the database

- **`localhost:3001` IS production.** `erp.urvarindia.com` is a Cloudflare tunnel pointing at
  port 3001 on this machine; there is no other host, no CI, and nothing deploys on `git push`.
  The process is normally started by hand as Administrator, so a non-elevated session cannot
  kill or restart it — that step needs the user.
- **`DATABASE_URL` is the production database.** The local Postgres `urvar_erp` is what the
  live site serves. There is no separate dev database: any wipe, seed or migration run from
  this repo hits real business data immediately. `urvar_crm` also reads it live over
  `postgres_fdw`. Snapshot before destructive work — there is no `pg_dump` here, so dump every
  table to JSON with the `pg` client (see `backups/`, which is git-ignored).
- **Never run `next build` into the live `.next`.** A build that fails at prerender has already
  overwritten `static/chunks` with new hashed filenames, so the running server keeps serving
  HTML referencing files that no longer exist — every chunk 404/500s, pages render as blank
  shells, and *HTTP checks still return 200*. Copying `.next` aside is not a safe backup either:
  `cp -r` turns Turbopack's junction points into real directories and the next `next dev` panics
  with `failed to create junction point … The directory is not empty`. Build into a scratch
  `distDir` and swap only on success; if `.next` is already broken, delete it entirely and let
  dev mode rebuild.
- **Running `next dev` behind the tunnel needs `allowedDevOrigins`** (`next.config.ts`). Without
  the tunnel hostname listed, Next blocks its own dev assets cross-origin: pages render but no
  button, dialog or tab responds, because client JS never initialises. Server-rendered HTML
  looks perfect, so this only shows up by driving the real UI.
- **Always work from `D:\Urvar-ERP` — the exact casing matters.** Windows resolves
  `D:\urvar-erp` to the same folder, but Turbopack treats the two spellings as different roots
  and ends up with two copies of `work-async-storage.external`, a module Next requires to be a
  singleton. The build then dies on every route — including built-ins like `/_global-error` —
  with `InvariantError: Expected workStore to be initialized` from
  `next/dist/server/request/{params,search-params,pathname}.js`. Nothing in the app is wrong
  when this happens: same commit, same `node_modules`, correct casing builds and wrong casing
  does not. `ecosystem.config.js` pins `cwd` to the correct spelling for this reason. If you
  ever see that invariant, check `pwd` before suspecting anything else — it cost most of a day
  once, chasing app code, Next versions and a needless `npm ci`.
- **Production runs `next start` under PM2** (`ecosystem.config.js`, app name `urvar-erp`).
  After a code change: `npx next build` then `npx pm2 restart urvar-erp`. `npx pm2 save` keeps
  the process list across reboots, and a logon script in the user's Startup folder runs
  `pm2 resurrect` — note that is *logon*, not boot, because `pm2 startup` is not supported on
  Windows and Task Scheduler needs Administrator.
- **A 200 is not proof the site works.** Both outages in this repo's history served 200 for the
  HTML while the app was dead client-side. Verify by logging in and loading pages with
  Playwright, failing on any 4xx/5xx sub-resource — `verify-live.mjs` and `diag-buttons.mjs`
  at the repo root do exactly this, the latter read-only (it opens dialogs and presses Escape,
  never submits) so it is safe to point at production.

## Test expectations

- **There is no unit/integration test suite in this repo, and none should be added unprompted.**
  Correctness is established by driving the real running app, not by `npm test`.
- **Verification means**: start the dev server, drive the actual flow through the browser
  (Playwright + system Chrome, `chromium.launch({ channel: "chrome", headless: true })`), and
  cross-check the outcome directly against Postgres via a `pg` client script — ledger rows,
  status transitions, stock balances. Toast text alone is not sufficient evidence (Sonner
  toasts can lag one action behind in a tight automated loop). Two gotchas that have produced
  hangs and false passes: PO row actions live inside the detail dialog behind the
  `aria-label="View"` eye icon rather than in the table row, and closing a PO with nothing
  received fires a real `window.confirm` — register a Playwright `dialog` handler or the click
  blocks for the full timeout. Hand-built dialogs also hydrate their state a tick after mount,
  so a `fill()` issued too early is silently overwritten by the persisted value; wait for the
  existing value to appear, then type over it and assert it stuck.
- **`.claude/skills/verify/SKILL.md`** is this repo's accumulated verification recipe and
  gotcha list — read it before writing a new verification script, and add to it when you learn
  something new (a UI quirk, a race condition, a locator ambiguity that produced a false pass).
- **Root-level `phaseN-verify.mjs` scripts** (`e2e-walkthrough.mjs`, `bed-layout-verify.mjs`,
  `phase3-verify.mjs`, `phase4-verify.mjs`, …) are the canonical record of how each phase was
  verified — read the most recent one before writing a new one instead of re-deriving the
  driving pattern from scratch.
- **`npm run typecheck` and `npm run lint` must both be clean** before calling a change done —
  but neither substitutes for actually running the app; they catch different classes of bugs
  than live verification does.

## Repo map

```
src/
  app/
    login/                      # unauthenticated login route
    (app)/                      # authenticated routes, wrapped in AppShell (src/components/app-shell.tsx)
      layout.tsx                # session check + sidebar shell
      dashboard/                # per-product production summary + 30-day trend chart (never
                                 # cumulative — see architecture rules), active orders, Stock
                                 # Alerts (low stock + expiry), Bed Maintenance alerts, Quick-PO
      production/               # production orders, [id] = per-order stage workflow
      layout-map/                # site layout (vermicompost beds), real-time tracking,
                                  # bed maintenance (watering/turning/bio-enzyme schedules);
                                  # renders zones/boundary/structures from DB (site_features)
      quality/                  # incoming inspection, batch testing, CAPA
      batches/                  # batch list + cost/yield chart + [id] traceability + cost detail
      inventory/                # stock overview, ledger, goods receipt, transfer, expiry, aging,
                                 # stock-level trends
      procurement/              # vendors' purchase orders, approve/cancel/close workflow
      masters/                  # products, items, formulas, workflows, warehouses+zones, vendors, users
  components/
    ui/                          # shadcn/ui primitives (Base UI variant)
    app-shell.tsx                # sidebar nav (NAV array — add new top-level routes here)
    form-dialog.tsx              # FormDialog + NativeSelect (simple Server-Action-backed dialogs)
    charts.tsx                   # shared recharts wrappers (one entity per chart — see rules)
  modules/                      # domain logic, no JSX — one folder per business domain
    auth/  masters/  production/  quality/  inventory/  procurement/  batches/  dashboard/  layout/
  lib/
    session.ts                   # requireUser / requireAdmin / getSessionUser
    ledger.ts                    # postTransaction, atomic, writeAudit — core inventory engine
    fifo.ts                      # pickFifoLots — shared FIFO lot selection
    numbering.ts                 # nextDocNumber, nextBatchNumber, DOC_NUMBER_TARGETS
    dates.ts                     # parseStoredDate, fmtDateTime, localDateISO
    format.ts                    # fmtQty / fmtMoney / fmtPct — ALL displayed numbers use these
    password.ts  utils.ts
  db/
    schema.ts                    # all Drizzle table definitions, single file
    index.ts                     # db + pg Pool; Db / Tx / DbOrTx types
    migrations/                  # hand-written SQL (drizzle-kit generate --custom + edit)
    seed.ts  seed-beds.ts
  proxy.ts                        # Next 16's middleware.ts equivalent — session cookie handling
.claude/skills/verify/SKILL.md    # verification recipe + accumulated gotchas — read before testing
*.mjs (repo root)                 # phaseN-verify.mjs / e2e-walkthrough.mjs — verification scripts
data/urvar.db                     # dead SQLite file from the pre-Postgres era — nothing reads it
```
