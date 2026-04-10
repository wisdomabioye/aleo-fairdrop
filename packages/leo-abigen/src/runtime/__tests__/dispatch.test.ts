import { describe, it, expect } from 'vitest';
import { serializeInput, deserializeOutput, parseStruct } from '../dispatch';
import type { AleoPlaintext, AleoInputType, AbiStruct } from '../abi';

// ── Shared fixtures ───────────────────────────────────────────────────────────

const pointStruct: AbiStruct = {
  path: ['Point'],
  fields: [
    { name: 'x', ty: { Primitive: { UInt: 'U64' } } },
    { name: 'y', ty: { Primitive: { UInt: 'U64' } } },
  ],
};

const nestedStruct: AbiStruct = {
  path: ['Wrapper'],
  fields: [
    { name: 'inner', ty: { Struct: { path: ['Point'], program: 'test.aleo' } } },
    { name: 'flag',  ty: { Primitive: 'Boolean' } },
  ],
};

const structs = [pointStruct, nestedStruct];

// ── parseStruct ───────────────────────────────────────────────────────────────

describe('parseStruct', () => {
  it('parses a flat struct', () => {
    expect(parseStruct('{ a: 1u64, b: 2u64 }')).toEqual({ a: '1u64', b: '2u64' });
  });

  it('parses a struct with a nested struct value', () => {
    const result = parseStruct('{ inner: { x: 1u64, y: 2u64 }, flag: true }');
    expect(result).toEqual({ inner: '{ x: 1u64, y: 2u64 }', flag: 'true' });
  });

  it('parses a single-field struct', () => {
    expect(parseStruct('{ amount: 1000u128 }')).toEqual({ amount: '1000u128' });
  });

  it('trims field values', () => {
    expect(parseStruct('{ a:  42u32  }')).toEqual({ a: '42u32' });
  });

  it('throws when input is not a struct literal', () => {
    expect(() => parseStruct('42u128')).toThrow('expected struct literal');
  });

  it('handles empty struct body', () => {
    expect(parseStruct('{  }')).toEqual({});
  });
});

// ── serializeInput ────────────────────────────────────────────────────────────

describe('serializeInput', () => {
  const pub = (ty: AleoPlaintext): AleoInputType => ({ Plaintext: ty });

  it('serializes Public Field — strips existing suffix', () => {
    expect(serializeInput('3443', pub({ Primitive: 'Field' }), [])).toBe('3443field');
  });

  it('serializes Public Field — preserves existing suffix', () => {
    expect(serializeInput('3443field', pub({ Primitive: 'Field' }), [])).toBe('3443field');
  });

  it('serializes Public Address — identity', () => {
    const addr = 'aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc';
    expect(serializeInput(addr, pub({ Primitive: 'Address' }), [])).toBe(addr);
  });

  it('serializes Public Boolean true', () => {
    expect(serializeInput(true,  pub({ Primitive: 'Boolean' }), [])).toBe('true');
    expect(serializeInput(false, pub({ Primitive: 'Boolean' }), [])).toBe('false');
  });

  it('serializes Public U128', () => {
    expect(serializeInput('1000000', pub({ Primitive: { UInt: 'U128' } }), [])).toBe('1000000u128');
  });

  it('serializes Public U64', () => {
    expect(serializeInput('42', pub({ Primitive: { UInt: 'U64' } }), [])).toBe('42u64');
  });

  it('serializes Public U32', () => {
    expect(serializeInput(100, pub({ Primitive: { UInt: 'U32' } }), [])).toBe('100u32');
  });

  it('serializes Public U16', () => {
    expect(serializeInput(30, pub({ Primitive: { UInt: 'U16' } }), [])).toBe('30u16');
  });

  it('serializes Public U8', () => {
    expect(serializeInput(5, pub({ Primitive: { UInt: 'U8' } }), [])).toBe('5u8');
  });

  it('serializes a flat Struct', () => {
    const ty: AleoInputType = { Plaintext: { Struct: { path: ['Point'], program: 'test.aleo' } } };
    expect(serializeInput({ x: '1', y: '2' }, ty, structs)).toBe('{ x: 1u64, y: 2u64 }');
  });

  it('serializes a nested Struct', () => {
    const ty: AleoInputType = { Plaintext: { Struct: { path: ['Wrapper'], program: 'test.aleo' } } };
    const value = { inner: { x: '3', y: '4' }, flag: true };
    expect(serializeInput(value, ty, structs)).toBe('{ inner: { x: 3u64, y: 4u64 }, flag: true }');
  });

  it('throws on Final type', () => {
    expect(() => serializeInput(null, 'Final', [])).toThrow('cannot serialize Final type');
  });

  it('throws on Record type', () => {
    const ty: AleoInputType = { Record: { path: ['Token'], program: 'token_registry.aleo' } };
    expect(() => serializeInput(null, ty, [])).toThrow('record inputs pass through as-is');
  });
});

// ── deserializeOutput ─────────────────────────────────────────────────────────

describe('deserializeOutput', () => {
  it('deserializes Field — strips suffix', () => {
    expect(deserializeOutput('3443field', { Primitive: 'Field' }, [])).toBe('3443');
  });

  it('deserializes Field with visibility suffix', () => {
    expect(deserializeOutput('3443field.private', { Primitive: 'Field' }, [])).toBe('3443');
  });

  it('deserializes Address — identity', () => {
    const addr = 'aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc';
    expect(deserializeOutput(addr, { Primitive: 'Address' }, [])).toBe(addr);
  });

  it('deserializes Boolean true', () => {
    expect(deserializeOutput('true',  { Primitive: 'Boolean' }, [])).toBe(true);
    expect(deserializeOutput('false', { Primitive: 'Boolean' }, [])).toBe(false);
  });

  it('deserializes U128 as string brand', () => {
    expect(deserializeOutput('1000000u128', { Primitive: { UInt: 'U128' } }, [])).toBe('1000000');
  });

  it('deserializes U64 as string brand', () => {
    expect(deserializeOutput('42u64', { Primitive: { UInt: 'U64' } }, [])).toBe('42');
  });

  it('deserializes U32 as number', () => {
    expect(deserializeOutput('100u32', { Primitive: { UInt: 'U32' } }, [])).toBe(100);
  });

  it('deserializes U16 as number', () => {
    expect(deserializeOutput('30u16', { Primitive: { UInt: 'U16' } }, [])).toBe(30);
  });

  it('deserializes U8 as number', () => {
    expect(deserializeOutput('5u8', { Primitive: { UInt: 'U8' } }, [])).toBe(5);
  });

  it('deserializes a flat Struct', () => {
    const ty: AleoPlaintext = { Struct: { path: ['Point'], program: 'test.aleo' } };
    const result = deserializeOutput('{ x: 1u64, y: 2u64 }', ty, structs);
    expect(result).toEqual({ x: '1', y: '2' });
  });

  it('deserializes a nested Struct', () => {
    const ty: AleoPlaintext = { Struct: { path: ['Wrapper'], program: 'test.aleo' } };
    const result = deserializeOutput('{ inner: { x: 3u64, y: 4u64 }, flag: true }', ty, structs);
    expect(result).toEqual({ inner: { x: '3', y: '4' }, flag: true });
  });

  it('throws on unknown struct', () => {
    const ty: AleoPlaintext = { Struct: { path: ['Unknown'], program: 'test.aleo' } };
    expect(() => deserializeOutput('{ a: 1u64 }', ty, [])).toThrow('unknown struct: Unknown');
  });
});
