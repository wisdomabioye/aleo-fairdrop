/**
 * @deprecated Use `createFairswapDexV2` from `@fairdrop/sdk/dex` directly.
 *
 * The generated client provides fully typed transitions with correct
 * serialization via the ABI. These manual builders are redundant and will
 * be removed once the generated client is validated in production.
 *
 * Migration:
 *   import { createFairswapDexV2 } from '@fairdrop/sdk/dex';
 *   const client = createFairswapDexV2({ executeTransaction: wallet.executeTransaction });
 *   const spec = client.swap.build({ token_in_id, amount_in: String(amountIn), ... });
 *
 * ---
 *
 * Transaction builders for fairswap_dex_v2.aleo.
 *
 * All builders accept JS-native types (bigint amounts, plain strings for
 * addresses and field literals) and return TxSpec — same shape as every
 * other SDK builder. Spread directly into executeTransaction().
 *
 * Private-path builders (swap_private, add_liquidity_private,
 * remove_liquidity_private) use the snapshot pattern: caller pre-computes
 * expected amounts with the math helpers in ./math, then passes them as
 * inputs. The on-chain final{} block verifies the committed amount fits
 * within what the current reserves can support.
 */

import { PROGRAMS } from '@fairdrop/config';
import { DEFAULT_TX_FEE, type TxSpec } from '../transactions/_types';

const DEX_PROGRAM = PROGRAMS.fairswap.programId;

// ── Input interfaces ──────────────────────────────────────────────────────────

export interface CreatePoolInput {
  tokenX: string;  // field literal "Nfield"
  tokenY: string;
  feeBps: number;
}

export interface AddLiquidityInput {
  tokenAId:  string;
  tokenBId:  string;
  amountA:   bigint;
  amountB:   bigint;
  feeBps:    number;  // used only when creating a new pool; ignored if pool exists
  minLp:     bigint;
  recipient: string;
}

/**
 * Snapshot pattern: compute lpToMint with computeLpToMint() first,
 * then apply a slippage tolerance with applySlippage() to get minLp.
 * The on-chain final{} asserts actual_lp >= minLp.
 */
export interface AddLiquidityPrivateInput {
  recordA:   string | Record<string, unknown>;  // Token wallet record for tokenA
  recordB:   string | Record<string, unknown>;  // Token wallet record for tokenB
  lpToMint:  bigint;  // pre-computed — final{} asserts actual <= this
  minLp:     bigint;  // slippage floor
  feeBps:    number;
  recipient: string;
}

export interface RemoveLiquidityInput {
  tokenAId:  string;
  tokenBId:  string;
  lpAmount:  bigint;
  minA:      bigint;
  minB:      bigint;
  recipient: string;
}

/**
 * Snapshot pattern: compute amountA/amountB with computeRemoveLiquidityAmounts(),
 * then apply applySlippage() to get minA/minB.
 * The on-chain final{} asserts committed amounts <= actual proportional share.
 */
export interface RemoveLiquidityPrivateInput {
  lp:        string | Record<string, unknown>;  // LpToken wallet record
  tokenAId:  string;
  tokenBId:  string;
  amountA:   bigint;  // pre-computed — final{} asserts committed <= actual
  amountB:   bigint;
  minA:      bigint;  // slippage floor
  minB:      bigint;
  recipient: string;
}

export interface SwapInput {
  tokenInId:  string;
  tokenOutId: string;
  amountIn:   bigint;
  minOut:     bigint;
  recipient:  string;
}

/**
 * Snapshot pattern: compute amountOut with computeSwapOutput(), then apply
 * applySlippage() to get minOut.
 * The on-chain final{} asserts amount_out <= actual_out (prevents over-commitment).
 */
export interface SwapPrivateInput {
  tokenIn:    string | Record<string, unknown>;  // Token wallet record
  tokenOutId: string;
  amountOut:  bigint;  // pre-computed snapshot — final{} asserts actual >= this
  minOut:     bigint;  // slippage floor
  recipient:  string;
}

export interface LpToPrivateInput {
  poolKey: string;  // field literal — use computePoolKey() to derive
  amount:  bigint;
}

export interface LpToPublicInput {
  lp:        string | Record<string, unknown>;  // LpToken wallet record
  recipient: string;
}

export interface WithdrawProtocolFeesInput {
  poolKey:   string;
  tokenId:   string;
  amount:    bigint;
  recipient: string;
  opNonce:   bigint;
}

// ── Public paths ──────────────────────────────────────────────────────────────

export function buildCreatePool(input: CreatePoolInput, fee = DEFAULT_TX_FEE): TxSpec {
  return {
    program:  DEX_PROGRAM,
    function: 'create_pool',
    inputs:   [input.tokenX, input.tokenY, `${input.feeBps}u16`],
    fee,
    privateFee: false,
  };
}

export function buildAddLiquidity(input: AddLiquidityInput, fee = DEFAULT_TX_FEE): TxSpec {
  return {
    program:  DEX_PROGRAM,
    function: 'add_liquidity',
    inputs:   [
      input.tokenAId,
      input.tokenBId,
      `${input.amountA}u128`,
      `${input.amountB}u128`,
      `${input.feeBps}u16`,
      `${input.minLp}u128`,
      input.recipient,
    ],
    fee,
    privateFee: false,
  };
}

export function buildAddLiquidityPrivate(input: AddLiquidityPrivateInput, fee = DEFAULT_TX_FEE): TxSpec {
  return {
    program:  DEX_PROGRAM,
    function: 'add_liquidity_private',
    inputs:   [
      input.recordA,
      input.recordB,
      `${input.lpToMint}u128`,
      `${input.minLp}u128`,
      `${input.feeBps}u16`,
      input.recipient,
    ],
    fee,
    privateFee: false,
  };
}

export function buildRemoveLiquidity(input: RemoveLiquidityInput, fee = DEFAULT_TX_FEE): TxSpec {
  return {
    program:  DEX_PROGRAM,
    function: 'remove_liquidity',
    inputs:   [
      input.tokenAId,
      input.tokenBId,
      `${input.lpAmount}u128`,
      `${input.minA}u128`,
      `${input.minB}u128`,
      input.recipient,
    ],
    fee,
    privateFee: false,
  };
}

export function buildRemoveLiquidityPrivate(input: RemoveLiquidityPrivateInput, fee = DEFAULT_TX_FEE): TxSpec {
  return {
    program:  DEX_PROGRAM,
    function: 'remove_liquidity_private',
    inputs:   [
      input.lp,
      input.tokenAId,
      input.tokenBId,
      `${input.amountA}u128`,
      `${input.amountB}u128`,
      `${input.minA}u128`,
      `${input.minB}u128`,
      input.recipient,
    ],
    fee,
    privateFee: false,
  };
}

export function buildSwap(input: SwapInput, fee = DEFAULT_TX_FEE): TxSpec {
  return {
    program:  DEX_PROGRAM,
    function: 'swap',
    inputs:   [
      input.tokenInId,
      input.tokenOutId,
      `${input.amountIn}u128`,
      `${input.minOut}u128`,
      input.recipient,
    ],
    fee,
    privateFee: false,
  };
}

export function buildSwapPrivate(input: SwapPrivateInput, fee = DEFAULT_TX_FEE): TxSpec {
  return {
    program:  DEX_PROGRAM,
    function: 'swap_private',
    inputs:   [
      input.tokenIn,
      input.tokenOutId,
      `${input.amountOut}u128`,
      `${input.minOut}u128`,
      input.recipient,
    ],
    fee,
    privateFee: false,
  };
}

export function buildLpToPrivate(input: LpToPrivateInput, fee = DEFAULT_TX_FEE): TxSpec {
  return {
    program:  DEX_PROGRAM,
    function: 'lp_to_private',
    inputs:   [input.poolKey, `${input.amount}u128`],
    fee,
    privateFee: false,
  };
}

export function buildLpToPublic(input: LpToPublicInput, fee = DEFAULT_TX_FEE): TxSpec {
  return {
    program:  DEX_PROGRAM,
    function: 'lp_to_public',
    inputs:   [input.lp, input.recipient],
    fee,
    privateFee: false,
  };
}

// ── Governance ────────────────────────────────────────────────────────────────

export function buildWithdrawProtocolFees(input: WithdrawProtocolFeesInput, fee = DEFAULT_TX_FEE): TxSpec {
  return {
    program:  DEX_PROGRAM,
    function: 'withdraw_protocol_fees',
    inputs:   [
      input.poolKey,
      input.tokenId,
      `${input.amount}u128`,
      input.recipient,
      `${input.opNonce}u64`,
    ],
    fee,
    privateFee: false,
  };
}
