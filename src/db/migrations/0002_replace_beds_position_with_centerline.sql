-- Replace beds' axis-aligned (posX,posY,orientation) representation with a
-- general centerline segment (x1,y1)-(x2,y2), so beds can sit at any angle
-- to exactly match the surveyed site plan (some Zone 1 beds run diagonal).
DROP TABLE IF EXISTS order_beds;
DROP TABLE IF EXISTS beds;
DROP TABLE IF EXISTS zones;

CREATE TABLE zones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE beds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  zone_id INTEGER NOT NULL REFERENCES zones(id),
  code TEXT NOT NULL UNIQUE,
  x1 REAL NOT NULL,
  y1 REAL NOT NULL,
  x2 REAL NOT NULL,
  y2 REAL NOT NULL,
  width_ft REAL NOT NULL,
  length_ft REAL NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX beds_zone ON beds(zone_id);

CREATE TABLE order_beds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES production_orders(id) ON DELETE CASCADE,
  bed_id INTEGER NOT NULL REFERENCES beds(id)
);
CREATE UNIQUE INDEX ob_order_bed ON order_beds(order_id, bed_id);
CREATE INDEX ob_bed ON order_beds(bed_id);