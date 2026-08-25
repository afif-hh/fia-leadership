CREATE TABLE `assessment_dimensions` (
	`id` text PRIMARY KEY NOT NULL,
	`instrument_id` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`description` text,
	FOREIGN KEY (`instrument_id`) REFERENCES `assessment_instruments`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "assessment_dimensions_code_format_check" CHECK(length("assessment_dimensions"."code") > 0 AND "assessment_dimensions"."code" NOT GLOB '*[^a-z0-9_]*'),
	CONSTRAINT "assessment_dimensions_kind_check" CHECK("assessment_dimensions"."kind" IN ('domain', 'style', 'axis'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assessment_dimensions_instrument_id_code_key` ON `assessment_dimensions` (`instrument_id`,`code`);--> statement-breakpoint
CREATE TABLE `assessment_instruments` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`created_at` integer NOT NULL,
	`created_by` text NOT NULL,
	CONSTRAINT "assessment_instruments_code_format_check" CHECK(length("assessment_instruments"."code") > 0 AND "assessment_instruments"."code" NOT GLOB '*[^a-z0-9_]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assessment_instruments_code_key` ON `assessment_instruments` (`code`);--> statement-breakpoint
CREATE TABLE `assessment_item_dimensions` (
	`item_id` text NOT NULL,
	`dimension_id` text NOT NULL,
	PRIMARY KEY(`item_id`, `dimension_id`),
	FOREIGN KEY (`item_id`) REFERENCES `assessment_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`dimension_id`) REFERENCES `assessment_dimensions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `assessment_items` (
	`id` text PRIMARY KEY NOT NULL,
	`instrument_id` text NOT NULL,
	`code` text NOT NULL,
	`stem` text NOT NULL,
	`scale_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`created_by` text NOT NULL,
	FOREIGN KEY (`instrument_id`) REFERENCES `assessment_instruments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`scale_id`) REFERENCES `assessment_scales`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "assessment_items_code_format_check" CHECK(length("assessment_items"."code") > 0 AND "assessment_items"."code" NOT GLOB '*[^a-z0-9_]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assessment_items_instrument_id_code_key` ON `assessment_items` (`instrument_id`,`code`);--> statement-breakpoint
CREATE TABLE `assessment_scales` (
	`id` text PRIMARY KEY NOT NULL,
	`instrument_id` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`points` text NOT NULL,
	FOREIGN KEY (`instrument_id`) REFERENCES `assessment_instruments`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "assessment_scales_code_format_check" CHECK(length("assessment_scales"."code") > 0 AND "assessment_scales"."code" NOT GLOB '*[^a-z0-9_]*'),
	CONSTRAINT "assessment_scales_points_json_check" CHECK(json_valid("assessment_scales"."points"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assessment_scales_instrument_id_code_key` ON `assessment_scales` (`instrument_id`,`code`);--> statement-breakpoint
CREATE TABLE `assessment_version_item_dimensions` (
	`version_item_id` text NOT NULL,
	`dimension_id` text NOT NULL,
	`dimension_code_snapshot` text NOT NULL,
	PRIMARY KEY(`version_item_id`, `dimension_id`),
	FOREIGN KEY (`version_item_id`) REFERENCES `assessment_version_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`dimension_id`) REFERENCES `assessment_dimensions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `assessment_version_items` (
	`id` text PRIMARY KEY NOT NULL,
	`version_id` text NOT NULL,
	`item_id` text NOT NULL,
	`position` integer NOT NULL,
	`reverse_coded` integer DEFAULT false NOT NULL,
	`stem_snapshot` text,
	`scale_points_snapshot` text,
	FOREIGN KEY (`version_id`) REFERENCES `assessment_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`item_id`) REFERENCES `assessment_items`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "assessment_version_items_position_check" CHECK("assessment_version_items"."position" >= 0),
	CONSTRAINT "assessment_version_items_reverse_coded_check" CHECK("assessment_version_items"."reverse_coded" IN (0, 1)),
	CONSTRAINT "assessment_version_items_scale_points_snapshot_json_check" CHECK("assessment_version_items"."scale_points_snapshot" IS NULL OR json_valid("assessment_version_items"."scale_points_snapshot"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assessment_version_items_version_id_item_id_key` ON `assessment_version_items` (`version_id`,`item_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `assessment_version_items_version_id_position_key` ON `assessment_version_items` (`version_id`,`position`);--> statement-breakpoint
CREATE TABLE `assessment_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`instrument_id` text NOT NULL,
	`version_no` integer NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`published_at` integer,
	`retired_at` integer,
	`source_version_id` text,
	`created_at` integer NOT NULL,
	`created_by` text NOT NULL,
	FOREIGN KEY (`instrument_id`) REFERENCES `assessment_instruments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_version_id`) REFERENCES `assessment_versions`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "assessment_versions_status_check" CHECK("assessment_versions"."status" IN ('draft', 'review', 'published', 'retired')),
	CONSTRAINT "assessment_versions_version_no_check" CHECK("assessment_versions"."version_no" > 0),
	CONSTRAINT "assessment_versions_published_at_check" CHECK("assessment_versions"."status" <> 'published' OR "assessment_versions"."published_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assessment_versions_instrument_id_version_no_key` ON `assessment_versions` (`instrument_id`,`version_no`);--> statement-breakpoint
CREATE UNIQUE INDEX `assessment_versions_one_open_per_instrument` ON `assessment_versions` (`instrument_id`) WHERE "assessment_versions"."status" IN ('draft', 'review');