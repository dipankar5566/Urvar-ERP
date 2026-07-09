-- Optional sub-locations within a warehouse.
CREATE TABLE warehouse_zones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
  name TEXT NOT NULL,
  code TEXT,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX wz_warehouse ON warehouse_zones(warehouse_id);

-- zoneId is nullable on both tables, so a plain ADD COLUMN works (unlike the
-- NOT NULL + dynamic-default case in migration 0003).
ALTER TABLE inventory_transactions ADD COLUMN zone_id INTEGER REFERENCES warehouse_zones(id);
ALTER TABLE stock_balances ADD COLUMN zone_id INTEGER REFERENCES warehouse_zones(id);

-- Widen the stock balance uniqueness key to include zone.
DROP INDEX sb_unique;
CREATE UNIQUE INDEX sb_unique ON stock_balances(item_id, warehouse_id, zone_id, lot_id, batch_id);

-- Warehouse-to-warehouse transfers.
CREATE TABLE transfers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transfer_no TEXT NOT NULL UNIQUE,
  item_id INTEGER NOT NULL REFERENCES items(id),
  batch_id INTEGER REFERENCES batches(id),
  qty REAL NOT NULL,
  uom TEXT NOT NULL,
  from_warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
  to_warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
  from_zone_id INTEGER REFERENCES warehouse_zones(id),
  to_zone_id INTEGER REFERENCES warehouse_zones(id),
  remarks TEXT,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);