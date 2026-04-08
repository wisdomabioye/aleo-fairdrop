import { pgTable, text, boolean, integer, jsonb, timestamp, index } from 'drizzle-orm/pg-core';

export const auctions = pgTable('auctions', {
  // Primary key — auction_id as hex field string
  id:              text('id').primaryKey(),
  type:            text('type').notNull(),         // AuctionType enum
  programId:       text('program_id').notNull(),
  creator:         text('creator').notNull(),

  // Metadata — links to the metadata table for human-readable name/description/logo
  metadataHash:    text('metadata_hash'),

  // Token
  saleTokenId:     text('sale_token_id').notNull(),
  paymentTokenId:  text('payment_token_id').notNull(),

  // Supply — u128 stored as decimal strings
  supply:          text('supply').notNull(),
  totalCommitted:  text('total_committed').notNull().default('0'),
  totalPayments:   text('total_payments').notNull().default('0'),

  // Status — denormalised for query performance
  // Values: 'live' | 'cleared' | 'voided'
  // ('ended' = time-expired, not-yet-closed — computed by API from end_block vs current block)
  status:          text('status').notNull().default('live'),
  supplyMet:       boolean('supply_met').notNull().default(false),
  cleared:         boolean('cleared').notNull().default(false),
  voided:          boolean('voided').notNull().default(false),

  // Price — u128 as decimal strings; null for auction types without Dutch pricing
  startPrice:      text('start_price'),
  floorPrice:      text('floor_price'),
  clearingPrice:   text('clearing_price'),

  // Dutch price schedule — null for non-Dutch types
  priceDecayBlocks: integer('price_decay_blocks'),
  priceDecayAmount: text('price_decay_amount'),   // u128

  // Ascending price schedule + anti-sniping config — null for non-Ascending types
  ceilingPrice:     text('ceiling_price'),         // u128
  priceRiseBlocks:  integer('price_rise_blocks'),
  priceRiseAmount:  text('price_rise_amount'),     // u128
  extensionWindow:  integer('extension_window'),   // 0 = disabled
  extensionBlocks:  integer('extension_blocks'),
  maxEndBlock:      integer('max_end_block'),

  // Raise-specific — null for all other auction types
  raiseTarget:     text('raise_target'),
  /** Minimum fill threshold in bps. 0 = disabled. Raise + Quadratic only. Null for other types. */
  fillMinBps:      integer('fill_min_bps'),
  // Sealed-specific - null for all other auction types
  commitEndBlock: integer('commit_end_block'),

  // Bid constraints — u128 as decimal strings
  minBidAmount:    text('min_bid_amount'),
  maxBidAmount:    text('max_bid_amount'),

  // Sale token decimal scale (10^decimals) — used for payment math, avoids registry reads
  saleScale:       text('sale_scale'),             // u128

  // Timing
  startBlock:         integer('start_block').notNull(),
  endBlock:           integer('end_block').notNull(),
  endedAtBlock:       integer('ended_at_block'),
  // Ascending-only: mutable end block updated by anti-sniping extension. Null for all other types.
  effectiveEndBlock:  integer('effective_end_block'),

  // Revenue — null before close_auction
  creatorRevenue:  text('creator_revenue'),
  protocolFee:     text('protocol_fee'),
  referralBudget:  text('referral_budget'),
  /** Actual tokens distributed at close. < supply for partial fill; == supply for full. Null until cleared. Raise + Quadratic only. */
  effectiveSupply: text('effective_supply'),

  // Full on-chain config + state snapshots (authoritative — contains all fields)
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

  bidCount:        integer('bid_count').notNull().default(0),
  /** Quadratic only — current sqrt_weights[auction_id] value. Updated on every bid. */
  sqrtWeight:      text('sqrt_weight'),

  createdAtBlock:  integer('created_at_block').notNull(),
  createdAt:       timestamp('created_at').notNull(),
  updatedAt:       timestamp('updated_at').notNull(),
}, (t) => [
  index('auctions_creator_idx').on(t.creator),
  index('auctions_status_idx').on(t.status),
  index('auctions_program_id_idx').on(t.programId),
  index('auctions_metadata_hash_idx').on(t.metadataHash),
  // Analytics query indexes
  index('auctions_type_idx').on(t.type),
  index('auctions_cleared_updated_at_idx').on(t.cleared, t.updatedAt),
  index('auctions_ended_at_block_voided_idx').on(t.endedAtBlock, t.voided),
]);
