/**
 * @fairdrop/sdk/dex
 *
 * Everything needed to interact with fairswap_dex_v3.aleo.
 *
 * Preferred usage — generated typed client:
 *   import { createFairswapDexV2 } from '@fairdrop/sdk/dex';
 *   const client = createFairswapDexV2({ executeTransaction: wallet.executeTransaction });
 *   await client.swap({ token_in_id, amount_in: String(amountIn), min_out: String(minOut), recipient });
 *
 * Supporting utilities:
 *   import { fetchPool, computeSwapOutput, computePoolKey, scanLpTokenRecords } from '@fairdrop/sdk/dex';
 */

// ── Chain reads ───────────────────────────────────────────────────────────────
export {
  fetchPool,
  fetchLpBalance,
  fetchProtocolFees,
  fetchDexPaused,
  type PoolState,
} from './chain';

// ── Transaction builders ──────────────────────────────────────────────────────
export {
  buildCreatePool,
  buildAddLiquidity,
  buildAddLiquidityPrivate,
  buildRemoveLiquidity,
  buildRemoveLiquidityPrivate,
  buildSwap,
  buildSwapPrivate,
  buildLpToPrivate,
  buildLpToPublic,
  buildWithdrawProtocolFees,
  type CreatePoolInput,
  type AddLiquidityInput,
  type AddLiquidityPrivateInput,
  type RemoveLiquidityInput,
  type RemoveLiquidityPrivateInput,
  type SwapInput,
  type SwapPrivateInput,
  type LpToPrivateInput,
  type LpToPublicInput,
  type WithdrawProtocolFeesInput,
} from './transactions';

// ── AMM math helpers ──────────────────────────────────────────────────────────
export {
  computeSwapOutput,
  computeLpToMint,
  computeAddLiquidityAmounts,
  computeRemoveLiquidityAmounts,
  applySlippage,
} from './math';

// ── Key derivation (re-exported for convenience) ──────────────────────────────
export { computePoolKey, computeLpBalKey, computeProtocolFeeKey } from '../hash/keys';

// ── AMM seeding (auction → DEX) ───────────────────────────────────────────────
export {
  buildSeedLiquidity,
  validateSeedLiquidity,
  type SeedLiquidityInput,
  type SeedLiquidityValidation,
} from './seed';

// ── Generated client + record scanner ────────────────────────────────────────
export {
  createFairswapDexV3,
  scanLpTokenRecords,
  type FairswapDexV3,
  type LpTokenRecord,
} from '../contracts/fairswap-dex-v3';
