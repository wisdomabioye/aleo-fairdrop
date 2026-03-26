import { useMemo } from 'react';
import { parsePlaintext, parseU128, u128ToBigInt } from '@fairdrop/sdk/parse';
import type { WalletSealedCommitment } from '@fairdrop/types/primitives';
import { useWalletRecords } from './useWalletRecords';

interface Options {
  pollInterval?:  number;
  fetchOnMount?:  boolean;
}

/**
 * Fetches Sealed Commitment records for one auction program owned by the connected wallet.
 *
 * @param programId - Auction program to fetch from (e.g. "fairdrop_sealed_v1.aleo")
 */
export function useSealedCommitment(programId: string, opts: Options = {}) {
  const { entries, loading, fetchRecords } = useWalletRecords(programId, opts);

  const sealedCommitmentRecords = useMemo<WalletSealedCommitment[]>(() => {
    const result: WalletSealedCommitment[] = [];
    for (const entry of entries) {
      if (entry.recordName !== 'Commitment') continue;
      try {
        const fields = parsePlaintext(entry.recordPlaintext);
        result.push({
          id:             entry.commitment,
          programId,
          auction_id:     fields['auction_id'],
          quantity:       u128ToBigInt(parseU128(fields['quantity']       ?? '0u128')),
          payment_amount: u128ToBigInt(parseU128(fields['payment_amount'] ?? '0u128')),
          commitment:     fields['commitment'],
          nonce:          fields['nonce'],
          spent:          entry.spent,
          _record:        entry.recordPlaintext,
        });
      } catch { /* skip malformed */ }
    }
    return result;
  }, [entries, programId]);

  return { sealedCommitmentRecords, loading, fetchRecords };
}
