/**
 * Unit conversion and display helpers for Aleo credits.
 *
 * credits.aleo is the only accepted payment token in Fairdrop v2.
 * On-chain values are always u64 microcredits (1 ALEO = 1_000_000 microcredits).
 */

import { CREDITS_DECIMALS, CREDITS_RESERVED_TOKEN_ID, CREDITS_SYMBOL } from './constants';

/** Microcredits (bigint) → display ALEO (number, up to 6 decimal places). */
export function microToAleo(microcredits: bigint): number {
  return Number(BigInt(microcredits)) / 10 ** CREDITS_DECIMALS;
}

/**
 * Display ALEO (string or number) → microcredits bigint.
 *
 * Uses string-based parsing to avoid IEEE 754 rounding errors.
 * Fractional digits beyond CREDITS_DECIMALS are truncated (not rounded).
 * Returns null on invalid or negative input.
 *
 * @example aleoToMicro("1.5")  → 1_500_000n
 * @example aleoToMicro(0.57)   → 570_000n   (not 569_999n)
 */
export function aleoToMicro(aleo: string | number): bigint | null {
  const s = (typeof aleo === 'number' ? aleo.toString() : aleo).trim();
  if (!/^\d+(\.\d+)?$/.test(s)) return null;

  const dotIdx = s.indexOf('.');
  const whole  = dotIdx === -1 ? s : s.slice(0, dotIdx);
  const frac   = dotIdx === -1 ? '' : s.slice(dotIdx + 1);

  // Pad or truncate fractional part to exactly CREDITS_DECIMALS digits
  const fracFixed = frac.slice(0, CREDITS_DECIMALS).padEnd(CREDITS_DECIMALS, '0');

  return BigInt(whole) * 10n ** BigInt(CREDITS_DECIMALS) + BigInt(fracFixed);
}

/**
 * Format microcredits for display.
 * @example formatMicrocredits(1_500_000n) → "1.5 ALEO"
 */
export function formatMicrocredits(microcredits: bigint, decimals = CREDITS_DECIMALS): string {
  const divisor = BigInt(10 ** decimals);
  const whole   = BigInt(microcredits) / divisor;
  const frac    = BigInt(microcredits) % divisor;
  if (frac === 0n) return `${whole} ${CREDITS_SYMBOL}`;
  const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${whole}.${fracStr} ${CREDITS_SYMBOL}`;
}

/** True when the given tokenId refers to native credits (the only payment token). */
export function isCreditsToken(tokenId: string): boolean {
  return tokenId === CREDITS_RESERVED_TOKEN_ID;
}
