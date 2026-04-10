/**
 * Pure AMM math — mirrors the on-chain Leo arithmetic exactly.
 *
 * All functions are synchronous and have no I/O. Call them before submitting
 * transactions to compute expected amounts for UI previews and to build the
 * snapshot inputs required by the private-path transitions.
 */

/** 1000 LP burned to zero address on first mint (MIN_LIQUIDITY in contract). */
const MIN_LIQUIDITY = 1_000n;

/**
 * Compute the swap output amount for a given input.
 * Mirrors: swap_out(res_in, res_out, amount_in, fee_bps) in fairswap_dex_v2.aleo.
 *
 * @returns Amount of token_out the DEX will pay out.
 */
export function computeSwapOutput(
  reserveIn:  bigint,
  reserveOut: bigint,
  amountIn:   bigint,
  feeBps:     number,
): bigint {
  const amountInWithFee = amountIn * BigInt(10_000 - feeBps);
  const numerator       = reserveOut * amountInWithFee;
  const denominator     = reserveIn * 10_000n + amountInWithFee;
  return numerator / denominator;
}

/**
 * Compute how much LP will be minted for a given deposit.
 *
 * Initial mint (lpSupply === 0n):  sqrt(amountA * amountB) − MIN_LIQUIDITY
 * Subsequent mint:                 min(amountA*lpSupply/reserveA, amountB*lpSupply/reserveB)
 *
 * Pass the result as `lpToMint` to buildAddLiquidityPrivate. Use a slippage
 * percentage on top to derive `minLp`.
 */
export function computeLpToMint(
  reserveA: bigint,
  reserveB: bigint,
  lpSupply: bigint,
  amountA:  bigint,
  amountB:  bigint,
): bigint {
  if (lpSupply === 0n) {
    const raw = bigintSqrt(amountA * amountB);
    return raw > MIN_LIQUIDITY ? raw - MIN_LIQUIDITY : 0n;
  }
  const lpFromA = (amountA * lpSupply) / reserveA;
  const lpFromB = (amountB * lpSupply) / reserveB;
  return lpFromA < lpFromB ? lpFromA : lpFromB;
}

/**
 * Given amountA and current reserves, compute how much tokenB is required
 * to maintain the pool ratio, and how much LP will be minted.
 *
 * Use this to populate both sides of the add-liquidity form when the user
 * enters a value for one token.
 */
export function computeAddLiquidityAmounts(
  reserveA: bigint,
  reserveB: bigint,
  lpSupply: bigint,
  amountA:  bigint,
): { amountB: bigint; lpMinted: bigint } {
  if (lpSupply === 0n || reserveA === 0n) {
    // New pool — ratio not yet set; caller supplies both amounts freely.
    return { amountB: 0n, lpMinted: 0n };
  }
  const amountB  = (amountA * reserveB) / reserveA;
  const lpMinted = computeLpToMint(reserveA, reserveB, lpSupply, amountA, amountB);
  return { amountB, lpMinted };
}

/**
 * Compute the token amounts returned for burning `lpAmount` LP tokens.
 *
 * Pass the results as `amountA`/`amountB` to buildRemoveLiquidityPrivate.
 * Apply a slippage tolerance to derive `minA`/`minB`.
 */
export function computeRemoveLiquidityAmounts(
  reserveA: bigint,
  reserveB: bigint,
  lpSupply: bigint,
  lpAmount: bigint,
): { amountA: bigint; amountB: bigint } {
  if (lpSupply === 0n) return { amountA: 0n, amountB: 0n };
  return {
    amountA: (lpAmount * reserveA) / lpSupply,
    amountB: (lpAmount * reserveB) / lpSupply,
  };
}

/**
 * Apply a slippage tolerance (in basis points) to an expected amount.
 * Returns the minimum acceptable amount.
 *
 * e.g. applySlippage(1_000_000n, 50) → 995_000n  (0.5% slippage)
 */
export function applySlippage(amount: bigint, slippageBps: number): bigint {
  return (amount * BigInt(10_000 - slippageBps)) / 10_000n;
}

// ── Internal ──────────────────────────────────────────────────────────────────

/**
 * Integer square root via Newton-Raphson iteration.
 * Mirrors the 64-iteration implementation in fairswap_dex_v2.aleo.
 */
function bigintSqrt(n: bigint): bigint {
  if (n === 0n) return 0n;
  let x = n;
  let y = (x + 1n) / 2n;
  while (y < x) {
    x = y;
    y = (x + n / x) / 2n;
  }
  return x;
}
