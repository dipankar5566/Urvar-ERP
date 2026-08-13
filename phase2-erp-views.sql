-- Phase 2: narrow read-only contract exposed to CRM via postgres_fdw.
-- Lives in its own schema so crm_reader can be granted USAGE on exactly
-- this schema (and SELECT on exactly these two views) with zero access to
-- the real tables in `public`.

CREATE SCHEMA IF NOT EXISTS erp;

-- Live finished-goods stock, aggregated across all warehouses. CRM only
-- needs "how much of this sellable product exists," not ERP's internal
-- warehouse/zone/lot breakdown.
CREATE OR REPLACE VIEW erp.v_stock_available AS
SELECT
  p.id AS erp_product_id,
  p.name AS product_name,
  p.code AS product_code,
  i.uom,
  COALESCE(SUM(sb.qty), 0) AS qty_available
FROM products p
JOIN items i ON i.product_id = p.id AND i.category = 'finished_good'
LEFT JOIN stock_balances sb ON sb.item_id = i.id
WHERE p.active = true
GROUP BY p.id, p.name, p.code, i.uom;

-- Finished-goods catalog for product master sync (Phase 5). Note: ERP has
-- no GST/tax-rate field on products today (only `hsn`, the tax
-- classification code) — the plan assumed a gstPercent column that doesn't
-- actually exist in this schema, so it's omitted here rather than
-- fabricated; CRM keeps owning gstPercent entirely.
CREATE OR REPLACE VIEW erp.v_product_catalog AS
SELECT
  p.id AS erp_product_id,
  p.name AS product_name,
  p.code AS product_code,
  p.hsn,
  i.uom,
  i.category
FROM products p
LEFT JOIN items i ON i.product_id = p.id AND i.category = 'finished_good'
WHERE p.active = true;

-- Dedicated read-only role for the FDW boundary. Not the app's own
-- `postgres` connection — a distinct, minimally-privileged identity
-- enforced by Postgres's own GRANT system regardless of application bugs.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'crm_reader') THEN
    CREATE ROLE crm_reader WITH LOGIN PASSWORD 'crm_reader_dev_pw';
  END IF;
END
$$;

GRANT USAGE ON SCHEMA erp TO crm_reader;
GRANT SELECT ON erp.v_stock_available, erp.v_product_catalog TO crm_reader;
-- No grants on `public` at all — crm_reader cannot see the real tables.
