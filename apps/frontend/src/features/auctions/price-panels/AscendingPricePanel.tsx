import { formatMicrocredits } from '@fairdrop/sdk/credits';
import { AuctionType }        from '@fairdrop/types/domain';
import type { PricePanelProps } from './types';

export function AscendingPricePanel({ auction, currentPrice, blockHeight }: PricePanelProps) {
  const liveEndBlock = auction.effectiveEndBlock ?? auction.endBlock;
  const isExtended   = auction.effectiveEndBlock != null && auction.effectiveEndBlock > auction.endBlock;
  const blocksLeft   = Math.max(0, liveEndBlock - blockHeight);

  const params = auction.params.type === AuctionType.Ascending ? auction.params : null;
  const extensionWindow = params?.extension_window ?? 0;
  const inWindow = extensionWindow > 0 && blockHeight >= liveEndBlock - extensionWindow && blockHeight < liveEndBlock;

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-muted-foreground">Current price</span>
        <span className="text-xl font-semibold text-emerald-500">
          {currentPrice ? formatMicrocredits(currentPrice) : '—'}
        </span>
      </div>

      <div className="flex items-baseline justify-between text-xs">
        <span className="text-muted-foreground">
          {isExtended ? 'Extended end' : 'End block'}
        </span>
        <span className={isExtended ? 'font-mono text-amber-500' : 'font-mono text-foreground/80'}>
          #{liveEndBlock.toLocaleString()}
          {isExtended && (
            <span className="ml-1.5 rounded bg-amber-500/15 px-1 py-0.5 text-[10px] text-amber-500">
              Extended
            </span>
          )}
        </span>
      </div>

      <div className="flex items-baseline justify-between text-xs">
        <span className="text-muted-foreground">Blocks remaining</span>
        <span className="font-mono text-foreground/80">{blocksLeft.toLocaleString()}</span>
      </div>

      {inWindow && (
        <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-600 dark:text-amber-400">
          Bidding now may extend the deadline by ~{params!.extension_blocks} blocks.
        </p>
      )}
    </div>
  );
}
