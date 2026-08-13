-- Phase 2: import ERP's two read-only views into CRM's database as
-- foreign tables. Run against urvar_crm.

CREATE EXTENSION IF NOT EXISTS postgres_fdw;

CREATE SERVER IF NOT EXISTS erp_server
  FOREIGN DATA WRAPPER postgres_fdw
  OPTIONS (host 'localhost', port '5432', dbname 'urvar_erp');

-- Mapped for the `postgres` role specifically, since that's the identity
-- CRM's own Prisma client connects as (per its README connection string) —
-- not a broad PUBLIC mapping.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_user_mappings um
    JOIN pg_foreign_server fs ON fs.oid = um.srvid
    WHERE fs.srvname = 'erp_server' AND um.usename = 'postgres'
  ) THEN
    CREATE USER MAPPING FOR postgres SERVER erp_server
      OPTIONS (user 'crm_reader', password 'crm_reader_dev_pw');
  END IF;
END
$$;

CREATE SCHEMA IF NOT EXISTS erp_foreign;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.foreign_tables
    WHERE foreign_table_schema = 'erp_foreign' AND foreign_table_name = 'v_stock_available'
  ) THEN
    EXECUTE 'IMPORT FOREIGN SCHEMA erp LIMIT TO (v_stock_available, v_product_catalog) FROM SERVER erp_server INTO erp_foreign';
  END IF;
END
$$;
