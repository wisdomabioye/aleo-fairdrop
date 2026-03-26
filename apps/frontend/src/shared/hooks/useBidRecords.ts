import { useMemo } from 'react';
import { parsePlaintext, parseU128, u128ToBigInt } from '@fairdrop/sdk/parse';
import type { WalletBidRecord } from '@fairdrop/types/primitives';
import { useWalletRecords } from './useWalletRecords';

interface Options {
  pollInterval?:  number;
  fetchOnMount?:  boolean;
}

/**
 * Fetches Bid records for one auction program owned by the connected wallet.
 *
 * @param programId - Auction program to fetch from (e.g. "fairdrop_dutch_v1.aleo")
 */
export function useBidRecords(programId: string, opts: Options = {}) {
  const { entries, loading, fetchRecords } = useWalletRecords(programId, opts);

  const bidRecords = useMemo<WalletBidRecord[]>(() => {
    const result: WalletBidRecord[] = [];
    for (const entry of entries) {
      if (entry.recordName !== 'Bid') continue;
      try {
        const fields = parsePlaintext(entry.recordPlaintext);
        result.push({
          id:             entry.commitment,
          programId,
          auction_id:     fields['auction_id'],
          quantity:       u128ToBigInt(parseU128(fields['quantity']       ?? '0u128')),
          payment_amount: u128ToBigInt(parseU128(fields['payment_amount'] ?? '0u128')),
          spent:          entry.spent,
          _record:        entry.recordPlaintext,
        });
      } catch { /* skip malformed */ }
    }
    return result;
  }, [entries, programId]);

  return { bidRecords, loading, fetchRecords };
}
