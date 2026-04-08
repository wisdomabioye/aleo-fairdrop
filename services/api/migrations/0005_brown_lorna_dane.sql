ALTER TABLE "auctions" ADD COLUMN "bid_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "auctions" ADD COLUMN "sqrt_weight" text;