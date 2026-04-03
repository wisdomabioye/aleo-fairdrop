/**
 * fairdrop_lbp_v2.aleo — TypeScript types.
 *
 * Liquidity Bootstrapping Pool: token weight shifts over time from high to low,
 * naturally driving price discovery downward and discouraging front-running bots.
 *
 * @todo Define fully when fairdrop_lbp_v2.aleo is implemented.
 */

import type { U128, U16 } from '../../primitives/scalars';
import type { BaseAuctionConfig, AuctionState, BaseBid } from './common';

export interface LbpAuctionConfig extends BaseAuctionConfig {
  start_weight:   U16;  // initial sale-token weight in bps (e.g. 9000 = 90%)
  end_weight:     U16;  // final sale-token weight in bps   (e.g. 1000 = 10%)
  swap_fee_bps:   U16;
  initial_price:  U128;
}

export type LbpBid = BaseBid;

export type { AuctionState };

