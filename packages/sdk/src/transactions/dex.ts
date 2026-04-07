/**
 * AMM seeding helpers — builds the ordered TxSpec sequence for seeding a
 * private_dex.aleo liquidity pool from auction proceeds.
 *
 * Flow:
 *   [0] withdraw_payments  — credits amount → creator's public balance
 *   [1] withdraw_unsold    — token amount   → creator (private record)
 *   [2] add_liquidity      — credits + token record → LP token
 *
 * The DEX accepts public credits directly (no shielding step required).
 * Transactions must be submitted and confirmed in order — the token record
 * from [1] must be resolved before submitting [2].
 *
 * NOTE: private_dex.aleo is not yet deployed. The `add_liquidity` program ID
 * and input ordering must be confirmed against the deployed ABI before use.
 * `buildAddLiquidity` is a placeholder; do not call until deployment is verified.
 */

import type { AuctionView } from '@fairdrop/types/domain';
import { DEFAULT_TX_FEE, type TxSpec } from './_types';
import { withdrawPayments, withdrawUnsold } from './auction';

const PRIVATE_DEX_PROGRAM = 'private_dex.aleo';   // confirm after deployment

export interface SeedFromAuctionInput {
  auction:       AuctionView;
  /** Microcredits to commit as the credits side of the pool. Must be ≤ remaining creator_revenue. */
  creditsAmount: bigint;
  /** Token units to commit as the token side of the pool. Must be ≤ remaining unsold supply. */
  tokenAmount:   bigint;
  /** Minimum LP tokens to receive — slippage guard passed to add_liquidity. */
  minLpTokens:   bigint;
}

/**
 * add_liquidity placeholder.
 *
 * Parameter names and ordering are provisional — confirm against deployed
 * private_dex.aleo ABI before shipping. The DEX accepts public credits
 * (u64 amount) and a private token record.
 */
export function buildAddLiquidity(
  creditsAmount: bigint,
  tokenRecord:   Record<string, unknown>,
  minLpTokens:   bigint,
  fee = DEFAULT_TX_FEE,
): TxSpec {
  return {
    program:    PRIVATE_DEX_PROGRAM,
    function:   'add_liquidity',
    inputs:     [`${creditsAmount}u64`, tokenRecord as unknown as string, `${minLpTokens}u64`],
    fee,
    privateFee: false,
  };
}

/**
 * Build the ordered 3-transaction sequence for seeding from auction proceeds.
 *
 * The caller (useSeedLiquidity hook) submits each TxSpec in order, waiting
 * for on-chain confirmation between [1] and [2] so the token record is
 * available as input to add_liquidity.
 *
 * The add_liquidity TxSpec returned here is a template — the hook must
 * substitute the actual token record from the withdraw_unsold output before
 * submitting step [2].
 */
export function buildSeedFromAuction(input: SeedFromAuctionInput): [TxSpec, TxSpec, TxSpec] {
  const { auction, creditsAmount, tokenAmount, minLpTokens } = input;

  const withdrawCreditsTx = withdrawPayments(auction, creditsAmount, auction.creator);
  const withdrawTokensTx  = withdrawUnsold(auction, tokenAmount, auction.creator);

  // Placeholder — token record is substituted by the hook after step [1] confirms.
  const addLiquidityTx = buildAddLiquidity(creditsAmount, {}, minLpTokens);

  return [withdrawCreditsTx, withdrawTokensTx, addLiquidityTx];
}
