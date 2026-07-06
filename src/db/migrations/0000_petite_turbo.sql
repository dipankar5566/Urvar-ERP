CREATE TABLE `audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`actor_id` integer NOT NULL,
	`action` text NOT NULL,
	`entity` text NOT NULL,
	`entity_id` integer,
	`before` text,
	`after` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `al_entity` ON `audit_log` (`entity`,`entity_id`);--> statement-breakpoint
CREATE INDEX `al_created` ON `audit_log` (`created_at`);--> statement-breakpoint
CREATE TABLE `batch_inputs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`batch_id` integer NOT NULL,
	`lot_id` integer NOT NULL,
	`item_id` integer NOT NULL,
	`qty_consumed` real NOT NULL,
	`uom` text NOT NULL,
	FOREIGN KEY (`batch_id`) REFERENCES `batches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`lot_id`) REFERENCES `lots`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `bi_batch` ON `batch_inputs` (`batch_id`);--> statement-breakpoint
CREATE INDEX `bi_lot` ON `batch_inputs` (`lot_id`);--> statement-breakpoint
CREATE TABLE `batches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`batch_no` text NOT NULL,
	`order_id` integer NOT NULL,
	`product_id` integer NOT NULL,
	`mfg_date` text NOT NULL,
	`expiry_date` text NOT NULL,
	`qty_produced` real NOT NULL,
	`uom` text NOT NULL,
	`expected_qty` real NOT NULL,
	`yield_pct` real NOT NULL,
	`warehouse_id` integer NOT NULL,
	`qc_status` text DEFAULT 'pending' NOT NULL,
	`dispatch_status` text DEFAULT 'in_stock' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `production_orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `batches_batch_no_unique` ON `batches` (`batch_no`);--> statement-breakpoint
CREATE TABLE `formula_lines` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`formula_id` integer NOT NULL,
	`item_id` integer NOT NULL,
	`qty_per_output` real NOT NULL,
	FOREIGN KEY (`formula_id`) REFERENCES `formulas`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `formulas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`product_id` integer NOT NULL,
	`output_qty` real NOT NULL,
	`output_uom` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `formulas_name_unique` ON `formulas` (`name`);--> statement-breakpoint
CREATE TABLE `inventory_transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`item_id` integer NOT NULL,
	`warehouse_id` integer NOT NULL,
	`lot_id` integer,
	`batch_id` integer,
	`qty` real NOT NULL,
	`uom` text NOT NULL,
	`ref_type` text,
	`ref_id` integer,
	`reason` text,
	`created_by` integer NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`lot_id`) REFERENCES `lots`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`batch_id`) REFERENCES `batches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `it_item_wh` ON `inventory_transactions` (`item_id`,`warehouse_id`);--> statement-breakpoint
CREATE INDEX `it_type` ON `inventory_transactions` (`type`);--> statement-breakpoint
CREATE INDEX `it_created` ON `inventory_transactions` (`created_at`);--> statement-breakpoint
CREATE TABLE `items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`uom` text NOT NULL,
	`product_id` integer,
	`reorder_level` real DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `items_name_unique` ON `items` (`name`);--> statement-breakpoint
CREATE TABLE `lots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`lot_no` text NOT NULL,
	`item_id` integer NOT NULL,
	`supplier_name` text NOT NULL,
	`received_qty` real NOT NULL,
	`uom` text NOT NULL,
	`received_date` text NOT NULL,
	`vehicle_no` text,
	`remarks` text,
	`created_by` integer NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lots_lot_no_unique` ON `lots` (`lot_no`);--> statement-breakpoint
CREATE TABLE `order_stages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_id` integer NOT NULL,
	`seq` integer NOT NULL,
	`name` text NOT NULL,
	`requires_readings` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`started_at` text,
	`completed_at` text,
	`done_by` integer,
	`notes` text,
	FOREIGN KEY (`order_id`) REFERENCES `production_orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`done_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `os_order_seq` ON `order_stages` (`order_id`,`seq`);--> statement-breakpoint
CREATE TABLE `production_orders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_no` text NOT NULL,
	`product_id` integer NOT NULL,
	`formula_id` integer NOT NULL,
	`template_id` integer NOT NULL,
	`warehouse_id` integer NOT NULL,
	`target_qty` real NOT NULL,
	`uom` text NOT NULL,
	`supervisor_id` integer NOT NULL,
	`shift` text DEFAULT 'general' NOT NULL,
	`planned_start` text,
	`planned_end` text,
	`started_at` text,
	`completed_at` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`remarks` text,
	`created_by` integer NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`formula_id`) REFERENCES `formulas`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`template_id`) REFERENCES `workflow_templates`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`supervisor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `production_orders_order_no_unique` ON `production_orders` (`order_no`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`code` text NOT NULL,
	`hsn` text,
	`shelf_life_months` integer DEFAULT 12 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `products_name_unique` ON `products` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `products_code_unique` ON `products` (`code`);--> statement-breakpoint
CREATE TABLE `stage_readings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_stage_id` integer NOT NULL,
	`parameter` text NOT NULL,
	`value` real NOT NULL,
	`unit` text,
	`notes` text,
	`recorded_by` integer NOT NULL,
	`recorded_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`order_stage_id`) REFERENCES `order_stages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recorded_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `sr_stage` ON `stage_readings` (`order_stage_id`);--> statement-breakpoint
CREATE TABLE `stock_balances` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_id` integer NOT NULL,
	`warehouse_id` integer NOT NULL,
	`lot_id` integer,
	`batch_id` integer,
	`qty` real DEFAULT 0 NOT NULL,
	`uom` text NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`lot_id`) REFERENCES `lots`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`batch_id`) REFERENCES `batches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sb_unique` ON `stock_balances` (`item_id`,`warehouse_id`,`lot_id`,`batch_id`);--> statement-breakpoint
CREATE INDEX `sb_item` ON `stock_balances` (`item_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text DEFAULT 'supervisor' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
CREATE TABLE `warehouses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`location` text,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `warehouses_name_unique` ON `warehouses` (`name`);--> statement-breakpoint
CREATE TABLE `workflow_template_stages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`template_id` integer NOT NULL,
	`seq` integer NOT NULL,
	`name` text NOT NULL,
	`expected_days` integer,
	`requires_readings` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`template_id`) REFERENCES `workflow_templates`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `wts_template_seq` ON `workflow_template_stages` (`template_id`,`seq`);--> statement-breakpoint
CREATE TABLE `workflow_templates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`product_id` integer,
	`active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workflow_templates_name_unique` ON `workflow_templates` (`name`);