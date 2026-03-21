import { pgTable, text, boolean, integer, jsonb, timestamp, index } from 'drizzle-orm/pg-core';

export const auctions = pgTable('auctions', {
  // Primary key — auction_id as hex field string
  id:              text('id').primaryKey(),
  type:            text('type').notNull(),         // AuctionType enum
  programId:       text('program_id').notNull(),
  creator:         text('creator').notNull(),

  // Token
  saleTokenId:     text('sale_token_id').notNull(),
  paymentTokenId:  text('payment_token_id').notNull(),

  // Supply — u128 stored as decimal strings
  supply:          text('supply').notNull(),
  totalCommitted:  text('total_committed').notNull().default('0'),
  totalPayments:   text('total_payments').notNull().default('0'),

  // Status — denormalised for query performance
  status:          text('status').notNull().default('open'),
  supplyMet:       boolean('supply_met').notNull().default(false),
  cleared:         boolean('cleared').notNull().default(false),
  voided:          boolean('voided').notNull().default(false),

  // Price — null for non-Dutch types before clearing
  startPrice:      text('start_price'),
  floorPrice:      text('floor_price'),
  clearingPrice:   text('clearing_price'),

  // Timing
  startBlock:      integer('start_block').notNull(),
  endBlock:        integer('end_block').notNull(),
  endedAtBlock:    integer('ended_at_block'),

  // Revenue — null before close_auction
  creatorRevenue:  text('creator_revenue'),
  protocolFee:     text('protocol_fee'),
  referralBudget:  text('referral_budget'),

  // Full on-chain config + state snapshots
  configJson:      jsonb('config_json').notNull().default({}),
  stateJson:       jsonb('state_json').notNull().default({}),

  // Protocol params snapshotted at create
  feeBps:          integer('fee_bps').notNull(),
  closerReward:    text('closer_reward').notNull(),

  // Gate & vesting
  gateMode:        integer('gate_mode').notNull().default(0),
  vestEnabled:     boolean('vest_enabled').notNull().default(false),
  vestCliffBlocks: integer('vest_cliff_blocks').notNull().default(0),
  vestEndBlocks:   integer('vest_end_blocks').notNull().default(0),

  createdAtBlock:  integer('created_at_block').notNull(),
  createdAt:       timestamp('created_at').notNull(),
  updatedAt:       timestamp('updated_at').notNull(),
}, (t) => [
  index('auctions_creator_idx').on(t.creator),
  index('auctions_status_idx').on(t.status),
  index('auctions_program_id_idx').on(t.programId),
]);
