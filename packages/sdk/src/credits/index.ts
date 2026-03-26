/**
 * Aleo credits protocol constants and unit-conversion helpers.
 *
 * credits.aleo is the only accepted payment token in fairdrop v2.
 * CREDITS_RESERVED_TOKEN_ID is the canonical token_registry.aleo key for ALEO.
 */

// ── Protocol constants ────────────────────────────────────────────────────────

/** The reserved token_id under which credits.aleo is registered in token_registry.aleo. */
export const CREDITS_RESERVED_TOKEN_ID =
  '3443843282313283355522573239085696902919850365217539366784739393210722344986field';

/** Native Aleo credits use 6 decimal places (microcredits). */
export const CREDITS_DECIMALS = 6;

export const CREDITS_SYMBOL = 'ALEO';
export const CREDITS_NAME   = 'Aleo Credits';

// ── Unit conversion ───────────────────────────────────────────────────────────

/** Microcredits (bigint) → display ALEO (number, 6 decimal places). */
export function microToAleo(microcredits: bigint): number {
  return Number(microcredits) / 10 ** CREDITS_DECIMALS;
}

/** Display ALEO (string or number) → microcredits bigint. Returns null on invalid input. */
export function aleoToMicro(aleo: string | number): bigint | null {
  const n = typeof aleo === 'string' ? parseFloat(aleo) : aleo;
  if (!isFinite(n) || n < 0) return null;
  return BigInt(Math.round(n * 10 ** CREDITS_DECIMALS));
}

/**
 * Format microcredits for display.
 * @example formatMicrocredits(1_500_000n) → "1.5 ALEO"
 */
export function formatMicrocredits(microcredits: bigint, decimals = CREDITS_DECIMALS): string {
  const divisor = 10 ** decimals;
  const whole = BigInt(microcredits) / BigInt(divisor);
  const frac  = BigInt(microcredits) % BigInt(divisor);
  if (frac === 0n) return `${whole} ${CREDITS_SYMBOL}`;
  const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${whole}.${fracStr} ${CREDITS_SYMBOL}`;
}

// ── Validation ────────────────────────────────────────────────────────────────

/** True when the given tokenId refers to native credits (the only payment token). */
export function isCreditsToken(tokenId: string): boolean {
  return tokenId === CREDITS_RESERVED_TOKEN_ID;
}
