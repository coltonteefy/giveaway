ALTER TABLE `raffle` ADD COLUMN `venmo_url` text NOT NULL DEFAULT 'https://venmo.com/u/Bagglady_X';
--> statement-breakpoint
ALTER TABLE `raffle` ADD COLUMN `paypal_url` text NOT NULL DEFAULT 'https://www.paypal.com/qrcodes/p2pqrc/THG6R3RFLW2CE';
--> statement-breakpoint
ALTER TABLE `raffle` ADD COLUMN `organizer_email` text NOT NULL DEFAULT 'angbaggs@gmail.com';
