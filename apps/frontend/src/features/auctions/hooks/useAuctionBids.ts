import { useState, useEffect, useCallback } from 'react';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { recField, recU128, hasRecordKey } from '@fairdrop/sdk/parse';
import type { ClaimableRecord } from '../../claim/hooks/useClaimable';

/**
 * Scans a single auction program for bid and commitment records belonging
 * to the connected wallet for a specific auction.
 *
 * - `enabled` — set false when no scan is needed (e.g. Ended/Clearing state)
 */
export function useAuctionBids(auctionId: string, programId: string, enabled = true) {
  const { connected, requestRecords } = useWallet();
  const [records, setRecords] = useState<ClaimableRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!connected || !enabled || !auctionId || !programId) return;
    setLoading(true);
    try {
      const recs = await (requestRecords as (p: string) => Promise<Record<string, unknown>[]>)(
        programId,
      ).catch(() => [] as Record<string, unknown>[]);

      const matched = (recs ?? [])
        .filter((rec) => recField(rec, 'auction_id') === auctionId)
        .map((rec) => ({
          raw:           rec,
          programId,
          auctionId,
          paymentAmount: recU128(rec, 'payment_amount'),
          kind:          (hasRecordKey(rec, 'commitment_hash') ? 'commitment' : 'bid') as ClaimableRecord['kind'],
        }));

      setRecords(matched);
    } catch {
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [connected, auctionId, programId, enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  return { records, loading, reload: load };
}
