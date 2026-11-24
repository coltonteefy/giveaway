CREATE TABLE `raffle` (
  `id` integer PRIMARY KEY NOT NULL,
  `title` text NOT NULL DEFAULT 'The Giving Board',
  `spots_total` integer NOT NULL DEFAULT 30,
  `price` integer NOT NULL DEFAULT 10,
  `max_per_person` integer NOT NULL DEFAULT 3,
  `charities` text NOT NULL DEFAULT 'Two selected charities',
  `prize` text NOT NULL DEFAULT 'A surprise prize',
  `payment_instructions` text NOT NULL DEFAULT 'Send payment to the organizer using the handle she shared with you.',
  `drawing_date` text NOT NULL DEFAULT '',
  `closed` integer NOT NULL DEFAULT 0,
  `winner` integer,
  `board_json` text NOT NULL DEFAULT '{}',
  `version` integer NOT NULL DEFAULT 0
);
--> statement-breakpoint
INSERT INTO `raffle` (`id`) VALUES (1);
--> statement-breakpoint
CREATE TABLE `requests` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `email` text NOT NULL,
  `method` text NOT NULL,
  `tag` text NOT NULL,
  `requested` integer NOT NULL,
  `amount` integer NOT NULL,
  `approved` integer NOT NULL DEFAULT 0,
  `status` text NOT NULL DEFAULT 'pending',
  `code_hash` text,
  `code_expires` integer,
  `failed_attempts` integer NOT NULL DEFAULT 0,
  `created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `requests_status_idx` ON `requests` (`status`);
--> statement-breakpoint
CREATE INDEX `requests_email_idx` ON `requests` (`email`);
