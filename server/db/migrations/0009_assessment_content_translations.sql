-- Assessment content in a second language (ADR-009).
--
-- Five additive tables, no change to any existing one. The base rows keep the Indonesian text, so
-- nothing is backfilled and the default reading path is exactly the query it was before this
-- migration — a missing translation falls back to the row it translates.
--
-- `assessment_version_item_translations` is the frozen half: it is written during publish and made
-- immutable by the triggers in 0010, which is a separate file because SQLite drops a table's
-- triggers when the table is rebuilt and the two must be re-creatable independently.
--
-- ROLLBACK: drop the five tables. Lossless for everything except the translations themselves —
-- every base row and every base snapshot survives, and the platform reverts to Indonesian-only.

CREATE TABLE `assessment_dimension_translations` (
	`dimension_id` text NOT NULL,
	`locale` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	PRIMARY KEY(`dimension_id`, `locale`),
	FOREIGN KEY (`dimension_id`) REFERENCES `assessment_dimensions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "assessment_dimension_translations_locale_check" CHECK("assessment_dimension_translations"."locale" IN ('id', 'en'))
);
--> statement-breakpoint
CREATE TABLE `assessment_instrument_translations` (
	`instrument_id` text NOT NULL,
	`locale` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	PRIMARY KEY(`instrument_id`, `locale`),
	FOREIGN KEY (`instrument_id`) REFERENCES `assessment_instruments`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "assessment_instrument_translations_locale_check" CHECK("assessment_instrument_translations"."locale" IN ('id', 'en'))
);
--> statement-breakpoint
CREATE TABLE `assessment_item_translations` (
	`item_id` text NOT NULL,
	`locale` text NOT NULL,
	`stem` text NOT NULL,
	PRIMARY KEY(`item_id`, `locale`),
	FOREIGN KEY (`item_id`) REFERENCES `assessment_items`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "assessment_item_translations_locale_check" CHECK("assessment_item_translations"."locale" IN ('id', 'en'))
);
--> statement-breakpoint
CREATE TABLE `assessment_scale_translations` (
	`scale_id` text NOT NULL,
	`locale` text NOT NULL,
	`name` text NOT NULL,
	`points` text NOT NULL,
	PRIMARY KEY(`scale_id`, `locale`),
	FOREIGN KEY (`scale_id`) REFERENCES `assessment_scales`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "assessment_scale_translations_locale_check" CHECK("assessment_scale_translations"."locale" IN ('id', 'en')),
	CONSTRAINT "assessment_scale_translations_points_json_check" CHECK(json_valid("assessment_scale_translations"."points"))
);
--> statement-breakpoint
CREATE TABLE `assessment_version_item_translations` (
	`version_item_id` text NOT NULL,
	`locale` text NOT NULL,
	`stem_snapshot` text NOT NULL,
	`scale_points_snapshot` text NOT NULL,
	PRIMARY KEY(`version_item_id`, `locale`),
	FOREIGN KEY (`version_item_id`) REFERENCES `assessment_version_items`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "assessment_version_item_translations_locale_check" CHECK("assessment_version_item_translations"."locale" IN ('id', 'en')),
	CONSTRAINT "assessment_version_item_translations_scale_points_json_check" CHECK(json_valid("assessment_version_item_translations"."scale_points_snapshot"))
);
