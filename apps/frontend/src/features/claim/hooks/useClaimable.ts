import { useState, useEffect, useCallback } from 'react';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { parsePlaintext, stripVisibility, parseU128, u128ToBigInt } from '@fairdrop/sdk/parse';
import type { WalletRecord } from '@fairdrop/types/primitives';
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
          const recs = await (requestRecords as (p: string, includePlaintext: boolean) => Promise<unknown[]>)(
            prog.programId, true,
          ).catch(() => [] as unknown[]);

          for (const rec of (recs ?? [])) {
            const entry = rec as WalletRecord;
            if (typeof entry.recordPlaintext !== 'string') continue;
            const isBid        = entry.recordName === 'Bid';
            const isCommitment = entry.recordName === 'Commitment';
            if (!isBid && !isCommitment) continue;
            try {
              const fields    = parsePlaintext(entry.recordPlaintext);
              const auctionId = stripVisibility(fields['auction_id'] ?? '');
              if (!auctionId) continue;
              const paymentAmount = u128ToBigInt(parseU128(fields['payment_amount'] ?? '0u128'));
              const kind: RecordKind = isCommitment ? 'commitment' : 'bid';
              allRecords.push({ raw: entry as unknown as Record<string, unknown>, programId: prog.programId, auctionId, paymentAmount, kind });
            } catch { /* skip malformed */ }
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
