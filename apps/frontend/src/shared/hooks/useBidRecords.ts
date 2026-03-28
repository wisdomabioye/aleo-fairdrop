import { useMemo } from 'react';
import { parsePlaintext, parseU128, u128ToBigInt } from '@fairdrop/sdk/parse';
import type { WalletBidRecord } from '@fairdrop/types/primitives';
import { useWalletRecords } from './useWalletRecords';

interface Options {
  /** Filter records to a specific auction. */
  auctionId?:    string;
  pollInterval?: number;
  fetchOnMount?: boolean;
}

/**
 * Fetches Bid records for one auction program owned by the connected wallet.
 *
 * @param programId       - Auction program to fetch from (e.g. "fairdrop_dutch_v1.aleo")
 * @param opts.auctionId  - When set, only Bid records for that auction are returned.
 */
export function useBidRecords(programId: string, opts: Options = {}) {
  const { auctionId, ...walletOpts } = opts;
  const { entries, loading, fetchRecords } = useWalletRecords(programId, walletOpts);

  const bidRecords = useMemo<WalletBidRecord[]>(() => {
    const result: WalletBidRecord[] = [];
    for (const entry of entries) {
      if (entry.recordName !== 'Bid') continue;
      try {
        const fields = parsePlaintext(entry.recordPlaintext);
        if (auctionId && fields['auction_id'] !== auctionId) continue;
        result.push({
          id:             entry.commitment,
          programId,
          auction_id:     fields['auction_id'] ?? '',
          quantity:       u128ToBigInt(parseU128(fields['quantity']       ?? '0u128')),
          payment_amount: u128ToBigInt(parseU128(fields['payment_amount'] ?? '0u128')),
          spent:          entry.spent,
          _record:        entry.recordPlaintext,
        });
      } catch { /* skip malformed */ }
    }
    return result;
  }, [entries, programId, auctionId]);

  return { bidRecords, loading, fetchRecords };
}
