ALTER TABLE "auctions" ADD COLUMN "extension_window" integer;--> statement-breakpoint
ALTER TABLE "auctions" ADD COLUMN "extension_blocks" integer;--> statement-breakpoint
ALTER TABLE "auctions" ADD COLUMN "max_end_block" integer;--> statement-breakpoint
ALTER TABLE "auctions" ADD COLUMN "fill_min_bps" integer;--> statement-breakpoint
ALTER TABLE "auctions" ADD COLUMN "effective_end_block" integer;--> statement-breakpoint
ALTER TABLE "auctions" ADD COLUMN "effective_supply" text;