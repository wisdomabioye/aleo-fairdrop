import { useMemo } from 'react';
import { useWalletRecords } from '@/shared/hooks/useWalletRecords';
import { PROGRAMS } from '@fairdrop/config';
import { scanLpTokenRecords } from '@fairdrop/sdk/dex';
import type { WalletLpRecord } from '@fairdrop/types/primitives';

export function useLpTokenRecords(): { records: WalletLpRecord[]; loading: boolean } {
  const { entries, loading } = useWalletRecords(PROGRAMS.fairswap.programId);

  const records = useMemo<WalletLpRecord[]>(() => {
    return scanLpTokenRecords(entries).map((r) => ({
      id:       r._record,
      poolKey:  r.pool_key,
      amount:   BigInt(r.amount),
      spent:    r.spent,
      _record:  r._record,
    }));
  }, [entries]);

  return { records, loading };
}
