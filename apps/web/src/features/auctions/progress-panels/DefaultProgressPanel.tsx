import { Progress } from '@fairdrop/ui';
import type { ProgressPanelProps } from './types';

export function DefaultProgressPanel({ auction }: ProgressPanelProps) {
  const pct = auction.progressPct;

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{auction.totalCommitted.toLocaleString()} committed</span>
        <span>{pct.toFixed(1)}% of {auction.supply.toLocaleString()}</span>
      </div>
      <Progress value={pct} className="h-2" />
    </div>
  );
}
