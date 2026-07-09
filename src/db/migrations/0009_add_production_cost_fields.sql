-- Production cost tracking (materials, calculated; labor/overhead, manual).
-- Additive only, all nullable.

ALTER TABLE `lots` ADD COLUMN `rate` real;
ALTER TABLE `batches` ADD COLUMN `labor_cost` real;
ALTER TABLE `batches` ADD COLUMN `overhead_cost` real;
