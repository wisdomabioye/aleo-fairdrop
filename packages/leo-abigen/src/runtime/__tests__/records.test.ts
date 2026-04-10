import { describe, it, expect } from 'vitest';
import { createRecordScanner } from '../records';
import type { AbiRecord, AbiStruct } from '../abi';
import type { WalletRecord } from '@fairdrop/types/primitives';

const lpTokenRecord: AbiRecord = {
  path: ['LpToken'],
  fields: [
    { name: 'owner',    ty: { Primitive: 'Address' } },
    { name: 'pool_key', ty: { Primitive: 'Field' } },
    { name: 'amount',   ty: { Primitive: { UInt: 'U128' } } },
  ],
};

const structs: AbiStruct[] = [];

function makeWalletRecord(
  recordName: string,
  plaintext: string,
  spent = false,
): WalletRecord {
  return {
    commitment:       '0field',
    tag:              '0field',
    recordName,
    recordPlaintext:  plaintext,
    recordCiphertext: '',
    programName:      'test.aleo',
    owner:            'aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc',
    spent,
    blockHeight:      0,
    blockTimestamp:   0,
    transactionId:    '',
    functionName:     '',
    outputIndex:      0,
    transitionId:     '',
    transitionIndex:  0,
    transactionIndex: 0,
    sender:           '',
  };
}

describe('createRecordScanner', () => {
  const scan = createRecordScanner(lpTokenRecord, structs);

  it('returns empty array when no matching records', () => {
    const entries = [makeWalletRecord('Token', '{ owner: aleo1qqq, pool_key: 1field, amount: 100u128 }')];
    expect(scan(entries)).toEqual([]);
  });

  it('filters by recordName using path last segment', () => {
    const match    = makeWalletRecord('LpToken', '{ owner: aleo1qqq, pool_key: 1field, amount: 100u128 }');
    const mismatch = makeWalletRecord('Token',   '{ owner: aleo1qqq, pool_key: 2field, amount: 200u128 }');
    const result   = scan([match, mismatch]);
    expect(result).toHaveLength(1);
  });

  it('deserializes fields correctly', () => {
    const addr = 'aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc';
    const plaintext = `{ owner: ${addr}, pool_key: 42field, amount: 1000000u128 }`;
    const result = scan([makeWalletRecord('LpToken', plaintext)]) as Record<string, unknown>[];
    expect(result[0]!['owner']).toBe(addr);
    expect(result[0]!['pool_key']).toBe('42');
    expect(result[0]!['amount']).toBe('1000000');
  });

  it('includes spent and _record on each entry', () => {
    const plaintext = '{ owner: aleo1qqq, pool_key: 1field, amount: 100u128 }';
    const result = scan([makeWalletRecord('LpToken', plaintext, true)]) as Record<string, unknown>[];
    expect(result[0]!['spent']).toBe(true);
    expect(result[0]!['_record']).toBe(plaintext);
  });

  it('handles multiple matching records', () => {
    const entries = [
      makeWalletRecord('LpToken', '{ owner: aleo1qqq, pool_key: 1field, amount: 100u128 }'),
      makeWalletRecord('LpToken', '{ owner: aleo1qqq, pool_key: 2field, amount: 200u128 }'),
    ];
    expect(scan(entries)).toHaveLength(2);
  });

  it('returns empty array for empty input', () => {
    expect(scan([])).toEqual([]);
  });
});
