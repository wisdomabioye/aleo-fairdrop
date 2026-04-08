/**
 * Dutch-only inline indicator — shows blocks until next price step and the next price.
 * Rendered on the main auction view, not behind a tab.
 */

import { Timer } from 'lucide-react';
import { formatMicrocredits } from '@fairdrop/sdk/credits';
import { dutchNextDrop } from '@fairdrop/sdk/price';
import { AuctionType, AuctionStatus } from '@fairdrop/types/domain';
import type { AuctionView } from '@fairdrop/types/domain';
import { useBlockHeight } from '@/shared/hooks/useBlockHeight';

interface Props {
  auction: AuctionView;
}

export function NextPriceDropChip({ auction }: Props) {
  const { data: currentBlock = 0 } = useBlockHeight();

  if (auction.status !== AuctionStatus.Active) return null;
  // Narrows auction.params to DutchParams for dutchNextDrop
  if (auction.params.type !== AuctionType.Dutch) return null;

  const drop = dutchNextDrop(auction.params, auction.startBlock, currentBlock);
  if (!drop) return null;   // already at floor

  return (
    <span className="inline-flex items-center gap-1 rounded-lg border border-border/60 bg-background/50 px-2 py-1 text-[11px] text-muted-foreground">
      <Timer className="size-3 shrink-0" />
      Price drops to{' '}
      <span className="font-medium text-foreground">
        {formatMicrocredits(drop.nextPrice)}
      </span>
      {' '}in{' '}
      <span className="font-medium text-foreground">
        {drop.blocksRemaining.toLocaleString()} block{drop.blocksRemaining !== 1 ? 's' : ''}
      </span>
    </span>
  );
}
