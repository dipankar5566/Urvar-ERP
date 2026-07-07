CREATE TABLE `beds` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`zone_id` integer NOT NULL,
	`code` text NOT NULL,
	`length_ft` real NOT NULL,
	`width_ft` real NOT NULL,
	`pos_x` real NOT NULL,
	`pos_y` real NOT NULL,
	`orientation` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`zone_id`) REFERENCES `zones`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `beds_code_unique` ON `beds` (`code`);--> statement-breakpoint
CREATE INDEX `beds_zone` ON `beds` (`zone_id`);--> statement-breakpoint
CREATE TABLE `order_beds` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_id` integer NOT NULL,
	`bed_id` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `production_orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`bed_id`) REFERENCES `beds`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ob_order_bed` ON `order_beds` (`order_id`,`bed_id`);--> statement-breakpoint
CREATE INDEX `ob_bed` ON `order_beds` (`bed_id`);--> statement-breakpoint
CREATE TABLE `zones` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `zones_code_unique` ON `zones` (`code`);