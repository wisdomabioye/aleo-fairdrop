import { useState, useEffect, useCallback } from 'react';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { recField, recU128, hasRecordKey } from '@fairdrop/sdk/parse';
import { config } from '@/env';
import { auctionsService } from '@/services/auctions.service';
import type { AuctionView } from '@fairdrop/types/domain';

// ── types ─────────────────────────────────────────────────────────────────────

export type RecordKind = 'bid' | 'commitment';

export interface ClaimableRecord {
  raw:           Record<string, unknown>;
  programId:     string;
  auctionId:     string;
  paymentAmount: bigint;
  kind:          RecordKind;
}

export interface ClaimableGroup {
  auctionId: string;
  auction:   AuctionView | null;
  records:   ClaimableRecord[];
}

// ── programs to scan ──────────────────────────────────────────────────────────

const PROGRAMS = [
  config.programs.dutch,
  config.programs.sealed,
  config.programs.raise,
  config.programs.ascending,
  config.programs.lbp,
  config.programs.quadratic,
] as const;

// ── hook ──────────────────────────────────────────────────────────────────────

export function useClaimable() {
  const { connected, requestRecords } = useWallet();
  const [groups,  setGroups]  = useState<ClaimableGroup[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!connected) return;
    setLoading(true);
    try {
      const allRecords: ClaimableRecord[] = [];

      await Promise.all(
        PROGRAMS.map(async (prog) => {
          const recs = await (requestRecords as (p: string) => Promise<Record<string, unknown>[]>)(
            prog.programId,
          ).catch(() => [] as Record<string, unknown>[]);

          for (const rec of (recs ?? [])) {
            const auctionId = recField(rec, 'auction_id');
            if (!auctionId) continue;
            const paymentAmount = recU128(rec, 'payment_amount');
            // CommitmentRecord has commitment_hash; Bid records do not
            const kind: RecordKind = hasRecordKey(rec, 'commitment_hash') ? 'commitment' : 'bid';
            allRecords.push({ raw: rec, programId: prog.programId, auctionId, paymentAmount, kind });
          }
        }),
      );

      const uniqueIds = [...new Set(allRecords.map((r) => r.auctionId))];
      const details   = await Promise.all(
        uniqueIds.map((id) => auctionsService.get(id).catch(() => null)),
      );
      const auctionMap: Record<string, AuctionView> = {};
      details.forEach((d) => { if (d) auctionMap[d.id] = d; });

      setGroups(
        uniqueIds.map((id) => ({
          auctionId: id,
          auction:   auctionMap[id] ?? null,
          records:   allRecords.filter((r) => r.auctionId === id),
        })),
      );
    } catch {
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, [connected]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  return { groups, loading, reload: load };
}
