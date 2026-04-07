import { pgTable, text, integer, timestamp } from 'drizzle-orm/pg-core';

export const creatorReputation = pgTable('creator_reputation', {
  address:        text('address').primaryKey(),
  auctionsRun:    integer('auctions_run').notNull().default(0),
  filledAuctions: integer('filled_auctions').notNull().default(0),
  volume:         text('volume').notNull().default('0'),  // u128 decimal string
  updatedAt:      timestamp('updated_at').notNull(),
});

export const userReputation = pgTable('user_reputation', {
  address:        text('address').primaryKey(),
  auctionCount:   integer('auction_count').notNull().default(0),
  totalCommitted: text('total_committed').notNull().default('0'),  // u128
  totalRefunded:  text('total_refunded').notNull().default('0'),
  claimCount:     integer('claim_count').notNull().default(0),
  voidCount:      integer('void_count').notNull().default(0),
  createdAt:      timestamp('created_at').notNull(),
  updatedAt:      timestamp('updated_at').notNull(),
});

export const creatorNonces = pgTable('creator_nonces', {
  address:   text('address').primaryKey(),
  nonce:     text('nonce').notNull().default('0'),  // u64 as decimal string
  updatedAt: timestamp('updated_at').notNull(),
});
