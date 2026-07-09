-- Bed maintenance tracking: watering (7d), turning (10d), bio-enzyme (15d)
-- rolling schedule, anchored on order_beds.assigned_at via order_bed_id.
-- New table only — additive, no existing table shape changes. Also widens
-- inventory_transactions.type to include "issue_to_bed_maintenance", which
-- needs no SQL since Drizzle emits no CHECK constraint for sqlite text
-- enums (confirmed against migration 0000's DDL) — the column is already a
-- plain `text NOT NULL`.

CREATE TABLE `bed_maintenance_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_bed_id` integer NOT NULL REFERENCES `order_beds`(`id`) ON DELETE cascade,
	`task_type` text NOT NULL,
	`item_id` integer REFERENCES `items`(`id`),
	`qty_applied` real,
	`notes` text,
	`performed_by` integer NOT NULL REFERENCES `users`(`id`),
	`performed_at` text DEFAULT (datetime('now')) NOT NULL
);
CREATE INDEX `bml_order_bed` ON `bed_maintenance_log` (`order_bed_id`);
CREATE INDEX `bml_task` ON `bed_maintenance_log` (`order_bed_id`,`task_type`);
