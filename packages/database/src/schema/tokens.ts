import { pgTable, text, boolean, integer, timestamp } from 'drizzle-orm/pg-core';

export const tokens = pgTable('tokens', {
  id:            text('id').primaryKey(),        // field hex — matches auctions.saleTokenId / paymentTokenId
  name:          text('name').notNull(),
  symbol:        text('symbol').notNull(),
  decimals:      integer('decimals').notNull(),
  totalSupply:   text('total_supply').notNull(), // bigint stored as decimal string
  maxSupply:     text('max_supply').notNull(),   // bigint stored as decimal string
  admin:         text('admin').notNull(),
  externalAuthorizationRequired: boolean('external_authorization_required').notNull(),
  seenAt:        timestamp('seen_at').notNull(),
});
