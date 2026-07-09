-- Adds a free-text purchasing note to items (e.g. "Min 1000 pcs per lot" on
-- HDPE bags). Not system-enforced — just a reference surfaced on the item.
-- The "tractor"/"roll" UOM values added this phase need no migration: Drizzle
-- doesn't emit a CHECK constraint for sqlite text enums, so widening the
-- TypeScript enum in schema.ts is sufficient on its own.

ALTER TABLE `items` ADD COLUMN `remarks` text;
