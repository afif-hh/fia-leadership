CREATE TABLE `identity_account` (
	`id` text PRIMARY KEY NOT NULL,
	`issuer` text NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `identity_user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `identity_account_user_id_idx` ON `identity_account` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `identity_account_issuer_account_id_key` ON `identity_account` (`issuer`,`account_id`);--> statement-breakpoint
CREATE TABLE `identity_consents` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`policy_id` text NOT NULL,
	`policy_version` text NOT NULL,
	`policy_hash` text NOT NULL,
	`accepted_at` integer NOT NULL,
	`method` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `identity_user`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "identity_consents_method_check" CHECK("identity_consents"."method" IN ('web_form', 'seed', 'import'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `identity_consents_user_policy_version_key` ON `identity_consents` (`user_id`,`policy_id`,`policy_version`);--> statement-breakpoint
CREATE TABLE `identity_session` (
	`id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `identity_user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `identity_session_token_unique` ON `identity_session` (`token`);--> statement-breakpoint
CREATE INDEX `identity_session_user_id_idx` ON `identity_session` (`user_id`);--> statement-breakpoint
CREATE TABLE `identity_user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`roles` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	CONSTRAINT "identity_user_status_check" CHECK("identity_user"."status" IN ('active', 'disabled'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `identity_user_email_unique` ON `identity_user` (`email`);--> statement-breakpoint
CREATE TABLE `identity_user_roles` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`granted_at` integer NOT NULL,
	`granted_by` text,
	FOREIGN KEY (`user_id`) REFERENCES `identity_user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`granted_by`) REFERENCES `identity_user`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "identity_user_roles_role_check" CHECK("identity_user_roles"."role" IN ('student', 'lecturer_coach', 'lab_admin', 'academic_lead', 'researcher', 'faculty_executive', 'external_partner'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `identity_user_roles_user_id_role_key` ON `identity_user_roles` (`user_id`,`role`);--> statement-breakpoint
CREATE TABLE `identity_verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `identity_verification_identifier_idx` ON `identity_verification` (`identifier`);--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`event_type` text NOT NULL,
	`actor_user_id` text,
	`target_user_id` text,
	`detail` text,
	`created_at` integer NOT NULL,
	CONSTRAINT "audit_logs_event_type_format_check" CHECK(
        length("audit_logs"."event_type") BETWEEN 3 AND 64
        AND "audit_logs"."event_type" GLOB '*.*'
        AND "audit_logs"."event_type" NOT GLOB '*[^a-z._]*'
        AND "audit_logs"."event_type" NOT GLOB '.*'
        AND "audit_logs"."event_type" NOT GLOB '*.'
        AND "audit_logs"."event_type" NOT GLOB '*..*'
      )
);
--> statement-breakpoint
CREATE INDEX `audit_logs_event_type_idx` ON `audit_logs` (`event_type`);--> statement-breakpoint
CREATE INDEX `audit_logs_created_at_idx` ON `audit_logs` (`created_at`);--> statement-breakpoint
CREATE INDEX `audit_logs_actor_user_id_idx` ON `audit_logs` (`actor_user_id`);