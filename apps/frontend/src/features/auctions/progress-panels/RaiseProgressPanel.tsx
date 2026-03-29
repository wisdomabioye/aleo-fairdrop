import { Progress } from '@/components';
import { formatMicrocredits } from '@fairdrop/sdk/credits';
import { AuctionType } from '@fairdrop/types/domain';
import type { ProgressPanelProps } from './types';

/** Supply bar with a raise-target threshold marker. */
export function RaiseProgressPanel({ auction }: ProgressPanelProps) {
  const target    = auction.params.type === AuctionType.Raise ? BigInt(auction.params.raise_target) : 0n;
  const totalPayments = BigInt(auction.totalPayments); // For Raise Auction, This is the ALEO contributed

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{formatMicrocredits(totalPayments)} raised</span>
        {target > 0n && <span>Target: {formatMicrocredits(target)}</span>}
      </div>

      {/* Progress bar with threshold line */}
      {
        target > 0n && (
          <div className="relative">
            <Progress value={auction.progressPct} className="h-2" />
            <div
              className="absolute top-0 h-2 w-0.5 bg-yellow-400"
              style={{ left: `${auction.progressPct}%` }}
              title={`Raise target: ${auction.progressPct.toFixed(1)}%`}
            />
          </div>
        )
      }
      
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{auction.progressPct.toFixed(1)}% contributed</span>
         <span className={totalPayments >= target ? 'text-emerald-500' : ''}>
            {totalPayments >= target ? 'Target met' : `${(auction.progressPct).toFixed(1)}% to target`}
          </span>
      </div>
    </div>
  );
}
