ALTER TABLE `raffle` ADD COLUMN `slug` text NOT NULL DEFAULT 'sample';
--> statement-breakpoint
ALTER TABLE `raffle` ADD COLUMN `draw_started_at` integer;
--> statement-breakpoint
ALTER TABLE `raffle` ADD COLUMN `draw_reveal_at` integer;
--> statement-breakpoint
ALTER TABLE `raffle` ADD COLUMN `pending_winner` integer;
--> statement-breakpoint
ALTER TABLE `requests` ADD COLUMN `raffle_id` integer NOT NULL DEFAULT 1;
--> statement-breakpoint
CREATE INDEX `requests_raffle_email_idx` ON `requests` (`raffle_id`, `email`);
--> statement-breakpoint
CREATE TABLE `raffle_history` (
  `id` text PRIMARY KEY NOT NULL,
  `raffle_id` integer NOT NULL,
  `title` text NOT NULL,
  `winner` integer NOT NULL,
  `winner_name` text NOT NULL,
  `winner_email` text NOT NULL,
  `drawn_at` text NOT NULL,
  `snapshot_json` text NOT NULL,
  `outcome` text NOT NULL DEFAULT 'winner'
);
--> statement-breakpoint
INSERT INTO `raffle` (`id`,`slug`,`title`,`spots_total`,`price`,`max_per_person`,`charities`,`prize`,`payment_instructions`,`closed`,`venmo_url`,`paypal_url`,`organizer_email`)
VALUES (2,'angie','Angie’s Raffle',30,10,3,'Charities to be announced','Prize to be announced','Pay Angie with Venmo or PayPal, then enter the username or payer email you used. Angie checks payments manually.',1,'https://venmo.com/u/Bagglady_X','https://www.paypal.com/qrcodes/p2pqrc/THG6R3RFLW2CE','angbaggs@gmail.com');
