import { describe, it, expect } from 'vitest';
import {
  stripSuffix,
  stripVisibility,
  parsePlaintext,
  parseBool,
  parseU8,
  parseU32,
  parseU64,
  parseU128,
  u128ToBigInt,
  parseAddress,
  parseField,
  isValidField,
  fieldToHex,
  parseStruct,
  recStr,
  recField,
  recU128,
  recU32,
  hasRecordKey,
} from './leo';

describe('stripSuffix', () => {
  it('removes u128 suffix', () => expect(stripSuffix('1500000u128')).toBe('1500000'));
  it('removes field suffix', () => expect(stripSuffix('42field')).toBe('42'));
  it('removes u8 suffix',   () => expect(stripSuffix('255u8')).toBe('255'));
  it('removes i64 suffix',  () => expect(stripSuffix('-1i64')).toBe('-1'));
  it('handles no suffix',   () => expect(stripSuffix('aleo1abc')).toBe('aleo1abc'));
  it('handles null',        () => expect(stripSuffix(null)).toBe(''));
  it('handles undefined',   () => expect(stripSuffix(undefined)).toBe(''));
});

describe('stripVisibility', () => {
  it('removes .private', () => expect(stripVisibility('100u128.private')).toBe('100u128'));
  it('removes .public',  () => expect(stripVisibility('100u128.public')).toBe('100u128'));
  it('leaves plain value', () => expect(stripVisibility('100u128')).toBe('100u128'));
  it('handles null',       () => expect(stripVisibility(null)).toBe(''));
});

describe('parsePlaintext', () => {
  it('parses a flat struct', () => {
    const r = parsePlaintext('{ owner: aleo1abc, amount: 100u128 }');
    expect(r['owner']).toBe('aleo1abc');
    expect(r['amount']).toBe('100u128');
  });

  it('parses a record with visibility suffixes', () => {
    const r = parsePlaintext('{ auction_id: 7field.private, quantity: 500u128.private }');
    expect(r['auction_id']).toBe('7field.private');
    expect(r['quantity']).toBe('500u128.private');
  });
});

describe('parseBool', () => {
  it('parses true',          () => expect(parseBool('true')).toBe(true));
  it('parses false',         () => expect(parseBool('false')).toBe(false));
  it('strips .private',      () => expect(parseBool('true.private')).toBe(true));
});

describe('parseU8 / parseU32', () => {
  it('parseU8',  () => expect(parseU8('255u8')).toBe(255));
  it('parseU32', () => expect(parseU32('1000000u32')).toBe(1_000_000));
  it('strips visibility', () => expect(parseU32('42u32.public')).toBe(42));
});

describe('parseU64', () => {
  it('returns bigint',               () => expect(parseU64('18446744073709551615u64')).toBe(18446744073709551615n));
  it('handles small values',         () => expect(parseU64('0u64')).toBe(0n));
  it('strips visibility',            () => expect(parseU64('100u64.private')).toBe(100n));
});

describe('parseU128 + u128ToBigInt', () => {
  it('returns stripped string',      () => expect(parseU128('1500000u128')).toBe('1500000'));
  it('u128ToBigInt converts',        () => expect(u128ToBigInt('1500000')).toBe(1_500_000n));
});

describe('parseAddress', () => {
  it('strips visibility',  () => expect(parseAddress('aleo1abc.private')).toBe('aleo1abc'));
  it('passes through',     () => expect(parseAddress('aleo1xyz')).toBe('aleo1xyz'));
});

describe('parseField', () => {
  it('strips field suffix',      () => expect(parseField('42field')).toBe('42'));
  it('strips field + .private',  () => expect(parseField('42field.private')).toBe('42'));
});

describe('isValidField', () => {
  it('accepts valid field',   () => expect(isValidField('123456field')).toBe(true));
  it('rejects no suffix',     () => expect(isValidField('123456')).toBe(false));
  it('rejects empty string',  () => expect(isValidField('')).toBe(false));
  it('rejects alpha prefix',  () => expect(isValidField('abcfield')).toBe(false));
});

describe('fieldToHex', () => {
  it('converts 255field → 0xff', () => expect(fieldToHex('255field')).toBe('0xff'));
  it('converts 0field → 0x0',    () => expect(fieldToHex('0field')).toBe('0x0'));
});

describe('parseStruct', () => {
  it('parses a flat struct', () => {
    const r = parseStruct('{ a: 1u64, b: 2u128 }');
    expect(r['a']).toBe('1u64');
    expect(r['b']).toBe('2u128');
  });

  it('parses a struct with an address', () => {
    const r = parseStruct('{ admin: aleo1abc, token_id: 5field }');
    expect(r['admin']).toBe('aleo1abc');
    expect(r['token_id']).toBe('5field');
  });

  it('preserves nested struct as raw string', () => {
    const r = parseStruct('{ outer: 1u8, inner: { x: 2u8, y: 3u8 } }');
    expect(r['outer']).toBe('1u8');
    expect(r['inner']).toBe('{ x: 2u8, y: 3u8 }');
  });

  it('throws on non-struct input', () => {
    expect(() => parseStruct('not a struct')).toThrow();
  });
});

describe('record helpers (recStr / recField / recU128 / recU32 / hasRecordKey)', () => {
  const withData    = { data: { amount: '500u128', id: '7field', count: '3u32' } };
  const withoutData = { amount: '500u128', id: '7field', count: '3u32' };

  it('recStr reads from .data',    () => expect(recStr(withData, 'amount')).toBe('500u128'));
  it('recStr reads flat record',   () => expect(recStr(withoutData, 'amount')).toBe('500u128'));
  it('recStr returns "" on miss',  () => expect(recStr(withData, 'missing')).toBe(''));

  it('recField appends field suffix', () => expect(recField(withData, 'id')).toBe('7field'));

  it('recU128 parses bigint',       () => expect(recU128(withData, 'amount')).toBe(500n));
  it('recU128 returns 0n on miss',  () => expect(recU128(withData, 'missing')).toBe(0n));

  it('recU32 parses number',        () => expect(recU32(withData, 'count')).toBe(3));
  it('recU32 returns 0 on miss',    () => expect(recU32(withData, 'missing')).toBe(0));

  it('hasRecordKey true',           () => expect(hasRecordKey(withData, 'amount')).toBe(true));
  it('hasRecordKey false on miss',  () => expect(hasRecordKey(withData, 'nope')).toBe(false));
});
