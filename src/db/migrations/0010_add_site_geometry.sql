-- Phase A of self-service site-layout editing: all map geometry becomes
-- data. zones gain their outline polygon + label anchor; a new
-- site_features table holds the plot boundary, access strip, and
-- structures (the Machine Shed & Godown moves out of code, optionally
-- linked to its existing warehouse row). Polygons are JSON [x,y][] in
-- site-plan feet (y grows northward), matching bed coordinates.
--
-- DDL only — the data backfill lives in 0011. A single file mixing the
-- ALTERs with UPDATEs that reference the new columns fails: drizzle-kit
-- migrate prepares the file's statements before the ALTERs run.

ALTER TABLE `zones` ADD `polygon` text;--> statement-breakpoint
ALTER TABLE `zones` ADD `label_x` real;--> statement-breakpoint
ALTER TABLE `zones` ADD `label_y` real;--> statement-breakpoint
CREATE TABLE `site_features` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`structure_type` text,
	`label` text,
	`polygon` text NOT NULL,
	`warehouse_id` integer REFERENCES `warehouses`(`id`),
	`active` integer DEFAULT true NOT NULL
);
