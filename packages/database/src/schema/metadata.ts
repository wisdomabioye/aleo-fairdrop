import { pgTable, text, jsonb, timestamp } from 'drizzle-orm/pg-core';

/**
 * Stores off-chain metadata pinned to IPFS for each auction.
 * Keyed by the BHP256 hash of the canonical metadata JSON — same value as
 * AuctionConfig.metadata_hash on-chain and auctions.metadata_hash in the DB.
 *
 * Row is created by POST /metadata before create_auction is submitted.
 * The hash is then passed as `metadata_hash` into the Leo transition.
 */
export const auctionMetadata = pgTable('auction_metadata', {
  // Primary key — field hex, matches auctions.metadata_hash
  hash:        text('hash').primaryKey(),
  ipfsCid:     text('ipfs_cid').notNull(),
  name:        text('name').notNull(),
  description: text('description').notNull(),
  website:     text('website'),
  logoIpfs:    text('logo_ipfs'),
  twitter:       text('twitter'),
  discord:       text('discord'),
  credentialUrl: text('credential_url'),
  // Full canonical JSON blob — authoritative source for re-verification
  rawJson:     jsonb('raw_json').notNull(),
  pinnedAt:    timestamp('pinned_at').notNull(),
});
