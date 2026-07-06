# Urvar ERP

Manufacturing ERP for **Urvar Natural Pvt. Ltd.** — purpose-built for organic fertilizer
production (vermicompost, PROM, FYM, potting mix, and more). Manufacturing-first:
production orders drive material issue, batch creation, and finished-goods stock
automatically through an immutable inventory ledger.

## Phase 1 (current)

- **Production** — orders (`PO-YYMM-###`), configurable manufacturing workflows
  (16-stage vermicompost flow seeded), stage-by-stage tracking with temperature /
  moisture / pH readings, FIFO raw-material issue on start, batch creation on completion.
- **Batches** — auto-numbered (`UV-VC-260707-01`), yield %, expiry from product shelf life,
  full traceability to supplier lots, QC status (drives dispatch in Phase 2).
- **Inventory** — immutable transaction ledger, goods receipts (create supplier lots),
  admin-only adjustments with reason, low-stock alerts, negative stock blocked.
- **Masters** — products, items, formulas (BOM), workflow templates, warehouses, users.
- **Dashboard** — today/month production, target vs actual, average yield, active orders,
  low stock, recent batches.
- Roles: `admin` (everything) and `supervisor` (no Masters, no adjustments).
- CSV export on batches and the stock ledger.

Phase 2 (next): Quality Control — incoming inspection, in-process checks, finished-product
testing, QC workflow gating dispatch, CAPA.

## Run it

```bash
npm install
npm run db:migrate   # create/upgrade the SQLite database (data/urvar.db)
npm run db:seed      # first time only: products, workflow, warehouse, users
npm run dev          # http://localhost:3000
```

Default logins (change these in Masters → Users):

| Role | Username | Password |
|---|---|---|
| Admin | `admin` | `admin123` |
| Supervisor | `supervisor` | `super123` |

For production use, set `SESSION_SECRET` in `.env.local`.

## Stack

Next.js 16 (App Router) · TypeScript · SQLite via Drizzle ORM (`data/urvar.db`, gitignored)
· Tailwind CSS 4 + shadcn/ui (Base UI) · Zod. No external services — runs entirely on one
machine; deploy to any Node host later, or migrate the Drizzle schema to Postgres.

## Layout

```
src/db/            schema, migrations, seed
src/lib/           session auth, ledger core, numbering, dates
src/modules/       domain logic + server actions (production, inventory, batches, masters)
src/app/(app)/     authenticated pages (dashboard, production, batches, inventory, masters)
proxy.ts           auth gate (Next 16 proxy, formerly middleware)
```

Business rules live in `src/lib/ledger.ts`: every stock movement is one ledger row +
balance update inside a single SQLite transaction, and every business mutation writes
an audit log row.

## Development

```bash
npm run typecheck        # tsc --noEmit
npm run db:generate      # regenerate migrations after schema changes
node e2e-walkthrough.mjs # browser walkthrough of the full manufacturing loop (dev server must be running)
```
