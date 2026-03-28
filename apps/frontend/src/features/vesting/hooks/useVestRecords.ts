import { useState, useEffect, useCallback } from 'react';
import { useWallet }         from '@provablehq/aleo-wallet-adaptor-react';
import { parsePlaintext, stripVisibility, parseU32, parseU128, u128ToBigInt } from '@fairdrop/sdk/parse';
import type { WalletRecord } from '@fairdrop/types/primitives';
import { config }            from '@/env';
import { auctionsService }   from '@/services/auctions.service';
import type { AuctionView }  from '@fairdrop/types/domain';

const VEST_PROGRAM = config.programs.vest.programId;

// ── types ─────────────────────────────────────────────────────────────────────

export interface VestRecord {
  /** Raw WalletRecord — passed as first input to `release`. */
  raw:        WalletRecord;
  /** auction_id field (informational). */
  auctionId:  string;
  /** sale_token_id — the token being vested. */
  tokenId:    string;
  /** total_amount — original quantity to vest. */
  total:      bigint;
  /** released — cumulative tokens already released. */
  released:   bigint;
  /** cliff_block — ABSOLUTE block number; no releases before this. */
  cliffBlock: number;
  /** end_block — ABSOLUTE block number; fully vested after this. */
  endBlock:   number;
}

// ── vesting math (exported for use in components) ─────────────────────────────

export type VestStatus = 'Locked' | 'Vesting' | 'Fully Vested' | 'Completed';

export function computeReleasable(v: VestRecord, currentBlock: number): bigint {
  if (currentBlock < v.cliffBlock)  return 0n;
  if (currentBlock >= v.endBlock)   return v.total - v.released;
  const vestDuration = v.endBlock - v.cliffBlock;
  if (vestDuration <= 0)            return v.total - v.released;
  const elapsed = BigInt(currentBlock - v.cliffBlock);
  const vested  = (v.total * elapsed) / BigInt(vestDuration);
  const capped  = vested > v.total ? v.total : vested;
  return capped > v.released ? capped - v.released : 0n;
}

export function getVestStatus(v: VestRecord, currentBlock: number): VestStatus {
  if (v.released >= v.total)        return 'Completed';
  if (currentBlock >= v.endBlock)   return 'Fully Vested';
  if (currentBlock >= v.cliffBlock) return 'Vesting';
  return 'Locked';
}

// ── hook ──────────────────────────────────────────────────────────────────────

export function useVestRecords() {
  const { connected, requestRecords } = useWallet();
  const [records,    setRecords]    = useState<VestRecord[]>([]);
  const [auctionMap, setAuctionMap] = useState<Record<string, AuctionView>>({});
  const [loading,    setLoading]    = useState(false);

  const load = useCallback(async () => {
    if (!connected) return;
    setLoading(true);
    try {
      const recs = await (requestRecords as (p: string, includePlaintext: boolean) => Promise<unknown[]>)(
        VEST_PROGRAM, true,
      ).catch(() => [] as unknown[]);

      const parsed: VestRecord[] = [];
      for (const r of recs ?? []) {
        const entry = r as WalletRecord;
        if (typeof entry.recordPlaintext !== 'string') continue;
        if (entry.recordName !== 'VestedAllocation') continue;
        try {
          const fields     = parsePlaintext(entry.recordPlaintext);
          const auctionId  = stripVisibility(fields['auction_id']    ?? '');
          const tokenId    = stripVisibility(fields['sale_token_id'] ?? '');
          const total      = u128ToBigInt(parseU128(fields['total_amount'] ?? '0u128'));
          const released   = u128ToBigInt(parseU128(fields['released']     ?? '0u128'));
          // cliff_block and end_block are ABSOLUTE block numbers (computed at create_vest time).
          const cliffBlock = parseU32(fields['cliff_block'] ?? '0u32');
          const endBlock   = parseU32(fields['end_block']   ?? '0u32');
          if (!auctionId || total === 0n) continue;
          parsed.push({
            raw: entry,
            auctionId, tokenId, total, released, cliffBlock, endBlock,
          });
        } catch { /* skip malformed */ }
      }

      setRecords(parsed);

      const uniqueIds = [...new Set(parsed.map((r) => r.auctionId))];
      const details   = await Promise.all(
        uniqueIds.map((id) => auctionsService.get(id).catch(() => null)),
      );
      const map: Record<string, AuctionView> = {};
      details.forEach((d) => { if (d) map[d.id] = d; });
      setAuctionMap(map);
    } catch {
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [connected]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  return { records, auctionMap, loading, reload: load };
}
