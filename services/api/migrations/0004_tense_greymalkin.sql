CREATE TABLE "creator_reputation" (
	"address" text PRIMARY KEY NOT NULL,
	"auctions_run" integer DEFAULT 0 NOT NULL,
	"filled_auctions" integer DEFAULT 0 NOT NULL,
	"volume" text DEFAULT '0' NOT NULL,
	"updated_at" timestamp NOT NULL
);
