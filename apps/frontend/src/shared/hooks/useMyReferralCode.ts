import { useMemo } from 'react';
import { parsePlaintext, stripVisibility } from '@fairdrop/sdk/parse';
import { config } from '@/env';
import { useWalletRecords } from './useWalletRecords';

const REF_PROGRAM = config.programs.ref.programId;

/**
 * Checks whether the connected wallet already owns a referral code for a given auction.
 *
 * Returns the `code_id` field value if found, or null if not.
 * Uses useWalletRecords (plaintext: true) so field parsing is reliable across all wallets.
 *
 * @param auctionId - The auction to check for an existing referral code.
 */
export function useMyReferralCode(auctionId: string) {
  const { entries, loading: checking, fetchRecords } = useWalletRecords(REF_PROGRAM);

  const codeId = useMemo<string | null>(() => {
    for (const entry of entries) {
      try {
        const fields = parsePlaintext(entry.recordPlaintext);
        if (stripVisibility(fields['auction_id'] ?? '') === auctionId) {
          return stripVisibility(fields['code_id'] ?? '') || null;
        }
      } catch { /* skip malformed */ }
    }
    return null;
  }, [entries, auctionId]);

  return { codeId, checking, refetch: fetchRecords };
}
