import { Link }              from 'react-router-dom';
import { ExternalLink }      from 'lucide-react';
import { useWallet }         from '@provablehq/aleo-wallet-adaptor-react';
import { Button, Spinner, Card, CardContent, CardHeader, Progress } from '@/components';
import { AUCTION_REGISTRY }  from '@/features/auctions/registry';
import { auctionDetailUrl }  from '@/config';
import { parseExecutionError } from '@/shared/utils/errors';
import { useTransactionTracker } from '@/providers/transaction-tracker';
import { releaseVested }     from '@/lib/auctionTx';
import { computeReleasable, getVestStatus } from '../hooks/useVestRecords';
import type { VestRecord, VestStatus } from '../hooks/useVestRecords';
import type { AuctionView } from '@fairdrop/types/domain';
import { useState } from 'react';

// ── status config ──────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<VestStatus, {
  borderClass: string;
  badge:       string;
  label:       string;
}> = {
  Locked:        { borderClass: 'border-l-amber-500/50',    badge: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',    label: 'Locked'       },
  Vesting:       { borderClass: 'border-l-sky-500/50',      badge: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',          label: 'Vesting'      },
  'Fully Vested':{ borderClass: 'border-l-emerald-500/50',  badge: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400', label: 'Fully Vested' },
  Completed:     { borderClass: 'border-l-border/40',       badge: 'bg-muted text-muted-foreground',                         label: 'Completed'    },
};

// ── helpers ───────────────────────────────────────────────────────────────────

function formatTokens(n: bigint): string {
  // Display as integer with locale separators — token decimals are token-specific.
  return n.toLocaleString();
}

function blockLabel(block: number, currentBlock: number): string {
  if (currentBlock <= 0) return `#${block.toLocaleString()}`;
  const diff = block - currentBlock;
  if (diff <= 0) return `#${block.toLocaleString()} (passed)`;
  return `#${block.toLocaleString()} (in ~${diff.toLocaleString()} blocks)`;
}

// ── component ─────────────────────────────────────────────────────────────────

interface VestCardProps {
  vest:         VestRecord;
  auction:      AuctionView | undefined;
  blockHeight:  number;
}

export function VestCard({ vest, auction, blockHeight }: VestCardProps) {
  const { executeTransaction } = useWallet();
  const { track }              = useTransactionTracker();
  const [busy,     setBusy]    = useState(false);
  const [error,    setError]   = useState('');

  const status      = getVestStatus(vest, blockHeight);
  const cfg         = STATUS_CONFIG[status];
  const releasable  = computeReleasable(vest, blockHeight);
  const slot        = auction ? AUCTION_REGISTRY[auction.type] : null;
  const name        = auction?.metadata?.name ?? `${vest.auctionId.slice(0, 22)}…`;

  const progressPct = vest.total > 0n
    ? Number((vest.released * 100n) / vest.total)
    : 0;

  async function handleRelease() {
    if (releasable === 0n || busy) return;
    setError('');
    setBusy(true);
    try {
      const spec   = releaseVested(vest.raw, releasable);
      const result = await executeTransaction({ ...spec, inputs: spec.inputs as string[] });
      if (result?.transactionId) track(result.transactionId, 'Release vested tokens');
    } catch (err) {
      setError(parseExecutionError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className={`overflow-hidden border-sky-500/10 border-l-2 bg-gradient-surface shadow-xs ring-1 ring-white/5 ${cfg.borderClass}`}>
      <CardHeader className="px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              {slot && (
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${slot.color}`}>
                  {slot.label}
                </span>
              )}
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${cfg.badge}`}>
                {cfg.label}
              </span>
            </div>
            <p className="text-sm font-semibold leading-tight">{name}</p>
            <p className="font-mono text-[10px] text-muted-foreground truncate">
              Token: {vest.tokenId}
            </p>
          </div>

          <Link
            to={auctionDetailUrl(vest.auctionId)}
            className="mt-0.5 shrink-0 text-muted-foreground transition-colors hover:text-foreground"
          >
            <ExternalLink className="size-3.5" />
          </Link>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 px-4 pb-4 pt-0">
        <div className="h-px bg-border/40" />

        {/* ── Progress bar ─────────────────────────────────────────────────── */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Released</span>
            <span className="font-medium tabular-nums">{progressPct}%</span>
          </div>
          <Progress value={progressPct} className="h-1.5" />
        </div>

        {/* ── Stats ────────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-3 text-xs">
          <div className="space-y-0.5">
            <p className="text-muted-foreground">Total</p>
            <p className="font-semibold tabular-nums">{formatTokens(vest.total)}</p>
          </div>
          <div className="space-y-0.5">
            <p className="text-muted-foreground">Released</p>
            <p className="font-semibold tabular-nums">{formatTokens(vest.released)}</p>
          </div>
          <div className="space-y-0.5">
            <p className="text-muted-foreground">Available</p>
            <p className={`font-semibold tabular-nums ${releasable > 0n ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>
              {formatTokens(releasable)}
            </p>
          </div>
        </div>

        {/* ── Block timeline ───────────────────────────────────────────────── */}
        <div className="space-y-1 rounded-lg border border-border/50 bg-background/40 px-3 py-2 text-xs text-muted-foreground">
          <div className="flex items-center justify-between gap-2">
            <span>Cliff</span>
            <span className="font-mono">{blockLabel(vest.cliffBlock, blockHeight)}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span>Full vest</span>
            <span className="font-mono">{blockLabel(vest.endBlock, blockHeight)}</span>
          </div>
          {blockHeight > 0 && (
            <div className="flex items-center justify-between gap-2 border-t border-border/40 pt-1">
              <span>Current block</span>
              <span className="font-mono">#{blockHeight.toLocaleString()}</span>
            </div>
          )}
        </div>

        {/* ── Release action ───────────────────────────────────────────────── */}
        {releasable > 0n && status !== 'Completed' && (
          <Button size="sm" disabled={busy} onClick={handleRelease}>
            {busy
              ? <><Spinner className="mr-2 h-3 w-3" />Releasing…</>
              : `Release ${formatTokens(releasable)} tokens`}
          </Button>
        )}

        {error && <p className="text-xs text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
