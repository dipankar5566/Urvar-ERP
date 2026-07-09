-- Phase 4: Procurement — vendors, purchase orders, and optional PO/vendor
-- linkage on lots. All additive; existing goods-receipt flow is unaffected.

CREATE TABLE `vendors` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`contact_name` text,
	`phone` text,
	`email` text,
	`gstin` text,
	`address` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
CREATE UNIQUE INDEX `vendors_name_unique` ON `vendors` (`name`);

CREATE TABLE `purchase_orders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`po_no` text NOT NULL,
	`vendor_id` integer NOT NULL REFERENCES `vendors`(`id`),
	`status` text DEFAULT 'draft' NOT NULL,
	`expected_delivery_date` text,
	`remarks` text,
	`created_by` integer NOT NULL REFERENCES `users`(`id`),
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`approved_by` integer REFERENCES `users`(`id`),
	`approved_at` text
);
CREATE UNIQUE INDEX `purchase_orders_po_no_unique` ON `purchase_orders` (`po_no`);

CREATE TABLE `purchase_order_lines` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`po_id` integer NOT NULL REFERENCES `purchase_orders`(`id`),
	`item_id` integer NOT NULL REFERENCES `items`(`id`),
	`qty` real NOT NULL,
	`uom` text NOT NULL,
	`rate` real NOT NULL,
	`received_qty` real DEFAULT 0 NOT NULL
);
CREATE INDEX `pol_po` ON `purchase_order_lines` (`po_id`);
CREATE INDEX `pol_item` ON `purchase_order_lines` (`item_id`);

ALTER TABLE `lots` ADD COLUMN `vendor_id` integer REFERENCES `vendors`(`id`);
ALTER TABLE `lots` ADD COLUMN `po_id` integer REFERENCES `purchase_orders`(`id`);
ALTER TABLE `lots` ADD COLUMN `po_line_id` integer REFERENCES `purchase_order_lines`(`id`);
