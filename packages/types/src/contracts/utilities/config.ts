/**
 * fairdrop_config_v3.aleo — TypeScript types.
 *
 * Protocol-level configuration. Stores global params (fee_bps, creation_fee,
 * closer_reward, slash_reward_bps, min_auction_duration) and the paused flag.
 * Auction contracts snapshot these at create time (D16 pattern).
 */

import type { U128, U32, U16, Bool } from '../../primitives/scalars';

/** On-chain protocol configuration struct. */
export interface ProtocolConfig {
  fee_bps:              U16;   // protocol fee in basis points
  creation_fee:         U128;  // anti-spam creation deposit (microcredits)
  closer_reward:        U128;  // reward paid to close_auction caller
  slash_reward_bps:     U16;   // share of slashed stake given to reporter
  min_auction_duration: U32;   // minimum end_block - start_block
  referral_pool_bps:    U16;   // share of protocol_fee allocated to referral budget
  max_referral_bps:     U16;   // max commission_bps a single referrer code may claim
}

/**
 * Input to `assert_config` CPI.
 * Called from every auction create_auction to validate D16 snapshot.
 */
export interface AssertConfigInput {
  fee_bps:             U16;
  creation_fee:        U128;
  closer_reward:       U128;
  slash_reward_bps:    U16;
  referral_pool_bps:   U16;
  start_block:         U32;
  end_block:           U32;
}

/** `paused` mapping value — keyed by 0field. */
export type PausedState = Bool;

