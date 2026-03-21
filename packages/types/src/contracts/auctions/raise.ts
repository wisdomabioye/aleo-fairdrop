/**
 * fairdrop_raise.aleo — TypeScript types.
 *
 * Fixed-price fundraising auction: participants contribute up to a target amount.
 * If the target is not reached by end_block, contributors may claim refunds.
 *
 * @todo Define fully when fairdrop_raise.aleo is implemented.
 */

import type { U128 } from '../../primitives/scalars.js';
import type { BaseAuctionConfig, AuctionState, BaseBid } from './common.js';

export interface RaiseAuctionConfig extends BaseAuctionConfig {
  fixed_price:   U128; // microcredits per sale_scale token units
  raise_target:  U128; // minimum payment_amount to reach for auction to clear
}

export type RaiseBid = BaseBid;

export type { AuctionState };

