import { useMemo } from 'react';
import { scanCommitmentRecords } from '@fairdrop/sdk/records';
import type { WalletSealedCommitment } from '@fairdrop/types/primitives';
import { useWalletRecords } from './useWalletRecords';

interface Options {
  /** Filter records to a specific auction. */
  auctionId?:    string;
  pollInterval?: number;
  fetchOnMount?: boolean;
}

/**
 * Fetches Commitment records for one sealed auction program owned by the connected wallet.
 *
 * @param programId       - Sealed auction program (e.g. "fairdrop_sealed_v2.aleo")
 * @param opts.auctionId  - When set, only Commitment records for that auction are returned.
 */
export function useCommitmentRecords(programId: string, opts: Options = {}) {
  const { auctionId, ...walletOpts } = opts;
  const { entries, loading, fetchRecords } = useWalletRecords(programId, walletOpts);

  const commitmentRecords = useMemo<WalletSealedCommitment[]>(
    () => scanCommitmentRecords(entries, programId, auctionId),
    [entries, programId, auctionId],
  );

  return { commitmentRecords, loading, fetchRecords };
}
