CREATE TABLE "tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"symbol" text NOT NULL,
	"decimals" integer NOT NULL,
	"total_supply" text NOT NULL,
	"max_supply" text NOT NULL,
	"admin" text NOT NULL,
	"external_authorization_required" boolean NOT NULL,
	"seen_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE INDEX "auctions_type_idx" ON "auctions" USING btree ("type");--> statement-breakpoint
CREATE INDEX "auctions_cleared_updated_at_idx" ON "auctions" USING btree ("cleared","updated_at");--> statement-breakpoint
CREATE INDEX "auctions_ended_at_block_voided_idx" ON "auctions" USING btree ("ended_at_block","voided");