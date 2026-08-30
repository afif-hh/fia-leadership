CREATE TABLE `assessment_scoring_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`scoring_version_id` text NOT NULL,
	`dimension_id` text NOT NULL,
	`dimension_code` text NOT NULL,
	`weight` real NOT NULL,
	FOREIGN KEY (`scoring_version_id`) REFERENCES `assessment_scoring_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`dimension_id`) REFERENCES `assessment_dimensions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "assessment_scoring_rules_weight_check" CHECK("assessment_scoring_rules"."weight" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assessment_scoring_rules_scoring_version_id_dimension_id_key` ON `assessment_scoring_rules` (`scoring_version_id`,`dimension_id`);--> statement-breakpoint
CREATE TABLE `assessment_scoring_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`version_id` text NOT NULL,
	`scoring_no` integer NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`bands` text NOT NULL,
	`task_axis_dimension_id` text,
	`people_axis_dimension_id` text,
	`created_at` integer NOT NULL,
	`created_by` text NOT NULL,
	`approved_at` integer,
	`approved_by` text,
	`retired_at` integer,
	FOREIGN KEY (`version_id`) REFERENCES `assessment_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`task_axis_dimension_id`) REFERENCES `assessment_dimensions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`people_axis_dimension_id`) REFERENCES `assessment_dimensions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "assessment_scoring_versions_status_check" CHECK("assessment_scoring_versions"."status" IN ('draft', 'approved', 'retired')),
	CONSTRAINT "assessment_scoring_versions_scoring_no_check" CHECK("assessment_scoring_versions"."scoring_no" > 0),
	CONSTRAINT "assessment_scoring_versions_bands_json_check" CHECK(json_valid("assessment_scoring_versions"."bands")),
	CONSTRAINT "assessment_scoring_versions_approved_at_check" CHECK("assessment_scoring_versions"."status" = 'draft' OR ("assessment_scoring_versions"."approved_at" IS NOT NULL AND "assessment_scoring_versions"."approved_by" IS NOT NULL)),
	CONSTRAINT "assessment_scoring_versions_axis_pairing_check" CHECK(("assessment_scoring_versions"."task_axis_dimension_id" IS NULL) = ("assessment_scoring_versions"."people_axis_dimension_id" IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assessment_scoring_versions_version_id_scoring_no_key` ON `assessment_scoring_versions` (`version_id`,`scoring_no`);--> statement-breakpoint
CREATE UNIQUE INDEX `assessment_scoring_versions_one_draft_per_version` ON `assessment_scoring_versions` (`version_id`) WHERE "assessment_scoring_versions"."status" = 'draft';--> statement-breakpoint
CREATE UNIQUE INDEX `assessment_scoring_versions_one_approved_per_version` ON `assessment_scoring_versions` (`version_id`) WHERE "assessment_scoring_versions"."status" = 'approved';--> statement-breakpoint
CREATE TABLE `profile_score_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`session_id` text NOT NULL,
	`assessment_version_id` text NOT NULL,
	`scoring_version_id` text NOT NULL,
	`reason` text NOT NULL,
	`note` text,
	`created_at` integer NOT NULL,
	CONSTRAINT "profile_score_runs_reason_check" CHECK("profile_score_runs"."reason" IN ('initial', 'rescore')),
	CONSTRAINT "profile_score_runs_rescore_note_check" CHECK("profile_score_runs"."reason" <> 'rescore' OR ("profile_score_runs"."note" IS NOT NULL AND length("profile_score_runs"."note") > 0))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `profile_score_runs_session_id_initial_key` ON `profile_score_runs` (`session_id`) WHERE "profile_score_runs"."reason" = 'initial';--> statement-breakpoint
CREATE INDEX `profile_score_runs_user_id_created_at_idx` ON `profile_score_runs` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `profile_scores` (
	`id` text PRIMARY KEY NOT NULL,
	`score_run_id` text NOT NULL,
	`score_type` text NOT NULL,
	`dimension_code` text,
	`scoring_rule_id` text,
	`score_value` real NOT NULL,
	FOREIGN KEY (`score_run_id`) REFERENCES `profile_score_runs`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "profile_scores_score_type_check" CHECK("profile_scores"."score_type" IN ('raw', 'normalized', 'style', 'readiness')),
	CONSTRAINT "profile_scores_dimension_pairing_check" CHECK(("profile_scores"."score_type" = 'readiness') = ("profile_scores"."dimension_code" IS NULL)),
	CONSTRAINT "profile_scores_scoring_rule_check" CHECK("profile_scores"."score_type" = 'readiness' OR "profile_scores"."scoring_rule_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `profile_scores_run_type_dimension_key` ON `profile_scores` (`score_run_id`,`score_type`,`dimension_code`);--> statement-breakpoint
CREATE UNIQUE INDEX `profile_scores_run_readiness_key` ON `profile_scores` (`score_run_id`) WHERE "profile_scores"."score_type" = 'readiness';--> statement-breakpoint
CREATE TABLE `profile_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`score_run_id` text NOT NULL,
	`user_id` text NOT NULL,
	`session_id` text NOT NULL,
	`assessment_version_id` text NOT NULL,
	`scoring_version_id` text NOT NULL,
	`payload` text NOT NULL,
	`payload_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`score_run_id`) REFERENCES `profile_score_runs`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "profile_snapshots_payload_json_check" CHECK(json_valid("profile_snapshots"."payload"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `profile_snapshots_score_run_id_key` ON `profile_snapshots` (`score_run_id`);--> statement-breakpoint
CREATE INDEX `profile_snapshots_user_id_created_at_idx` ON `profile_snapshots` (`user_id`,`created_at`);