import { describe, it, expect, vi } from 'vitest';
import { fromAleoClient } from '../adapters';

function makeClient(returnValue: string | null, throws = false) {
  return {
    getProgramMappingValue: vi.fn(async () => {
      if (throws) throw new Error('not found');
      return returnValue as string;
    }),
  };
}

describe('fromAleoClient', () => {
  it('returns the string value when client resolves', async () => {
    const fetcher = fromAleoClient(makeClient('42u128'));
    expect(await fetcher.getMappingValue('prog.aleo', 'balances', '1field')).toBe('42u128');
  });

  it('returns null when client throws (key not found)', async () => {
    const fetcher = fromAleoClient(makeClient(null, true));
    expect(await fetcher.getMappingValue('prog.aleo', 'balances', '1field')).toBeNull();
  });

  it('returns null when client returns empty string', async () => {
    const fetcher = fromAleoClient(makeClient(''));
    expect(await fetcher.getMappingValue('prog.aleo', 'balances', '1field')).toBeNull();
  });

  it('passes through programId, mapping, key correctly', async () => {
    const client  = makeClient('1u8');
    const fetcher = fromAleoClient(client);
    await fetcher.getMappingValue('myprog.aleo', 'votes', '5field');
    expect(client.getProgramMappingValue).toHaveBeenCalledWith('myprog.aleo', 'votes', '5field');
  });
});
