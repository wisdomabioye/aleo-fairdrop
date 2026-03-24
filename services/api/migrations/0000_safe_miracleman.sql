CREATE TABLE "auction_metadata" (
	"hash" text PRIMARY KEY NOT NULL,
	"ipfs_cid" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"website" text,
	"logo_ipfs" text,
	"twitter" text,
	"discord" text,
	"raw_json" jsonb NOT NULL,
	"pinned_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auctions" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"program_id" text NOT NULL,
	"creator" text NOT NULL,
	"metadata_hash" text,
	"sale_token_id" text NOT NULL,
	"payment_token_id" text NOT NULL,
	"supply" text NOT NULL,
	"total_committed" text DEFAULT '0' NOT NULL,
	"total_payments" text DEFAULT '0' NOT NULL,
	"status" text DEFAULT 'live' NOT NULL,
	"supply_met" boolean DEFAULT false NOT NULL,
	"cleared" boolean DEFAULT false NOT NULL,
	"voided" boolean DEFAULT false NOT NULL,
	"start_price" text,
	"floor_price" text,
	"clearing_price" text,
	"price_decay_blocks" integer,
	"price_decay_amount" text,
	"ceiling_price" text,
	"price_rise_blocks" integer,
	"price_rise_amount" text,
	"raise_target" text,
	"min_bid_amount" text,
	"max_bid_amount" text,
	"sale_scale" text,
	"start_block" integer NOT NULL,
	"end_block" integer NOT NULL,
	"ended_at_block" integer,
	"creator_revenue" text,
	"protocol_fee" text,
	"referral_budget" text,
	"config_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"state_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"fee_bps" integer NOT NULL,
	"closer_reward" text NOT NULL,
	"gate_mode" integer DEFAULT 0 NOT NULL,
	"vest_enabled" boolean DEFAULT false NOT NULL,
	"vest_cliff_blocks" integer DEFAULT 0 NOT NULL,
	"vest_end_blocks" integer DEFAULT 0 NOT NULL,
	"created_at_block" integer NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bids" (
	"bidder_key" text NOT NULL,
	"auction_id" text NOT NULL,
	"program_id" text NOT NULL,
	"quantity" text NOT NULL,
	"payment_amount" text NOT NULL,
	"placed_at_block" integer NOT NULL,
	"placed_at" timestamp NOT NULL,
	"clearing_price" text,
	"cost" text,
	"refund" text,
	"claimed" boolean DEFAULT false NOT NULL,
	"claimed_at" timestamp,
	"refunded" boolean DEFAULT false NOT NULL,
	"refunded_at" timestamp,
	CONSTRAINT "bids_bidder_key_auction_id_pk" PRIMARY KEY("bidder_key","auction_id")
);
--> statement-breakpoint
CREATE TABLE "creator_nonces" (
	"address" text PRIMARY KEY NOT NULL,
	"nonce" text DEFAULT '0' NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "indexer_checkpoints" (
	"program_id" text PRIMARY KEY NOT NULL,
	"last_block_height" integer NOT NULL,
	"last_block_hash" text NOT NULL,
	"last_processed_at" timestamp NOT NULL,
	"status" text DEFAULT 'offline' NOT NULL,
	"lag" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "indexer_transitions" (
	"transition_id" text PRIMARY KEY NOT NULL,
	"program_id" text NOT NULL,
	"transition_name" text NOT NULL,
	"block_height" integer NOT NULL,
	"processed_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "protocol_config" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"fee_bps" integer NOT NULL,
	"creation_fee" text NOT NULL,
	"closer_reward" text NOT NULL,
	"slash_reward_bps" integer NOT NULL,
	"max_referral_bps" integer NOT NULL,
	"referral_pool_bps" integer NOT NULL,
	"min_auction_duration" integer NOT NULL,
	"paused" boolean DEFAULT false NOT NULL,
	"protocol_admin" text NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "referral_attributions" (
	"referrer_address" text NOT NULL,
	"referee_address" text NOT NULL,
	"auction_id" text NOT NULL,
	"code_id" text NOT NULL,
	"commission" text NOT NULL,
	"block_height" integer NOT NULL,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "referral_attributions_referrer_address_referee_address_auction_id_pk" PRIMARY KEY("referrer_address","referee_address","auction_id")
);
--> statement-breakpoint
CREATE TABLE "referral_codes" (
	"code_id" text PRIMARY KEY NOT NULL,
	"owner" text NOT NULL,
	"auction_id" text,
	"commission_bps" integer NOT NULL,
	"earned" text DEFAULT '0' NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_reputation" (
	"address" text PRIMARY KEY NOT NULL,
	"auction_count" integer DEFAULT 0 NOT NULL,
	"total_committed" text DEFAULT '0' NOT NULL,
	"total_refunded" text DEFAULT '0' NOT NULL,
	"claim_count" integer DEFAULT 0 NOT NULL,
	"void_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vesting" (
	"bidder_key" text NOT NULL,
	"auction_id" text NOT NULL,
	"sale_token_id" text NOT NULL,
	"total_amount" text NOT NULL,
	"claimed" text DEFAULT '0' NOT NULL,
	"ended_at_block" integer NOT NULL,
	"cliff_blocks" integer NOT NULL,
	"vest_end_blocks" integer NOT NULL,
	"fully_vested" boolean DEFAULT false NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "vesting_bidder_key_auction_id_pk" PRIMARY KEY("bidder_key","auction_id")
);
--> statement-breakpoint
ALTER TABLE "bids" ADD CONSTRAINT "bids_auction_id_auctions_id_fk" FOREIGN KEY ("auction_id") REFERENCES "public"."auctions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_attributions" ADD CONSTRAINT "referral_attributions_auction_id_auctions_id_fk" FOREIGN KEY ("auction_id") REFERENCES "public"."auctions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_codes" ADD CONSTRAINT "referral_codes_auction_id_auctions_id_fk" FOREIGN KEY ("auction_id") REFERENCES "public"."auctions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vesting" ADD CONSTRAINT "vesting_auction_id_auctions_id_fk" FOREIGN KEY ("auction_id") REFERENCES "public"."auctions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auctions_creator_idx" ON "auctions" USING btree ("creator");--> statement-breakpoint
CREATE INDEX "auctions_status_idx" ON "auctions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "auctions_program_id_idx" ON "auctions" USING btree ("program_id");--> statement-breakpoint
CREATE INDEX "auctions_metadata_hash_idx" ON "auctions" USING btree ("metadata_hash");--> statement-breakpoint
CREATE INDEX "bids_auction_id_idx" ON "bids" USING btree ("auction_id");--> statement-breakpoint
CREATE INDEX "bids_bidder_key_idx" ON "bids" USING btree ("bidder_key");--> statement-breakpoint
CREATE INDEX "indexer_transitions_block_height_idx" ON "indexer_transitions" USING btree ("block_height");--> statement-breakpoint
CREATE INDEX "indexer_transitions_program_id_idx" ON "indexer_transitions" USING btree ("program_id");--> statement-breakpoint
CREATE INDEX "referral_attr_referrer_idx" ON "referral_attributions" USING btree ("referrer_address");--> statement-breakpoint
CREATE INDEX "referral_attr_auction_id_idx" ON "referral_attributions" USING btree ("auction_id");--> statement-breakpoint
CREATE INDEX "referral_codes_owner_idx" ON "referral_codes" USING btree ("owner");--> statement-breakpoint
CREATE INDEX "referral_codes_auction_id_idx" ON "referral_codes" USING btree ("auction_id");--> statement-breakpoint
CREATE INDEX "vesting_auction_id_idx" ON "vesting" USING btree ("auction_id");