import { describe, it, expect } from 'vitest';
import { formatAmount, parseTokenAmount, toPlainAmount } from './amount';

describe('formatAmount', () => {
  it('formats zero decimals',        () => expect(formatAmount(1_500_000n, 0)).toBe('1,500,000'));
  it('formats with decimals',        () => expect(formatAmount(1_500_000n, 6)).toBe('1.5'));
  it('formats whole amount',         () => expect(formatAmount(2_000_000n, 6)).toBe('2'));
  it('formats fractional only',      () => expect(formatAmount(500n, 6)).toBe('0.0005'));
  it('trims trailing zeros',         () => expect(formatAmount(1_100_000n, 6)).toBe('1.1'));
  it('handles 0n',                   () => expect(formatAmount(0n, 6)).toBe('0'));
});

describe('parseTokenAmount', () => {
  it('parses whole number',          () => expect(parseTokenAmount('1', 6)).toBe(1_000_000n));
  it('parses decimal',               () => expect(parseTokenAmount('1.5', 6)).toBe(1_500_000n));
  it('parses exact precision',       () => expect(parseTokenAmount('0.000001', 6)).toBe(1n));
  it('truncates extra decimals',     () => expect(parseTokenAmount('1.9999999', 6)).toBe(1_999_999n));
  it('returns 0n for empty string',  () => expect(parseTokenAmount('', 6)).toBe(0n));
  it('returns 0n for invalid input', () => expect(parseTokenAmount('abc', 6)).toBe(0n));
  it('returns 0n for negative',      () => expect(parseTokenAmount('-1', 6)).toBe(0n));
  it('pads short fraction',          () => expect(parseTokenAmount('1.5', 8)).toBe(150_000_000n));
});

describe('toPlainAmount', () => {
  it('returns plain string',         () => expect(toPlainAmount(1_500_000n, 6)).toBe('1.5'));
  it('no locale separators',         () => expect(toPlainAmount(1_000_000_000n, 6)).toBe('1000'));
  it('handles zero decimals',        () => expect(toPlainAmount(42n, 0)).toBe('42'));
  it('handles 0n',                   () => expect(toPlainAmount(0n, 6)).toBe('0'));
});
