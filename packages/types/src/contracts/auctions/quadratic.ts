/**
 * fairdrop_quadratic.aleo — TypeScript types.
 *
 * Quadratic funding auction: contribution weight is the square root of the
 * amount, giving smaller contributors proportionally more influence.
 *
 * @todo Define fully when fairdrop_quadratic.aleo is implemented.
 */

import type { U128, U32 } from '../../primitives/scalars';
import type { BaseAuctionConfig, AuctionState, BaseBid } from './common';

export interface QuadraticAuctionConfig extends BaseAuctionConfig {
  matching_pool:       U128; // external matching credits added by the creator
  contribution_cap:    U128; // max individual contribution (0 = unlimited)
  matching_deadline:   U32;  // block height after which matching is locked
}

export type QuadraticBid = BaseBid;

export type { AuctionState };

