import { useMemo } from 'react';
import { parsePlaintext, stripVisibility } from '@fairdrop/sdk/parse';
import { SYSTEM_PROGRAMS } from '@fairdrop/sdk/constants';
import type { WalletCreditRecord } from '@fairdrop/types/primitives';
import { useWalletRecords } from './useWalletRecords';

interface Options {
  pollInterval?:  number;
  fetchOnMount?:  boolean;
}

/** Fetches credits.aleo private credits records owned by the connected wallet. */
export function useCreditRecords(opts: Options = {}) {
  const { entries, loading, fetchRecords } = useWalletRecords(SYSTEM_PROGRAMS.credits, opts);

  const creditRecords = useMemo<WalletCreditRecord[]>(() => {
    const result: WalletCreditRecord[] = [];
    for (const entry of entries) {
      if (entry.recordName !== 'credits') continue;
      try {
        const fields = parsePlaintext(entry.recordPlaintext);
        const raw = stripVisibility(fields['microcredits'] ?? '0u64').replace(/u64$/, '');
        result.push({
          id:           entry.commitment,
          microcredits: BigInt(raw),
          spent:        entry.spent,
          _record:      entry.recordPlaintext,
        });
      } catch { /* skip malformed */ }
    }
    return result;
  }, [entries]);

  return { creditRecords, loading, fetchRecords };
}
