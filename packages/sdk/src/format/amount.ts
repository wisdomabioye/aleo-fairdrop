/**
 * Token amount formatting and parsing — pure functions, no I/O.
 *
 * On-chain amounts are always raw bigint integers. These helpers convert between
 * that representation and human-readable display strings.
 */

/**
 * Format a raw on-chain bigint amount to a locale string respecting decimals.
 * @example formatAmount(1_500_000n, 6) → "1.5"
 */
export function formatAmount(amount: bigint, decimals = 0): string {
  if (decimals === 0) return BigInt(amount).toLocaleString();
  const divisor = 10n ** BigInt(decimals);
  const whole   = BigInt(amount) / divisor;
  const frac    = BigInt(amount) % divisor;
  const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '');
  return fracStr ? `${whole.toLocaleString()}.${fracStr}` : whole.toLocaleString();
}

/**
 * Parse a human-readable token amount string to a raw on-chain bigint.
 * Inverse of formatAmount. Extra decimal digits are truncated (not rounded).
 * Returns 0n on invalid input.
 * @example parseTokenAmount("1.5", 6) → 1_500_000n
 */
export function parseTokenAmount(input: string, decimals: number): bigint {
  const trimmed = input.trim();
  if (!trimmed) return 0n;
  const match = trimmed.match(/^(\d+)(?:\.(\d+))?$/);
  if (!match) return 0n;
  const whole = match[1]!;
  const frac  = (match[2] ?? '').slice(0, decimals).padEnd(decimals, '0');
  try {
    return BigInt(whole + frac);
  } catch {
    return 0n;
  }
}

/**
 * Convert a raw bigint amount to a plain numeric string (no locale separators).
 * Used for input field pre-population where commas would be invalid.
 */
export function toPlainAmount(amount: bigint, decimals: number): string {
  if (decimals === 0) return amount.toString();
  const divisor = 10n ** BigInt(decimals);
  const whole   = amount / divisor;
  const frac    = amount % divisor;
  const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '');
  return fracStr ? `${whole}.${fracStr}` : whole.toString();
}
