import { Progress } from '@/components';
import type { ProgressPanelProps } from './types';
import { formatAmount } from '@fairdrop/sdk/format';

export function DefaultProgressPanel({ auction }: ProgressPanelProps) {
  console.log(auction)
  const pct = auction.progressPct;

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{auction.totalCommitted.toLocaleString()} committed</span>
        <span>{pct.toFixed(1)}% of {formatAmount(BigInt(auction.supply), 6)} {auction.saleTokenSymbol}</span>
      </div>
      <Progress value={pct} className="h-2" />
    </div>
  );
}
