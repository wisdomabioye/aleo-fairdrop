import { pgTable, text, integer, timestamp, primaryKey, index } from 'drizzle-orm/pg-core';
import { auctions } from './auctions';

export const referralCodes = pgTable('referral_codes', {
  codeId:        text('code_id').primaryKey(),  // BHP256(code_id)
  owner:         text('owner').notNull(),
  auctionId:     text('auction_id').references(() => auctions.id),  // null = global
  commissionBps: integer('commission_bps').notNull(),
  earned:        text('earned').notNull().default('0'),  // u128
  createdAt:     timestamp('created_at').notNull(),
  updatedAt:     timestamp('updated_at').notNull(),
}, (t) => [
  index('referral_codes_owner_idx').on(t.owner),
  index('referral_codes_auction_id_idx').on(t.auctionId),
]);

export const referralAttributions = pgTable('referral_attributions', {
  referrerAddress: text('referrer_address').notNull(),
  refereeAddress:  text('referee_address').notNull(),
  auctionId:       text('auction_id').notNull().references(() => auctions.id),
  codeId:          text('code_id').notNull(),
  commission:      text('commission').notNull(),  // u128
  blockHeight:     integer('block_height').notNull(),
  createdAt:       timestamp('created_at').notNull(),
}, (t) => [
  primaryKey({ columns: [t.referrerAddress, t.refereeAddress, t.auctionId] }),
  index('referral_attr_referrer_idx').on(t.referrerAddress),
  index('referral_attr_auction_id_idx').on(t.auctionId),
]);
