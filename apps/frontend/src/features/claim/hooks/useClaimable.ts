import { useState, useEffect, useCallback } from 'react';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { scanAuctionRecords } from '@fairdrop/sdk/records';
import type { WalletRecord } from '@fairdrop/types/primitives';
import { config } from '@/env';
import { auctionsService } from '@/services/auctions.service';
import type { AuctionView } from '@fairdrop/types/domain';

// ── types ─────────────────────────────────────────────────────────────────────

export type RecordKind = 'bid' | 'commitment';

export interface ClaimableRecord {
  raw: WalletRecord;
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
          const recs = await (requestRecords as (p: string, includePlaintext: boolean) => Promise<unknown[]>)(
            prog.programId, true,
          ).catch(() => [] as unknown[]);

          const entries  = (recs ?? []) as WalletRecord[];
          const entryMap = new Map(entries.map((e) => [e.commitment, e]));
          const { bids, commitments } = scanAuctionRecords(entries, prog.programId);
          for (const b of bids) {
            const raw = entryMap.get(b.id);
            if (!raw || !b.auction_id) continue;
            allRecords.push({ raw, programId: prog.programId, auctionId: b.auction_id, paymentAmount: b.payment_amount, kind: 'bid' });
          }
          for (const c of commitments) {
            const raw = entryMap.get(c.id);
            if (!raw || !c.auction_id) continue;
            allRecords.push({ raw, programId: prog.programId, auctionId: c.auction_id, paymentAmount: c.payment_amount, kind: 'commitment' });
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
