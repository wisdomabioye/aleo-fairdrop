import { Progress } from '@/components';
import { formatMicrocredits } from '@fairdrop/sdk/credits';
import { AuctionStatus } from '@fairdrop/types/domain';
import type { ProgressPanelProps } from './types';

/** Supply bar for quadratic auctions — raise-target threshold with partial fill status. */
export function QuadraticProgressPanel({ auction }: ProgressPanelProps) {
  const totalPayments = auction.totalPayments;
  const isCleared     = auction.status === AuctionStatus.Cleared;

  const isPartialFill = isCleared && auction.effectiveSupply != null &&
    auction.effectiveSupply < auction.supply;

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{formatMicrocredits(totalPayments)} contributed</span>
        <span className="font-mono text-xs">√-weighted allocation</span>
      </div>
      <Progress value={Math.min(auction.progressPct, 100)} className="h-2" />
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{auction.progressPct.toFixed(1)}% of target</span>
        <span className={
          isCleared
            ? isPartialFill ? 'text-amber-500' : 'text-emerald-500'
            : auction.progressPct >= 100 ? 'text-emerald-500' : ''
        }>
          {isCleared
            ? isPartialFill
              ? `Partial fill — ${auction.progressPct.toFixed(1)}% of target`
              : 'Target met'
            : auction.progressPct >= 100
              ? 'Target met'
              : `${auction.progressPct.toFixed(1)}% to target`}
        </span>
      </div>
    </div>
  );
}
