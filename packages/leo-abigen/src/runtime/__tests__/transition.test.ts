import { describe, it, expect, vi } from 'vitest';
import { createTransitionBuilder } from '../transition';
import type { AbiFunction } from '../abi';
import type { TransactionOptions } from '@provablehq/aleo-types';

const swapFn: AbiFunction = {
  name:     'swap',
  is_final: true,
  inputs: [
    { name: 'token_in_id',  ty: { Plaintext: { Primitive: 'Field' } },           mode: 'Public' },
    { name: 'token_out_id', ty: { Plaintext: { Primitive: 'Field' } },           mode: 'Public' },
    { name: 'amount_in',    ty: { Plaintext: { Primitive: { UInt: 'U128' } } },  mode: 'Public' },
    { name: 'min_out',      ty: { Plaintext: { Primitive: { UInt: 'U128' } } },  mode: 'Public' },
    { name: 'recipient',    ty: { Plaintext: { Primitive: 'Address' } },         mode: 'Public' },
  ],
  outputs: [],
};

const privateFn: AbiFunction = {
  name:     'add_liquidity_private',
  is_final: true,
  inputs: [
    { name: 'token_a_record', ty: { Record: { path: ['Token'], program: 'token_registry.aleo' } }, mode: 'None' },
    { name: 'token_b_record', ty: { Record: { path: ['Token'], program: 'token_registry.aleo' } }, mode: 'None' },
    { name: 'min_lp',         ty: { Plaintext: { Primitive: { UInt: 'U128' } } },                  mode: 'Public' },
  ],
  outputs: [],
};

const PROGRAM = 'fairswap_dex_v2.aleo';
const ADDR    = 'aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc';

describe('createTransitionBuilder — build()', () => {
  const handle = createTransitionBuilder(PROGRAM, swapFn, [], {
    fee: 300_000, privateFee: false,
  });

  it('returns correct program and function', () => {
    const spec = handle.build({ token_in_id: '1', token_out_id: '2', amount_in: '1000', min_out: '900', recipient: ADDR });
    expect(spec.program).toBe(PROGRAM);
    expect(spec.function).toBe('swap');
  });

  it('serializes all public inputs', () => {
    const spec = handle.build({ token_in_id: '1', token_out_id: '2', amount_in: '1000', min_out: '900', recipient: ADDR });
    expect(spec.inputs).toEqual(['1field', '2field', '1000u128', '900u128', ADDR]);
  });

  it('applies default fee', () => {
    const spec = handle.build({ token_in_id: '1', token_out_id: '2', amount_in: '1000', min_out: '900', recipient: ADDR });
    expect(spec.fee).toBe(300_000);
    expect(spec.privateFee).toBe(false);
  });

  it('overrides fee via opts', () => {
    const spec = handle.build(
      { token_in_id: '1', token_out_id: '2', amount_in: '1000', min_out: '900', recipient: ADDR },
      { fee: 500_000, privateFee: true },
    );
    expect(spec.fee).toBe(500_000);
    expect(spec.privateFee).toBe(true);
  });
});

describe('createTransitionBuilder — record inputs', () => {
  const handle = createTransitionBuilder(PROGRAM, privateFn, [], {
    fee: 300_000, privateFee: false,
  });

  it('passes record inputs through as-is (string)', () => {
    const spec = handle.build({
      token_a_record: '{ owner: aleo1qqq, ... }',
      token_b_record: '{ owner: aleo1qqq, ... }',
      min_lp: '500',
    });
    expect((spec.inputs as string[])[0]).toBe('{ owner: aleo1qqq, ... }');
    expect((spec.inputs as string[])[2]).toBe('500u128');
  });

  it('passes record inputs through as-is (object)', () => {
    const recordObj = { owner: ADDR, amount: '100u128' };
    const spec = handle.build({
      token_a_record: recordObj,
      token_b_record: '{ owner: aleo1qqq }',
      min_lp: '100',
    });
    expect((spec.inputs as unknown[])[0]).toEqual(recordObj);
  });
});

describe('createTransitionBuilder — executor mode', () => {
  it('throws without executeTransaction', async () => {
    const handle = createTransitionBuilder(PROGRAM, swapFn, [], {
      fee: 300_000, privateFee: false,
    });
    await expect(
      handle({ token_in_id: '1', token_out_id: '2', amount_in: '1000', min_out: '900', recipient: ADDR }),
    ).rejects.toThrow('executor mode requires');
  });

  it('calls executeTransaction and returns transactionId', async () => {
    const execFn = vi.fn().mockResolvedValue({ transactionId: 'at1abc' });
    const handle = createTransitionBuilder(PROGRAM, swapFn, [], {
      fee: 300_000, privateFee: false, executeTransaction: execFn,
    });
    const txId = await handle({ token_in_id: '1', token_out_id: '2', amount_in: '1000', min_out: '900', recipient: ADDR });
    expect(txId).toBe('at1abc');
    expect(execFn).toHaveBeenCalledOnce();
  });

  it('throws when executeTransaction returns undefined', async () => {
    const execFn = vi.fn().mockResolvedValue(undefined);
    const handle = createTransitionBuilder(PROGRAM, swapFn, [], {
      fee: 300_000, privateFee: false, executeTransaction: execFn,
    });
    await expect(
      handle({ token_in_id: '1', token_out_id: '2', amount_in: '1000', min_out: '900', recipient: ADDR }),
    ).rejects.toThrow('executeTransaction returned undefined');
  });
});

describe('createTransitionBuilder — .build is a property on the callable', () => {
  it('.build exists and is callable', () => {
    const handle = createTransitionBuilder(PROGRAM, swapFn, [], { fee: 300_000, privateFee: false });
    expect(typeof handle.build).toBe('function');
    const spec: TransactionOptions = handle.build({ token_in_id: '1', token_out_id: '2', amount_in: '1', min_out: '1', recipient: ADDR });
    expect(spec).toHaveProperty('program');
  });
});
