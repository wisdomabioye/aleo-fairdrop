import { describe, it, expect } from 'vitest';
import { microToAleo, aleoToMicro, formatMicrocredits, isCreditsToken } from './convert';
import { CREDITS_RESERVED_TOKEN_ID } from './constants';

describe('microToAleo', () => {
  it('converts 1_000_000 microcredits to 1 ALEO', () => expect(microToAleo(1_000_000n)).toBe(1));
  it('converts 1_500_000 to 1.5',                  () => expect(microToAleo(1_500_000n)).toBe(1.5));
  it('converts 0 to 0',                             () => expect(microToAleo(0n)).toBe(0));
});

describe('aleoToMicro', () => {
  it('converts whole number string',   () => expect(aleoToMicro('1')).toBe(1_000_000n));
  it('converts decimal string',        () => expect(aleoToMicro('1.5')).toBe(1_500_000n));
  it('converts number input',          () => expect(aleoToMicro(1.5)).toBe(1_500_000n));

  // The key float-safety cases — these would be wrong with Math.round(n * 1e6)
  it('0.57 → 570_000 (not 569_999)',   () => expect(aleoToMicro('0.57')).toBe(570_000n));
  it('0.1 → 100_000',                  () => expect(aleoToMicro('0.1')).toBe(100_000n));
  it('1.1 → 1_100_000',                () => expect(aleoToMicro('1.1')).toBe(1_100_000n));

  it('truncates extra decimal digits', () => expect(aleoToMicro('1.9999999')).toBe(1_999_999n));
  it('returns null for negative',      () => expect(aleoToMicro('-1')).toBeNull());
  it('returns null for empty string',  () => expect(aleoToMicro('')).toBeNull());
  it('returns null for letters',       () => expect(aleoToMicro('abc')).toBeNull());
  it('handles 0',                      () => expect(aleoToMicro('0')).toBe(0n));
  it('handles 0.0',                    () => expect(aleoToMicro('0.0')).toBe(0n));
});

describe('formatMicrocredits', () => {
  it('formats whole amount',           () => expect(formatMicrocredits(1_000_000n)).toBe('1 ALEO'));
  it('formats fractional amount',      () => expect(formatMicrocredits(1_500_000n)).toBe('1.5 ALEO'));
  it('formats sub-unit amount',        () => expect(formatMicrocredits(1n)).toBe('0.000001 ALEO'));
  it('formats zero',                   () => expect(formatMicrocredits(0n)).toBe('0 ALEO'));
  it('trims trailing zeros',           () => expect(formatMicrocredits(1_100_000n)).toBe('1.1 ALEO'));
});

describe('isCreditsToken', () => {
  it('returns true for the reserved token ID',  () => expect(isCreditsToken(CREDITS_RESERVED_TOKEN_ID)).toBe(true));
  it('returns false for any other token ID',    () => expect(isCreditsToken('1field')).toBe(false));
});
