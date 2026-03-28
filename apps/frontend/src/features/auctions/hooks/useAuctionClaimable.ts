import { useMemo } from 'react';
import { parsePlaintext, parseU128, stripVisibility, u128ToBigInt } from '@fairdrop/sdk/parse';
import type { AuctionView } from '@fairdrop/types/domain';
import { useWalletRecords } from '@/shared/hooks/useWalletRecords';
import type { ClaimableRecord } from '../../claim/hooks/useClaimable';

/**
 * Scans the wallet for Bid and Commitment records belonging to a specific auction.
 *
 * Replaces useAuctionBids:
 *   - Single useWalletRecords call (plaintext:true) for the auction's program.
 *   - Passes the WalletRecord entry as `raw` — the wallet adapter needs the
 *     record object (not the plaintext string) to prove and execute transitions.
 *   - Filters by auctionId using stripVisibility so visibility suffixes don't
 *     cause mismatches (.private on field values in some wallet formats).
 *   - Commitment records are included (sealed commit-not-yet-revealed = still claimable
 *     after cancel/void).
 *
 * @param auction  - The auction to scan for. Pass null/undefined to skip.
 * @param enabled  - Set false to suppress fetching (e.g. auction not yet settled).
 */
export function useAuctionClaimable(
  auction: AuctionView | null | undefined,
  enabled = true,
) {
  const programId = auction?.programId ?? '';
  const auctionId = auction?.id        ?? '';

  const { entries, loading } = useWalletRecords(programId, { fetchOnMount: enabled });

  const records = useMemo<ClaimableRecord[]>(() => {
    if (!auction || !enabled || !auctionId) return [];

    const result: ClaimableRecord[] = [];

    for (const entry of entries) {
      const isBid        = entry.recordName === 'Bid';
      const isCommitment = entry.recordName === 'Commitment';
      if (!isBid && !isCommitment) continue;

      try {
        const fields         = parsePlaintext(entry.recordPlaintext);
        const entryAuctionId = stripVisibility(fields['auction_id'] ?? '');
        if (entryAuctionId !== auctionId) continue;

        result.push({
          // Pass the WalletRecord object — wallet adapter uses commitment/ciphertext to prove it.
          raw: entry,
          programId,
          auctionId,
          paymentAmount: u128ToBigInt(parseU128(fields['payment_amount'] ?? '0u128')),
          kind:          isCommitment ? 'commitment' : 'bid',
        });
      } catch { /* skip malformed */ }
    }

    return result;
  }, [entries, auction, enabled, auctionId, programId]);

  return { records, loading };
}
