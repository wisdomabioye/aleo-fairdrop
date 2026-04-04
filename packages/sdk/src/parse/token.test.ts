import { describe, it, expect } from 'vitest';
import { asciiToU128, u128ToAscii, parseTokenInfo, parseRawTokenBalance } from './token';

describe('asciiToU128', () => {
  it('encodes a short string',    () => expect(asciiToU128('ALEO')).toBe(1095517519n));
  it('round-trips with decode',   () => expect(u128ToAscii(asciiToU128('pALEO'))).toBe('pALEO'));
  it('throws on empty string',    () => expect(() => asciiToU128('')).toThrow());
  it('throws on > 16 chars',      () => expect(() => asciiToU128('A'.repeat(17))).toThrow());
  it('throws on non-ASCII char',  () => expect(() => asciiToU128('héllo')).toThrow());
});

describe('u128ToAscii', () => {
  it('returns "" for 0n',         () => expect(u128ToAscii(0n)).toBe(''));
  it('decodes known value',       () => expect(u128ToAscii(1095517519n)).toBe('ALEO'));
});

describe('parseTokenInfo', () => {
  // Minimal struct string that mirrors token_registry.aleo/registered_tokens output.
  // asciiToU128("ALEO") = 1095648079, asciiToU128("ALEO") same for symbol.
  const raw = `{
    token_id: 5field,
    name: 1095517519u128,
    symbol: 1095517519u128,
    decimals: 6u8,
    supply: 1000000u128,
    max_supply: 999999999999u128,
    admin: aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc,
    external_authorization_required: false
  }`;

  it('parses name and symbol', () => {
    const info = parseTokenInfo(raw);
    expect(info.name).toBe('ALEO');
    expect(info.symbol).toBe('ALEO');
  });

  it('parses decimals', () => expect(parseTokenInfo(raw).decimals).toBe(6));
  it('parses totalSupply', () => expect(parseTokenInfo(raw).totalSupply).toBe(1_000_000n));
  it('parses maxSupply',   () => expect(parseTokenInfo(raw).maxSupply).toBe(999_999_999_999n));
  it('parses admin address', () => {
    expect(parseTokenInfo(raw).admin).toMatch(/^aleo1/);
  });
  it('parses externalAuthorizationRequired', () => {
    expect(parseTokenInfo(raw).externalAuthorizationRequired).toBe(false);
  });
});

describe('parseRawTokenBalance', () => {
  const raw = `{
    token_id: 5field,
    account: aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc,
    balance: 2000000u128,
    authorized_until: 0u32
  }`;

  it('parses amount',          () => expect(parseRawTokenBalance(raw).amount).toBe(2_000_000n));
  it('parses authorizedUntil', () => expect(parseRawTokenBalance(raw).authorizedUntil).toBe(0));
  it('parses account',         () => expect(parseRawTokenBalance(raw).account).toMatch(/^aleo1/));
});
