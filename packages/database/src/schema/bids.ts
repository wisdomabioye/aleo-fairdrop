import { pgTable, text, boolean, integer, timestamp, primaryKey, index } from 'drizzle-orm/pg-core';
import { auctions } from './auctions';

export const bids = pgTable('bids', {
  // Composite PK: bidder_key is pseudonymous (BHP256(bidder, auction_id))
  bidderKey:     text('bidder_key').notNull(),
  auctionId:     text('auction_id').notNull().references(() => auctions.id),
  programId:     text('program_id').notNull(),

  // u128 as decimal strings
  quantity:      text('quantity').notNull(),
  paymentAmount: text('payment_amount').notNull(),
  placedAtBlock: integer('placed_at_block').notNull(),
  placedAt:      timestamp('placed_at').notNull(),

  // Populated after close_auction
  clearingPrice: text('clearing_price'),
  cost:          text('cost'),
  refund:        text('refund'),

  // Claim state
  claimed:       boolean('claimed').notNull().default(false),
  claimedAt:     timestamp('claimed_at'),
  refunded:      boolean('refunded').notNull().default(false),  // claim_voided
  refundedAt:    timestamp('refunded_at'),
}, (t) => [
  primaryKey({ columns: [t.bidderKey, t.auctionId] }),
  index('bids_auction_id_idx').on(t.auctionId),
  index('bids_bidder_key_idx').on(t.bidderKey),
]);

export const vesting = pgTable('vesting', {
  bidderKey:     text('bidder_key').notNull(),
  auctionId:     text('auction_id').notNull().references(() => auctions.id),
  saleTokenId:   text('sale_token_id').notNull(),

  // u128 as decimal strings
  totalAmount:   text('total_amount').notNull(),
  claimed:       text('claimed').notNull().default('0'),

  endedAtBlock:  integer('ended_at_block').notNull(),
  cliffBlocks:   integer('cliff_blocks').notNull(),
  vestEndBlocks: integer('vest_end_blocks').notNull(),
  fullyVested:   boolean('fully_vested').notNull().default(false),

  createdAt:     timestamp('created_at').notNull(),
  updatedAt:     timestamp('updated_at').notNull(),
}, (t) => [
  primaryKey({ columns: [t.bidderKey, t.auctionId] }),
  index('vesting_auction_id_idx').on(t.auctionId),
]);
