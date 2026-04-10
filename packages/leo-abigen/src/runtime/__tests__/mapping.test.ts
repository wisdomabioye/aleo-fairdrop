import { describe, it, expect, vi } from 'vitest';
import { createMappingReader } from '../mapping';
import type { AbiMapping } from '../abi';
import type { MappingFetcher } from '@fairdrop/types/primitives';

const u128Mapping: AbiMapping = {
  name:  'balances',
  key:   { Primitive: 'Field' },
  value: { Primitive: { UInt: 'U128' } },
};

const boolMapping: AbiMapping = {
  name:  'paused',
  key:   { Primitive: { UInt: 'U8' } },
  value: { Primitive: 'Boolean' },
};

function makeFetcher(returnValue: string | null): MappingFetcher {
  return { getMappingValue: vi.fn().mockResolvedValue(returnValue) };
}

describe('createMappingReader', () => {
  it('returns null when fetcher returns null (key not found)', async () => {
    const reader = createMappingReader(makeFetcher(null), 'test.aleo', u128Mapping, []);
    expect(await reader('1field')).toBeNull();
  });

  it('deserializes U128 value as string brand', async () => {
    const reader = createMappingReader(makeFetcher('1000000u128'), 'test.aleo', u128Mapping, []);
    expect(await reader('1field')).toBe('1000000');
  });

  it('deserializes Boolean value', async () => {
    const reader = createMappingReader(makeFetcher('true'), 'test.aleo', boolMapping, []);
    expect(await reader('0u8')).toBe(true);
  });

  it('passes programId, mapping name and key to fetcher', async () => {
    const fetcher = makeFetcher('42u128');
    const reader  = createMappingReader(fetcher, 'myprog.aleo', u128Mapping, []);
    await reader('99field');
    expect(fetcher.getMappingValue).toHaveBeenCalledWith('myprog.aleo', 'balances', '99field');
  });

  it('handles visibility suffix on returned value', async () => {
    const reader = createMappingReader(makeFetcher('1000u128.public'), 'test.aleo', u128Mapping, []);
    expect(await reader('1field')).toBe('1000');
  });
});
