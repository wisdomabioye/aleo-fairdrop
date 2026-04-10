import { describe, it, expect, vi } from 'vitest';
import { createAbigen } from '../client';
import type { Abi } from '../abi';
import type { MappingFetcher } from '@fairdrop/types/primitives';
import type { WalletRecord } from '@fairdrop/types/primitives';

const abi: Abi = {
  program: 'test_v1.aleo',
  structs:  [],
  records: [
    {
      path: ['Ticket'],
      fields: [
        { name: 'owner',  ty: { Primitive: 'Address' } },
        { name: 'amount', ty: { Primitive: { UInt: 'U128' } } },
      ],
    },
  ],
  mappings: [
    { name: 'scores', key: { Primitive: 'Field' }, value: { Primitive: { UInt: 'U64' } } },
  ],
  functions: [
    {
      name:     'transfer',
      is_final: false,
      inputs: [
        { name: 'to',     ty: { Plaintext: { Primitive: 'Address' } },          mode: 'Public' },
        { name: 'amount', ty: { Plaintext: { Primitive: { UInt: 'U128' } } },   mode: 'Public' },
      ],
      outputs: [],
    },
  ],
};

const ADDR = 'aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc';

describe('createAbigen', () => {
  it('exposes transition as a callable with .build', () => {
    const client = createAbigen(abi, {});
    const transfer = client['transfer'] as { build: (a: unknown) => unknown };
    expect(typeof transfer).toBe('function');
    expect(typeof transfer.build).toBe('function');
  });

  it('.build() returns correct TransactionOptions', () => {
    const client = createAbigen(abi, { fee: 200_000 });
    const transfer = client['transfer'] as { build: (a: unknown) => Record<string, unknown> };
    const spec = transfer.build({ to: ADDR, amount: '500' });
    expect(spec['program']).toBe('test_v1.aleo');
    expect(spec['function']).toBe('transfer');
    expect(spec['inputs']).toEqual([ADDR, '500u128']);
    expect(spec['fee']).toBe(200_000);
  });

  it('attaches mapping reader when fetchMapping provided', async () => {
    const fetcher: MappingFetcher = { getMappingValue: vi.fn().mockResolvedValue('99u64') };
    const client = createAbigen(abi, { fetchMapping: fetcher });
    const scores = client['scores'] as (key: string) => Promise<unknown>;
    expect(typeof scores).toBe('function');
    expect(await scores('1field')).toBe('99');
  });

  it('omits mapping readers when fetchMapping not provided', () => {
    const client = createAbigen(abi, {});
    expect(client['scores']).toBeUndefined();
  });

  it('exposes records namespace with typed scanner', () => {
    const client  = createAbigen(abi, {});
    const records = client['records'] as Record<string, (e: WalletRecord[]) => unknown[]>;
    expect(typeof records['tickets']).toBe('function');
  });

  it('record scanner filters by record name', () => {
    const client  = createAbigen(abi, {});
    const records = client['records'] as Record<string, (e: WalletRecord[]) => unknown[]>;
    const fakeRecord: WalletRecord = {
      commitment: '0field', tag: '0field',
      recordName: 'Ticket',
      recordPlaintext: `{ owner: ${ADDR}, amount: 100u128 }`,
      recordCiphertext: '', programName: 'test_v1.aleo', owner: ADDR, spent: false,
      blockHeight: 0, blockTimestamp: 0, transactionId: '', functionName: '',
      outputIndex: 0, transitionId: '', transitionIndex: 0, transactionIndex: 0, sender: '',
    };
    const result = records['tickets']!([fakeRecord]) as Record<string, unknown>[];
    expect(result).toHaveLength(1);
    expect(result[0]!['amount']).toBe('100');
  });
});
