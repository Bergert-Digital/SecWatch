CREATE TABLE `advisories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source` text NOT NULL,
	`source_id` text NOT NULL,
	`severity` text,
	`summary` text NOT NULL,
	`details` text,
	`affected_json` text NOT NULL,
	`url` text,
	`published_at` text,
	`fetched_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `adv_source_id` ON `advisories` (`source`,`source_id`);--> statement-breakpoint
CREATE TABLE `email_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sent_at` text NOT NULL,
	`kind` text NOT NULL,
	`finding_count` integer NOT NULL,
	`to_address` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `findings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`advisory_id` integer NOT NULL,
	`ecosystem` text NOT NULL,
	`package_name` text NOT NULL,
	`matched_version` text,
	`source_repo` text NOT NULL,
	`source_file` text NOT NULL,
	`first_seen` text NOT NULL,
	`triage_rank` text,
	`triage_reason` text,
	`triaged_at` text,
	`notified_at` text,
	FOREIGN KEY (`advisory_id`) REFERENCES `advisories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `find_unique` ON `findings` (`advisory_id`,`source_repo`,`source_file`,`package_name`);--> statement-breakpoint
CREATE TABLE `inventory_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` integer NOT NULL,
	`ecosystem` text NOT NULL,
	`name` text NOT NULL,
	`version` text,
	`source_repo` text NOT NULL,
	`source_file` text NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `inv_eco_name` ON `inventory_items` (`ecosystem`,`name`);--> statement-breakpoint
CREATE TABLE `runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`started_at` text NOT NULL,
	`completed_at` text,
	`status` text DEFAULT 'running' NOT NULL,
	`error_text` text
);
