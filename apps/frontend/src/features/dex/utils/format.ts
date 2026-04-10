import type { PoolState } from '@fairdrop/sdk/dex';

/**
 * Extract the correct reserve pair for a swap direction.
 * pool.tokenA is the canonical lesser token.
 */
export function getSwapDirection(
  pool:    PoolState,
  tokenIn: string,
): { reserveIn: bigint; reserveOut: bigint } {
  const isAIn = tokenIn === pool.tokenA;
  return {
    reserveIn:  isAIn ? pool.reserveA : pool.reserveB,
    reserveOut: isAIn ? pool.reserveB : pool.reserveA,
  };
}

/**
 * Price impact as a percentage (0–100).
 * spot_before = reserveOut / reserveIn
 * spot_after  = (reserveOut - amountOut) / (reserveIn + amountIn)
 * impact      = (spot_before - spot_after) / spot_before * 100
 *
 * Uses scaled integer arithmetic to avoid floating-point during comparison.
 */
export function computePriceImpact(
  reserveIn:  bigint,
  reserveOut: bigint,
  amountIn:   bigint,
  amountOut:  bigint,
): number {
  if (reserveIn === 0n || reserveOut === 0n) return 0;
  // Guard: amountOut >= reserveOut would drain the pool entirely
  if (amountOut >= reserveOut) return 100;
  const SCALE = 1_000_000n;
  const spotBefore = (reserveOut * SCALE) / reserveIn;
  const spotAfter  = ((reserveOut - amountOut) * SCALE) / (reserveIn + amountIn);
  if (spotBefore === 0n) return 0;
  return Number((spotBefore - spotAfter) * 10_000n / spotBefore) / 100;
}

/** Format price impact for display with color class. */
export function formatPriceImpact(impact: number): { text: string; className: string } {
  const text = `${impact.toFixed(2)}%`;
  const className =
    impact < 1   ? 'text-emerald-400' :
    impact < 5   ? 'text-amber-400'   :
    'text-destructive';
  return { text, className };
}

/** Format LP amount for display (no symbol). */
export function formatLpAmount(amount: bigint): string {
  return amount.toLocaleString();
}

/** Format pool spot price A→B (reserveB / reserveA). */
export function formatPoolPrice(reserveA: bigint, reserveB: bigint, decimalsA: number, decimalsB: number): string {
  if (reserveA === 0n) return '—';
  const scale = 10n ** BigInt(decimalsB);
  const price = Number(reserveB * 10n ** BigInt(decimalsA)) / Number(reserveA * scale);
  return price < 0.001 ? price.toExponential(3) : price.toLocaleString(undefined, { maximumFractionDigits: 6 });
}
