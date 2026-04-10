/**
 * AMM seeding — builds the single transaction that seeds a DEX pool from
 * auction proceeds.
 *
 * seed_liquidity is implemented in all 6 auction contracts and performs the
 * entire sequence atomically:
 *   • Transfers creator_revenue (credits) back to the creator
 *   • Creates an in-flight CREDITS_RESERVED_TOKEN_ID record → DEX
 *   • Mints unsold sale tokens as an in-flight record → DEX
 *   • CPI-calls fairswap_dex_v2::add_liquidity_cpi_private_in
 *     (atomically creates pool if it doesn't exist, updates reserves, mints LP)
 *
 * Pre-condition: creator must hold >= amountCredits of CREDITS_RESERVED_TOKEN_ID
 * in their token_registry public balance. Use validateSeedLiquidity() to surface
 * this before calling buildSeedLiquidity().
 */

import type { AuctionView } from '@fairdrop/types/domain';
import { getMappingValue } from '../chain/_mapping';
import { computeTokenOwnerKey } from '../hash/keys';
import {
  fetchAuctionConfig,
  fetchAuctionState,
  fetchCreatorWithdrawn,
  fetchUnsoldWithdrawn,
} from '../chain/auction';
import { parseU128, u128ToBigInt } from '../parse/leo';
import { CREDITS_RESERVED_TOKEN_ID } from '../credits/constants';
import { SYSTEM_PROGRAMS } from '../constants';
import { DEFAULT_TX_FEE, type TxSpec } from '../transactions/_types';

// ── Build ─────────────────────────────────────────────────────────────────────

export interface SeedLiquidityInput {
  /** Sale tokens to commit to the pool; bounded by available unsold supply. */
  amountSaleToken: bigint;
  /** Credits to commit to the pool; bounded by available creator_revenue. */
  amountCredits:   bigint;
  /** Pool fee in basis points — used only when creating a new pool. */
  feeBps:          number;
  /** Minimum LP tokens to receive (slippage guard). */
  minLp:           bigint;
  /** Address that will receive the minted LP tokens. */
  lpRecipient:     string;
}

/**
 * Build the seed_liquidity transaction spec.
 *
 * Takes an AuctionView (supplies programId, id, saleTokenId) and the caller's
 * chosen amounts. Submit with executeTransaction() — no multi-step sequence.
 */
export function buildSeedLiquidity(
  auction: AuctionView,
  input:   SeedLiquidityInput,
  fee = DEFAULT_TX_FEE,
): TxSpec {
  return {
    program:  auction.programId,
    function: 'seed_liquidity',
    inputs: [
      auction.id,
      auction.saleTokenId,
      `${input.amountSaleToken}u128`,
      `${input.amountCredits}u128`,
      `${input.feeBps}u16`,
      `${input.minLp}u128`,
      input.lpRecipient,
    ],
    fee,
    privateFee: false,
  };
}

// ── Pre-flight validation ─────────────────────────────────────────────────────

export interface SeedLiquidityValidation {
  valid:          boolean;
  error?:         string;
  maxSaleToken:   bigint;  // config.supply - totalCommitted - unsoldWithdrawn
  maxCredits:     bigint;  // creatorRevenue - creatorWithdrawn
  creatorBalance: bigint;  // creator's CREDITS_RESERVED_TOKEN_ID in token_registry
}

/**
 * Pre-flight check before calling buildSeedLiquidity.
 *
 * Fetches current on-chain state to compute available amounts and verifies the
 * creator holds enough CREDITS_RESERVED_TOKEN_ID to fund the credits side.
 *
 * Returns structured errors rather than throwing — use `.error` in the UI to
 * show actionable messages before the user submits.
 */
export async function validateSeedLiquidity(
  auction:        AuctionView,
  input:          SeedLiquidityInput,
  creatorAddress: string,
): Promise<SeedLiquidityValidation> {
  const [config, state, creatorWithdrawn, unsoldWithdrawn] = await Promise.all([
    fetchAuctionConfig(auction.id, auction.programId),
    fetchAuctionState(auction.id, auction.programId),
    fetchCreatorWithdrawn(auction.id, auction.programId),
    fetchUnsoldWithdrawn(auction.id, auction.programId),
  ]);

  if (!config || !state) {
    return { valid: false, error: 'Failed to fetch auction state', maxSaleToken: 0n, maxCredits: 0n, creatorBalance: 0n };
  }

  if (!state.cleared || state.voided) {
    return { valid: false, error: 'Auction is not in cleared state', maxSaleToken: 0n, maxCredits: 0n, creatorBalance: 0n };
  }

  const supply         = BigInt(config.supply.replace(/u128$/, ''));
  const totalCommitted = BigInt(state.total_committed.replace(/u128$/, ''));
  const creatorRevenue = BigInt(state.creator_revenue.replace(/u128$/, ''));

  const maxSaleToken = supply - totalCommitted - unsoldWithdrawn;
  const maxCredits   = creatorRevenue - creatorWithdrawn;

  // Fetch creator's wrapped credits balance in token_registry
  let creatorBalance = 0n;
  try {
    const key = computeTokenOwnerKey(creatorAddress, CREDITS_RESERVED_TOKEN_ID);
    const raw = (await getMappingValue(SYSTEM_PROGRAMS.tokenRegistry, 'authorized_balances', key))
             ?? (await getMappingValue(SYSTEM_PROGRAMS.tokenRegistry, 'balances', key));
    if (raw) creatorBalance = u128ToBigInt(parseU128(raw));
  } catch { /* balance stays 0n */ }

  if (input.amountSaleToken > maxSaleToken) {
    return { valid: false, error: `amountSaleToken exceeds available unsold (max ${maxSaleToken})`, maxSaleToken, maxCredits, creatorBalance };
  }
  if (input.amountCredits > maxCredits) {
    return { valid: false, error: `amountCredits exceeds available revenue (max ${maxCredits})`, maxSaleToken, maxCredits, creatorBalance };
  }
  if (creatorBalance < input.amountCredits) {
    return { valid: false, error: `Creator holds ${creatorBalance} CREDITS_RESERVED_TOKEN_ID; need ${input.amountCredits}`, maxSaleToken, maxCredits, creatorBalance };
  }

  return { valid: true, maxSaleToken, maxCredits, creatorBalance };
}
