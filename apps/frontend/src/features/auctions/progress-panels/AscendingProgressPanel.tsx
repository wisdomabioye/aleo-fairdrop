import { useBlockHeight }   from '@/shared/hooks/useBlockHeight';
import { Progress }          from '@/components';
import { formatAmount }      from '@fairdrop/sdk/format';
import { AuctionType }       from '@fairdrop/types/domain';
import type { ProgressPanelProps } from './types';

export function AscendingProgressPanel({ auction }: ProgressPanelProps) {
  const { data: blockHeight = 0 } = useBlockHeight();

  const liveEndBlock = auction.effectiveEndBlock ?? auction.endBlock;
  const isExtended   = auction.effectiveEndBlock != null && auction.effectiveEndBlock > auction.endBlock;
  const blocksLeft   = Math.max(0, liveEndBlock - blockHeight);

  const params        = auction.params.type === AuctionType.Ascending ? auction.params : null;
  const extWindow     = params?.extension_window ?? 0;
  const inWindow      = extWindow > 0 && blockHeight >= liveEndBlock - extWindow && blockHeight < liveEndBlock;

  const pct      = auction.progressPct;
  const decimals = auction.saleTokenDecimals;

  return (
    <div className="space-y-2">
      {/* Fill bar */}
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>
          {formatAmount(BigInt(auction.totalCommitted), decimals)} {auction.saleTokenSymbol} committed
        </span>
        <span>{pct.toFixed(1)}% of {formatAmount(BigInt(auction.supply), decimals)} {auction.saleTokenSymbol}</span>
      </div>
      <Progress value={pct} className="h-2" />

      {/* Time remaining */}
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span className={isExtended ? 'text-amber-500' : ''}>
          {isExtended ? 'Extended end' : 'End'} #{liveEndBlock.toLocaleString()}
          {isExtended && (
            <span className="ml-1.5 rounded bg-amber-500/15 px-1 py-0.5 text-[10px] text-amber-500">
              Extended
            </span>
          )}
        </span>
        <span>{blocksLeft.toLocaleString()} blocks left</span>
      </div>

      {/* Extension window notice */}
      {inWindow && (
        <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-600 dark:text-amber-400">
          Last {extWindow} blocks — bids will extend the deadline.
        </p>
      )}
    </div>
  );
}
