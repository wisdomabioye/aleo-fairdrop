import { describe, it, expect } from 'vitest';
import { u128, u64, u32, u16, u8, i64, toFieldLiteral, leoStruct, aleou128 } from './leo';

describe('integer literal helpers', () => {
  it('u128', () => expect(u128(1_500_000)).toBe('1500000u128'));
  it('u64',  () => expect(u64(999n)).toBe('999u64'));
  it('u32',  () => expect(u32(0)).toBe('0u32'));
  it('u16',  () => expect(u16('65535')).toBe('65535u16'));
  it('u8',   () => expect(u8(255)).toBe('255u8'));
  it('i64',  () => expect(i64(-1n)).toBe('-1i64'));
});

describe('toFieldLiteral', () => {
  it('appends field suffix when missing', () => expect(toFieldLiteral('42')).toBe('42field'));
  it('passes through if already suffixed', () => expect(toFieldLiteral('42field')).toBe('42field'));
});

describe('leoStruct', () => {
  it('serialises a flat struct', () => {
    expect(leoStruct({ amount: u128(100), nonce: toFieldLiteral('42') }))
      .toBe('{ amount: 100u128, nonce: 42field }');
  });

  it('preserves field order', () => {
    const s = leoStruct({ a: u8(1), b: u8(2), c: u8(3) });
    expect(s).toBe('{ a: 1u8, b: 2u8, c: 3u8 }');
  });
});

describe('aleou128', () => {
  it('converts whole ALEO amount',     () => expect(aleou128('1')).toBe('1000000u128'));
  it('converts decimal ALEO amount',   () => expect(aleou128('1.5')).toBe('1500000u128'));
  it('handles empty string as zero',   () => expect(aleou128('')).toBe('0u128'));
  it('truncates extra decimal digits', () => expect(aleou128('0.9999999')).toBe('999999u128'));
});
