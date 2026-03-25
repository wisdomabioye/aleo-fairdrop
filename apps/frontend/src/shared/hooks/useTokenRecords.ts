import { useMemo } from 'react';
import { parsePlaintext, parseU128, u128ToBigInt, parseU32, parseBool, stripVisibility } from '@fairdrop/sdk/parse';
import { SYSTEM_PROGRAMS } from '@fairdrop/sdk/constants';
import type { WalletTokenRecord } from '@fairdrop/types/primitives';
import { useWalletRecords } from './useWalletRecords';

interface Options {
  pollInterval?:  number;
  fetchOnMount?:  boolean;
}

/** Fetches token_registry.aleo Token records owned by the connected wallet. */
export function useTokenRecords(opts: Options = {}) {
  const { entries, loading, fetchRecords } = useWalletRecords(SYSTEM_PROGRAMS.tokenRegistry, opts);

  const tokenRecords = useMemo<WalletTokenRecord[]>(() => {
    const result: WalletTokenRecord[] = [];
    for (const entry of entries) {
      if (entry.recordName !== 'Token') continue;
      try {
        const fields = parsePlaintext(entry.recordPlaintext);
        result.push({
          id:                              entry.commitment,
          token_id:                        stripVisibility(fields['token_id']), // preserve the 'field' suffix
          amount:                          u128ToBigInt(parseU128(fields['amount'] ?? '0u128')),
          external_authorization_required: parseBool(fields['external_authorization_required'] ?? 'false'),
          authorized_until:                parseU32(fields['authorized_until'] ?? '0u32'),
          spent:                           entry.spent,
          _record:                         entry.recordPlaintext,
        });
      } catch { /* skip malformed */ }
    }
    return result;
  }, [entries]);

  return { tokenRecords, loading, fetchRecords };
}
