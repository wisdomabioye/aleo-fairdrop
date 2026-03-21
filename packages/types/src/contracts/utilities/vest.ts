/**
 * fairdrop_vest.aleo — TypeScript types.
 *
 * Token vesting. Auction contracts call create_vest after clearing;
 * token holders call release once the cliff has passed.
 * fairdrop_vest.aleo holds SUPPLY_MANAGER_ROLE and mints tokens on release.
 */

import type { Field, Address, U128, U32 } from '../../primitives/scalars.js';

/**
 * Private vesting schedule record.
 * Issued by claim_vested; consumed (partially or fully) by release.
 * `owner` is passed as a private param to create_vest — never reaches finalize.
 */
export interface VestedAllocation {
  owner:          Address; // private — recipient identity hidden on-chain
  auction_id:     Field;
  sale_token_id:  Field;
  total_amount:   U128;
  claimed:        U128;    // cumulative amount already released
  ended_at_block: U32;     // vesting start reference (set at close_auction)
  cliff_blocks:   U32;     // blocks after ended_at_block before any release
  vest_end_blocks: U32;    // blocks after ended_at_block for full vesting
}

/**
 * Input to `create_vest` — called from claim_vested.
 * `owner` is a private param in Leo; passed as part of the transition call.
 */
export interface CreateVestInput {
  auction_id:      Field;
  owner:           Address; // private — goes into the VestedAllocation record
  sale_token_id:   Field;
  total_amount:    U128;
  ended_at_block:  U32;
  cliff_blocks:    U32;
  vest_end_blocks: U32;
}

/**
 * Input to `release`.
 * `vest` VestedAllocation record is passed separately by the wallet SDK.
 */
export interface ReleaseInput {
  amount: U128; // amount of tokens to release this call (partial releases ok)
}

export const VEST_PROGRAM_ID = 'fairdrop_vest.aleo' as const;
