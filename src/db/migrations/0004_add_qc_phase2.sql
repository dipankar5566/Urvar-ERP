-- Incoming inspection fields on lots. Constant defaults (unlike the
-- assigned_at case in migration 0003), so plain ADD COLUMN works here.
ALTER TABLE lots ADD COLUMN qc_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE lots ADD COLUMN moisture_pct REAL;
ALTER TABLE lots ADD COLUMN foreign_matter_pct REAL;
ALTER TABLE lots ADD COLUMN odour TEXT;
ALTER TABLE lots ADD COLUMN visual_condition TEXT;
ALTER TABLE lots ADD COLUMN inspection_remarks TEXT;
ALTER TABLE lots ADD COLUMN inspected_by INTEGER REFERENCES users(id);
ALTER TABLE lots ADD COLUMN inspected_at TEXT;

-- Manual deviation flag on readings.
ALTER TABLE stage_readings ADD COLUMN is_deviation INTEGER NOT NULL DEFAULT 0;

-- Finished-product testing.
CREATE TABLE batch_test_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id INTEGER NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  parameter TEXT NOT NULL,
  value REAL,
  text_value TEXT,
  unit TEXT,
  recorded_by INTEGER NOT NULL REFERENCES users(id),
  recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX btr_batch ON batch_test_results(batch_id);

-- Corrective and Preventive Action.
CREATE TABLE capas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  capa_no TEXT NOT NULL UNIQUE,
  issue TEXT NOT NULL,
  root_cause TEXT,
  corrective_action TEXT,
  preventive_action TEXT,
  responsible_user_id INTEGER REFERENCES users(id),
  deadline TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  linked_batch_id INTEGER REFERENCES batches(id),
  linked_lot_id INTEGER REFERENCES lots(id),
  verification_notes TEXT,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at TEXT
);

-- batches.qc_status enum widens (pending/sample_collected/testing/released/hold)
-- — TS-only typing, no DB change needed for the column itself.