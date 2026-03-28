import { useMemo } from 'react';
import { parsePlaintext, parseU128, u128ToBigInt } from '@fairdrop/sdk/parse';
import { stripVisibility } from '@fairdrop/sdk/parse';
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
 * @param programId       - Sealed auction program (e.g. "fairdrop_sealed_v1.aleo")
 * @param opts.auctionId  - When set, only Commitment records for that auction are returned.
 */
export function useCommitmentRecords(programId: string, opts: Options = {}) {
  const { auctionId, ...walletOpts } = opts;
  const { entries, loading, fetchRecords } = useWalletRecords(programId, walletOpts);

  const commitmentRecords = useMemo<WalletSealedCommitment[]>(() => {
    const result: WalletSealedCommitment[] = [];
    for (const entry of entries) {
      if (entry.recordName !== 'Commitment') continue;
      try {
        const fields = parsePlaintext(entry.recordPlaintext);
        if (auctionId && stripVisibility(fields['auction_id'] ?? '') !== auctionId) continue;
        result.push({
          id:             entry.commitment,
          programId,
          auction_id:     stripVisibility(fields['auction_id']  ?? ''),
          quantity:       u128ToBigInt(parseU128(fields['quantity']       ?? '0u128')),
          payment_amount: u128ToBigInt(parseU128(fields['payment_amount'] ?? '0u128')),
          commitment:     stripVisibility(fields['commitment']  ?? ''),
          nonce:          stripVisibility(fields['nonce']       ?? ''),
          spent:          entry.spent,
          _record:        entry.recordPlaintext,
        });
      } catch { /* skip malformed */ }
    }
    return result;
  }, [entries, programId, auctionId]);

  return { commitmentRecords, loading, fetchRecords };
}
