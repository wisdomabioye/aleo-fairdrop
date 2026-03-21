/**
 * fairdrop_ascending.aleo — TypeScript types.
 *
 * Ascending-price auction: price increases over time (inverse of Dutch).
 * Bidders who commit earlier pay less than later bidders.
 *
 * @todo Define fully when fairdrop_ascending.aleo is implemented.
 */

import type { U128, U32 } from '../../primitives/scalars.js';
import type { BaseAuctionConfig, AuctionState, BaseBid } from './common.js';

export interface AscendingAuctionConfig extends BaseAuctionConfig {
  start_price:        U128;
  ceiling_price:      U128;
  price_rise_blocks:  U32;
  price_rise_amount:  U128;
}

export type AscendingBid = BaseBid;

export type { AuctionState };

export const ASCENDING_PROGRAM_ID   = 'fairdrop_ascending.aleo' as const;
export const ASCENDING_PROGRAM_SALT = '4field' as const;
