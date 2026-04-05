import { useMemo } from 'react';
import { scanBidRecords } from '@fairdrop/sdk/records';
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
 * @param programId       - Auction program to fetch from (e.g. "fairdrop_dutch_v2.aleo")
 * @param opts.auctionId  - When set, only Bid records for that auction are returned.
 */
export function useBidRecords(programId: string, opts: Options = {}) {
  const { auctionId, ...walletOpts } = opts;
  const { entries, loading, fetchRecords } = useWalletRecords(programId, walletOpts);

  const bidRecords = useMemo<WalletBidRecord[]>(
    () => scanBidRecords(entries, programId, auctionId),
    [entries, programId, auctionId],
  );

  return { bidRecords, loading, fetchRecords };
}
