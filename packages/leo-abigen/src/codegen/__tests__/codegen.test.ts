import { describe, it, expect } from 'vitest';
import { generateTypes } from '../index';
import { emitStructs }   from '../structs';
import { emitRecords }   from '../records';
import { emitTransitions } from '../transitions';
import { emitClientInterface, emitFactory } from '../client';
import type { Abi, AbiStruct, AbiRecord, AbiFunction } from '../../runtime/abi';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const poolStateStruct: AbiStruct = {
  path: ['PoolState'],
  fields: [
    { name: 'reserve_a', ty: { Primitive: { UInt: 'U128' } } },
    { name: 'reserve_b', ty: { Primitive: { UInt: 'U128' } } },
    { name: 'fee_bps',   ty: { Primitive: { UInt: 'U16' } } },
  ],
};

const lpTokenRecord: AbiRecord = {
  path: ['LpToken'],
  fields: [
    { name: 'owner',    ty: { Primitive: 'Address' } },
    { name: 'pool_key', ty: { Primitive: 'Field' } },
    { name: 'amount',   ty: { Primitive: { UInt: 'U128' } } },
  ],
};

const swapFn: AbiFunction = {
  name:     'swap',
  is_final: true,
  inputs: [
    { name: 'token_in_id', ty: { Plaintext: { Primitive: 'Field' } },          mode: 'Public' },
    { name: 'amount_in',   ty: { Plaintext: { Primitive: { UInt: 'U128' } } }, mode: 'Public' },
    { name: 'recipient',   ty: { Plaintext: { Primitive: 'Address' } },        mode: 'Public' },
  ],
  outputs: [],
};

const privateFn: AbiFunction = {
  name:     'add_liquidity_private',
  is_final: true,
  inputs: [
    { name: 'token_record', ty: { Record: { path: ['Token'], program: 'token_registry.aleo' } }, mode: 'None' },
    { name: 'min_lp',       ty: { Plaintext: { Primitive: { UInt: 'U128' } } },                  mode: 'Public' },
  ],
  outputs: [],
};

const minimalAbi: Abi = {
  program:   'my_contract_v1.aleo',
  structs:   [poolStateStruct],
  records:   [lpTokenRecord],
  mappings:  [{ name: 'pool_states', key: { Primitive: 'Field' }, value: { Struct: { path: ['PoolState'], program: 'my_contract_v1.aleo' } } }],
  functions: [swapFn, privateFn],
};

// ── emitStructs ───────────────────────────────────────────────────────────────

describe('emitStructs', () => {
  it('emits a TypeScript interface for each struct', () => {
    const out = emitStructs([poolStateStruct]);
    expect(out).toContain('export interface PoolState {');
    expect(out).toContain('reserve_a: U128;');
    expect(out).toContain('reserve_b: U128;');
    expect(out).toContain('fee_bps: number;');
  });

  it('returns empty string for no structs', () => {
    expect(emitStructs([])).toBe('');
  });
});

// ── emitRecords ───────────────────────────────────────────────────────────────

describe('emitRecords', () => {
  it('emits a TypeScript interface with spent and _record fields', () => {
    const out = emitRecords([lpTokenRecord], []);
    expect(out).toContain('export interface LpTokenRecord {');
    expect(out).toContain('owner: Address;');
    expect(out).toContain('pool_key: Field;');
    expect(out).toContain('amount: U128;');
    expect(out).toContain('spent:');
    expect(out).toContain('_record:');
  });

  it('emits the createRecordScanner call', () => {
    const out = emitRecords([lpTokenRecord], []);
    expect(out).toContain('createRecordScanner(');
  });

  it('emits the scan function with correct name', () => {
    const out = emitRecords([lpTokenRecord], []);
    expect(out).toContain('export function scanLpTokenRecords(');
    expect(out).toContain('): LpTokenRecord[]');
  });

  it('uses path last segment not full path', () => {
    const record: AbiRecord = { path: ['ns', 'MyRecord'], fields: [] };
    const out = emitRecords([record], []);
    expect(out).toContain('export interface MyRecordRecord {');
    expect(out).toContain('export function scanMyRecordRecords(');
  });

  it('returns empty string for no records', () => {
    expect(emitRecords([], [])).toBe('');
  });
});

// ── emitTransitions ───────────────────────────────────────────────────────────

describe('emitTransitions', () => {
  it('emits Args interface for each function', () => {
    const out = emitTransitions([swapFn]);
    expect(out).toContain('export interface SwapArgs {');
    expect(out).toContain('token_in_id: Field;');
    expect(out).toContain('amount_in: U128;');
    expect(out).toContain('recipient: Address;');
  });

  it('uses snake_case field names as-is', () => {
    const out = emitTransitions([swapFn]);
    expect(out).toContain('token_in_id:');
  });

  it('emits record inputs as string | Record<string, unknown>', () => {
    const out = emitTransitions([privateFn]);
    expect(out).toContain('token_record: string | Record<string, unknown>;');
  });

  it('emits PascalCase Args type from snake_case fn name', () => {
    const out = emitTransitions([privateFn]);
    expect(out).toContain('export interface AddLiquidityPrivateArgs {');
  });

  it('returns empty string for no functions', () => {
    expect(emitTransitions([])).toBe('');
  });
});

// ── emitClientInterface ───────────────────────────────────────────────────────

describe('emitClientInterface', () => {
  it('derives client name from program id', () => {
    const out = emitClientInterface(minimalAbi);
    expect(out).toContain('export interface MyContractV1 {');
  });

  it('emits camelCase transition method names', () => {
    const out = emitClientInterface(minimalAbi);
    expect(out).toContain('swap: TransitionHandle<SwapArgs>;');
    expect(out).toContain('addLiquidityPrivate: TransitionHandle<AddLiquidityPrivateArgs>;');
  });

  it('emits camelCase mapping method names', () => {
    const out = emitClientInterface(minimalAbi);
    expect(out).toContain('poolStates(key: string)');
  });

  it('emits records block with camelCase + s scanner names', () => {
    const out = emitClientInterface(minimalAbi);
    expect(out).toContain('lpTokens(entries: WalletRecord[])');
  });
});

// ── emitFactory ───────────────────────────────────────────────────────────────

describe('emitFactory', () => {
  it('derives factory name from program id', () => {
    const out = emitFactory(minimalAbi);
    expect(out).toContain('export function createMyContractV1(');
  });

  it('accepts optional ClientConfig', () => {
    const out = emitFactory(minimalAbi);
    expect(out).toContain('config?: ClientConfig');
  });

  it('returns the correct client type', () => {
    const out = emitFactory(minimalAbi);
    expect(out).toContain('): MyContractV1 {');
  });

  it('calls createAbigen with embedded _abi', () => {
    const out = emitFactory(minimalAbi);
    expect(out).toContain('return createAbigen(_abi, config ?? {}) as MyContractV1;');
  });
});

// ── generateTypes — minified ABI ─────────────────────────────────────────────

describe('generateTypes — minified ABI input', () => {
  it('handles a single-line compressed ABI (JSON.parse is format-agnostic)', () => {
    // Minify the ABI to a single line, parse it, and verify output is identical
    const minified = JSON.stringify(minimalAbi);         // single-line JSON
    const parsed   = JSON.parse(minified) as typeof minimalAbi;
    const out      = generateTypes(parsed);
    expect(out).toContain('export interface MyContractV1 {');
    expect(out).toContain('export interface SwapArgs {');
    expect(out).toContain('export interface LpTokenRecord {');
  });
});

// ── generateTypes (integration) ───────────────────────────────────────────────

describe('generateTypes', () => {
  it('produces valid-looking TypeScript source', () => {
    const out = generateTypes(minimalAbi);
    expect(out).toContain('// auto-generated by leo-abigen');
    expect(out).toContain('my_contract_v1.aleo');
  });

  it('includes @fairdrop/leo-abigen import', () => {
    const out = generateTypes(minimalAbi);
    expect(out).toContain('@fairdrop/leo-abigen');
  });

  it('includes @fairdrop/types/primitives import', () => {
    const out = generateTypes(minimalAbi);
    expect(out).toContain('@fairdrop/types/primitives');
  });

  it('includes used branded primitive types in import', () => {
    const out = generateTypes(minimalAbi);
    expect(out).toContain('Field');
    expect(out).toContain('Address');
    expect(out).toContain('U128');
  });

  it('contains all sections in order', () => {
    const out = generateTypes(minimalAbi);
    const structIdx     = out.indexOf('PoolState');
    const recordIdx     = out.indexOf('LpTokenRecord');
    const transitionIdx = out.indexOf('SwapArgs');
    const clientIdx     = out.indexOf('MyContractV1');
    expect(structIdx).toBeLessThan(recordIdx);
    expect(recordIdx).toBeLessThan(transitionIdx);
    expect(transitionIdx).toBeLessThan(clientIdx);
  });

  it('embeds the ABI as a const', () => {
    const out = generateTypes(minimalAbi);
    expect(out).toContain("const _abi: Abi = JSON.parse('");
    expect(out).toContain('my_contract_v1.aleo');
  });

  it('imports createAbigen from @fairdrop/leo-abigen', () => {
    const out = generateTypes(minimalAbi);
    expect(out).toContain('import { createAbigen');
  });

  it('imports ClientConfig type from @fairdrop/leo-abigen', () => {
    const out = generateTypes(minimalAbi);
    expect(out).toContain('ClientConfig');
  });

  it('emits a typed factory function', () => {
    const out = generateTypes(minimalAbi);
    expect(out).toContain('export function createMyContractV1(config?: ClientConfig): MyContractV1 {');
    expect(out).toContain('return createAbigen(_abi, config ?? {}) as MyContractV1;');
  });

  it('factory function appears after the client interface', () => {
    const out = generateTypes(minimalAbi);
    const clientIdx  = out.indexOf('export interface MyContractV1 {');
    const factoryIdx = out.indexOf('export function createMyContractV1(');
    expect(clientIdx).toBeGreaterThanOrEqual(0);
    expect(factoryIdx).toBeGreaterThan(clientIdx);
  });
});
