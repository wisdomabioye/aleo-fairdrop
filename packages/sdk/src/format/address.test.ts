import { describe, it, expect } from 'vitest';
import { truncateAddress, formatField } from './address';

describe('truncateAddress', () => {
  const addr = 'aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc';

  it('truncates a long address with default chars', () => {
    const result = truncateAddress(addr);
    expect(result).toBe('aleo1q...3ljyzc');
  });

  it('truncates with custom chars', () => {
    const result = truncateAddress(addr, 4);
    expect(result).toBe(`${addr.slice(0, 4)}...${addr.slice(-4)}`);
  });

  it('passes through short addresses unchanged', () => {
    const short = 'aleo1short';
    expect(truncateAddress(short)).toBe(short);
  });
});

describe('formatField', () => {
  it('strips field suffix',                () => expect(formatField('12345field')).toBe('12345'));
  it('truncates long field values',        () => {
    const big = '12345678901234567890field';
    const result = formatField(big);
    expect(result).toContain('...');
    expect(result.length).toBeLessThan(big.length);
  });
  it('passes through short values',        () => expect(formatField('42field')).toBe('42'));
  it('handles value without field suffix', () => expect(formatField('no-suffix')).toBe('no-suffix'));
});
