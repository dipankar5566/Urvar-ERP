-- Backfill for 0010 (kept separate — see that file's header for why):
-- zone polygons/label anchors and the boundary/strip/Machine Shed
-- features, using the values formerly hardcoded in
-- src/modules/layout/site-geometry.ts. Fresh installs get the same rows
-- from seed-beds.ts, which skips anything already present.

UPDATE `zones` SET
	`polygon` = '[[-46.56,29.32],[44.43,124.95],[204.43,124.64],[212.71,41.05],[125.6,18.43],[69.22,-29.79]]',
	`label_x` = 150, `label_y` = 108
	WHERE `code` = 'Z1' AND `polygon` IS NULL;--> statement-breakpoint
UPDATE `zones` SET
	`polygon` = '[[-46.56,29.32],[69.22,-29.79],[133.23,-106.63],[-21.97,-235.92],[-64.7,-97.36]]',
	`label_x` = -58, `label_y` = -190
	WHERE `code` = 'Z2' AND `polygon` IS NULL;--> statement-breakpoint
INSERT INTO `site_features` (`kind`, `label`, `polygon`)
	SELECT 'boundary', 'Plot boundary', '[[44.43,124.95],[204.43,124.64],[212.71,41.05],[125.6,18.43],[69.22,-29.79],[133.23,-106.63],[184,-154.82],[13.65,-296.18],[-21.97,-235.92],[-64.7,-97.36],[-46.56,29.32]]'
	WHERE NOT EXISTS (SELECT 1 FROM `site_features` WHERE `kind` = 'boundary');--> statement-breakpoint
INSERT INTO `site_features` (`kind`, `label`, `polygon`)
	SELECT 'strip', 'Access strip', '[[133.23,-106.63],[184,-154.82],[13.65,-296.18],[-21.97,-235.92]]'
	WHERE NOT EXISTS (SELECT 1 FROM `site_features` WHERE `kind` = 'strip');--> statement-breakpoint
INSERT INTO `site_features` (`kind`, `structure_type`, `label`, `polygon`, `warehouse_id`)
	SELECT 'structure', 'godown', 'Machine Shed & Godown',
		'[[-40,12],[10,12],[10,-8],[-40,-8]]',
		(SELECT `id` FROM `warehouses` WHERE `name` = 'Machine Shed & Godown')
	WHERE NOT EXISTS (SELECT 1 FROM `site_features` WHERE `kind` = 'structure');
