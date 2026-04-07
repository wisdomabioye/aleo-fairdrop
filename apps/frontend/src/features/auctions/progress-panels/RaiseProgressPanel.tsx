import { Progress } from '@/components';
import { formatMicrocredits } from '@fairdrop/sdk/credits';
import { AuctionStatus, AuctionType } from '@fairdrop/types/domain';
import type { ProgressPanelProps } from './types';

/** Supply bar with a raise-target threshold marker. */
export function RaiseProgressPanel({ auction }: ProgressPanelProps) {
  const target        = auction.params.type === AuctionType.Raise ? BigInt(auction.params.raise_target) : 0n;
  const totalPayments = BigInt(auction.totalPayments);
  const isCleared     = auction.status === AuctionStatus.Cleared;

  // Partial fill: cleared but total_payments < raise_target
  const isPartialFill = isCleared && auction.effectiveSupply != null &&
    auction.effectiveSupply < auction.supply;
  const fillPct = target > 0n
    ? Number((totalPayments * 10000n / target)) / 100
    : auction.progressPct;

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{formatMicrocredits(totalPayments)} raised</span>
        {target > 0n && <span>Target: {formatMicrocredits(target)}</span>}
      </div>

      {target > 0n && (
        <div className="relative">
          <Progress value={Math.min(fillPct, 100)} className="h-2" />
          <div
            className="absolute top-0 h-2 w-0.5 bg-yellow-400"
            style={{ left: '100%' }}
            title={`Raise target: ${formatMicrocredits(target)}`}
          />
        </div>
      )}

      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{fillPct.toFixed(1)}% contributed</span>
        <span className={
          isCleared
            ? isPartialFill ? 'text-amber-500' : 'text-emerald-500'
            : totalPayments >= target ? 'text-emerald-500' : ''
        }>
          {isCleared
            ? isPartialFill
              ? `Partial fill — ${fillPct.toFixed(1)}% of target`
              : 'Fully raised'
            : totalPayments >= target
              ? 'Target met'
              : `${fillPct.toFixed(1)}% to target`}
        </span>
      </div>
    </div>
  );
}
