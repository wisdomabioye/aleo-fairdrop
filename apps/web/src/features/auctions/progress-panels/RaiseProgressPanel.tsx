import { Progress } from '@fairdrop/ui';
import { formatMicrocredits } from '@fairdrop/sdk/credits';
import type { ProgressPanelProps } from './types';

/** Supply bar with a raise-target threshold marker. */
export function RaiseProgressPanel({ auction }: ProgressPanelProps) {
  const target    = auction.raiseTarget ?? 0n;
  const committed = auction.totalCommitted;
  const supplyPct = auction.progressPct;
  const targetPct = target > 0n && auction.supply > 0n
    ? Math.min(100, Number((target * 100n) / auction.supply))
    : null;

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{formatMicrocredits(committed)} raised</span>
        {target > 0n && <span>Target: {formatMicrocredits(target)}</span>}
      </div>

      {/* Progress bar with threshold line */}
      <div className="relative">
        <Progress value={supplyPct} className="h-2" />
        {targetPct !== null && (
          <div
            className="absolute top-0 h-2 w-0.5 bg-yellow-400"
            style={{ left: `${targetPct}%` }}
            title={`Raise target: ${targetPct.toFixed(1)}%`}
          />
        )}
      </div>

      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{supplyPct.toFixed(1)}% of supply</span>
        {targetPct !== null && (
          <span className={committed >= target ? 'text-emerald-500' : ''}>
            {committed >= target ? 'Target met' : `${(100 - supplyPct / targetPct * 100).toFixed(1)}% to target`}
          </span>
        )}
      </div>
    </div>
  );
}
