-- Per-bed readings: which specific bed a reading was taken from.
ALTER TABLE stage_readings ADD COLUMN bed_id INTEGER REFERENCES beds(id);
CREATE INDEX sr_bed ON stage_readings(bed_id);

-- When a bed joined an order — may be later than the order's own start.
-- SQLite's ALTER TABLE ADD COLUMN rejects a non-constant DEFAULT on a
-- NOT NULL column, so recreate the (small) order_beds table instead.
CREATE TABLE order_beds_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES production_orders(id) ON DELETE CASCADE,
  bed_id INTEGER NOT NULL REFERENCES beds(id),
  assigned_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO order_beds_new (id, order_id, bed_id, assigned_at)
  SELECT id, order_id, bed_id, datetime('now') FROM order_beds;
DROP TABLE order_beds;
ALTER TABLE order_beds_new RENAME TO order_beds;
CREATE UNIQUE INDEX ob_order_bed ON order_beds(order_id, bed_id);
CREATE INDEX ob_bed ON order_beds(bed_id);