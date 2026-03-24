import { useState, useEffect, useCallback } from 'react';
import { useWallet }           from '@provablehq/aleo-wallet-adaptor-react';
import { Button, Spinner, Badge } from '@/components';
import { recField, recU128, recU32 } from '@fairdrop/sdk/parse';
import { formatMicrocredits }  from '@fairdrop/sdk/credits';
import { config }              from '@/env';
import { parseExecutionError } from '@/shared/utils/errors';
import { useTransactionStore } from '@/stores/transaction.store';
import { useBlockHeight }      from '@/shared/hooks/useBlockHeight';
import { auctionsService }     from '@/services/auctions.service';
import { ConnectWalletPrompt } from '@/shared/components/wallet/ConnectWalletPrompt';
import type { AuctionView }    from '@fairdrop/types/domain';

const VEST_PROGRAM = config.programs.vest.programId;

// ── types ─────────────────────────────────────────────────────────────────────

interface VestRecord {
  raw:           Record<string, unknown>;
  auctionId:     string;
  tokenId:       string;
  total:         bigint;
  claimed:       bigint;
  endedAtBlock:  number;
  cliffBlocks:   number;
  vestEndBlocks: number;
}

// ── vesting math ──────────────────────────────────────────────────────────────

function computeReleasable(v: VestRecord, currentBlock: number): bigint {
  const cliffBlock   = v.endedAtBlock + v.cliffBlocks;
  const vestEndBlock = v.endedAtBlock + v.vestEndBlocks;

  if (currentBlock < cliffBlock)   return 0n;
  if (currentBlock >= vestEndBlock) return v.total - v.claimed;

  const vestDuration = vestEndBlock - cliffBlock;
  if (vestDuration <= 0) return v.total - v.claimed;

  const elapsed  = BigInt(currentBlock - cliffBlock);
  const vested   = (v.total * elapsed) / BigInt(vestDuration);
  const capped   = vested > v.total ? v.total : vested;
  return capped > v.claimed ? capped - v.claimed : 0n;
}

function vestStatus(v: VestRecord, currentBlock: number): string {
  const cliffBlock   = v.endedAtBlock + v.cliffBlocks;
  const vestEndBlock = v.endedAtBlock + v.vestEndBlocks;
  if (v.claimed >= v.total) return 'Completed';
  if (currentBlock >= vestEndBlock) return 'Fully Vested';
  if (currentBlock >= cliffBlock)   return 'Vesting';
  return 'Locked';
}

// ── component ─────────────────────────────────────────────────────────────────

export function VestingPage() {
  const { connected, requestRecords, executeTransaction } = useWallet();
  const { setTx }                    = useTransactionStore();
  const { data: blockHeight = 0 }    = useBlockHeight();

  const [records,    setRecords]    = useState<VestRecord[]>([]);
  const [auctionMap, setAuctionMap] = useState<Record<string, AuctionView>>({});
  const [loading,    setLoading]    = useState(false);
  const [releasing,  setReleasing]  = useState<string | null>(null); // auctionId+tokenId key
  const [errors,     setErrors]     = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!connected) return;
    setLoading(true);
    try {
      const recs = await (requestRecords as (p: string) => Promise<Record<string, unknown>[]>)(
        VEST_PROGRAM,
      ).catch(() => [] as Record<string, unknown>[]);

      const parsed: VestRecord[] = (recs ?? []).map((rec) => ({
        raw:           rec,
        auctionId:     recField(rec, 'auction_id'),
        tokenId:       recField(rec, 'token_id'),
        total:         recU128(rec, 'total'),
        claimed:       recU128(rec, 'claimed'),
        endedAtBlock:  recU32(rec, 'ended_at_block'),
        cliffBlocks:   recU32(rec, 'cliff_blocks'),
        vestEndBlocks: recU32(rec, 'vest_end_blocks'),
      })).filter((r) => r.auctionId && r.total > 0n);

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

  async function handleRelease(v: VestRecord) {
    const releasable = computeReleasable(v, blockHeight);
    if (releasable === 0n) return;

    const key = `${v.auctionId}:${v.tokenId}`;
    setErrors((e) => ({ ...e, [key]: '' }));
    setReleasing(key);
    try {
      const result = await executeTransaction({
        program:  VEST_PROGRAM,
        function: 'release',
        inputs:   [
          v.raw as unknown as string,
          v.auctionId,
          v.tokenId,
          `${releasable}u128`,
        ],
        fee: 0.3,
      });
      if (result?.transactionId) setTx(result.transactionId, 'Release vested tokens');
    } catch (err) {
      setErrors((e) => ({ ...e, [key]: parseExecutionError(err) }));
    } finally {
      setReleasing(null);
    }
  }

  if (!connected) {
    return (
      <div className="max-w-3xl mx-auto py-6 px-4 space-y-6">
        <h1 className="text-2xl font-semibold">Vesting</h1>
        <ConnectWalletPrompt message="Connect your wallet to see your vesting positions." />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto py-6 px-4 space-y-6">
        <h1 className="text-2xl font-semibold">Vesting</h1>
        <div className="flex justify-center py-12"><Spinner className="h-6 w-6" /></div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 py-6 px-4">
      <div>
        <h1 className="text-2xl font-semibold">Vesting</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Release vested token allocations from auctions you participated in.
        </p>
      </div>

      {records.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-12">
          No vesting positions found.
        </p>
      ) : (
        <div className="space-y-3">
          {records.map((v) => {
            const key        = `${v.auctionId}:${v.tokenId}`;
            const isBusy     = releasing === key;
            const releasable = computeReleasable(v, blockHeight);
            const status     = vestStatus(v, blockHeight);
            const auction    = auctionMap[v.auctionId];
            const name       = auction?.metadata?.name ?? `${v.auctionId.slice(0, 14)}…`;

            const cliffBlock   = v.endedAtBlock + v.cliffBlocks;
            const vestEndBlock = v.endedAtBlock + v.vestEndBlocks;

            return (
              <div key={key} className="rounded-md border border-border p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 space-y-0.5">
                    <p className="font-medium text-sm truncate">{name}</p>
                    <p className="text-xs text-muted-foreground font-mono truncate">
                      Token: {v.tokenId.slice(0, 20)}…
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={`text-xs shrink-0 ${
                      status === 'Completed'    ? 'text-muted-foreground' :
                      status === 'Fully Vested' ? 'text-emerald-600 dark:text-emerald-400' :
                      status === 'Vesting'      ? 'text-blue-600 dark:text-blue-400' :
                                                  'text-orange-600 dark:text-orange-400'
                    }`}
                  >
                    {status}
                  </Badge>
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <p className="text-muted-foreground">Total</p>
                    <p className="font-medium">{formatMicrocredits(v.total)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Released</p>
                    <p className="font-medium">{formatMicrocredits(v.claimed)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Releasable</p>
                    <p className="font-medium text-emerald-600 dark:text-emerald-400">
                      {formatMicrocredits(releasable)}
                    </p>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">
                  Cliff #{cliffBlock} · Full vest #{vestEndBlock}
                  {blockHeight > 0 && ` · Current #${blockHeight}`}
                </p>

                {releasable > 0n && status !== 'Completed' && (
                  <Button
                    size="sm"
                    disabled={!!releasing}
                    onClick={() => handleRelease(v)}
                  >
                    {isBusy
                      ? <><Spinner className="mr-2 h-3 w-3" />Releasing…</>
                      : `Release ${formatMicrocredits(releasable)}`}
                  </Button>
                )}

                {errors[key] && <p className="text-xs text-destructive">{errors[key]}</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
