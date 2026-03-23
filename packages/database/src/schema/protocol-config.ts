import { pgTable, text, integer, boolean, timestamp } from 'drizzle-orm/pg-core';

/**
 * Single-row table — always id = 1.
 * Owned by the indexer: written only from services/indexer/src/handlers/config.ts.
 * Read by services/api/src/queries/config.ts for GET /config.
 *
 * To decouple: drop this table and switch GET /config to read chain directly
 * via the existing readProtocolConfig() SDK utility.
 */
export const protocolConfig = pgTable('protocol_config', {
  id:                 integer('id').primaryKey().default(1),
  feeBps:             integer('fee_bps').notNull(),
  creationFee:        text('creation_fee').notNull(),       // u128 decimal
  closerReward:       text('closer_reward').notNull(),      // u128 decimal
  slashRewardBps:     integer('slash_reward_bps').notNull(),
  maxReferralBps:     integer('max_referral_bps').notNull(),
  referralPoolBps:    integer('referral_pool_bps').notNull(),
  minAuctionDuration: integer('min_auction_duration').notNull(),
  paused:             boolean('paused').notNull().default(false),
  protocolAdmin:      text('protocol_admin').notNull(),
  updatedAt:          timestamp('updated_at').notNull(),
});
