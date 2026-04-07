import { Progress } from '@/components';
import { formatMicrocredits } from '@fairdrop/sdk/credits';
import type { PricePanelProps } from './types';

export function QuadraticPricePanel({ auction }: PricePanelProps) {
  const target        = auction.raise?.raiseTarget ?? 0n;
  const totalPayments = BigInt(auction.totalPayments);
  const raisePct = target > 0n
    ? Math.min(100, Number((totalPayments * 100n) / target))
    : 0;

  const fillMinBps = auction.raise?.fillMinBps ?? 0;
  const threshold  = fillMinBps > 0 && target > 0n
    ? (target * BigInt(fillMinBps)) / 10000n
    : null;

  const description = fillMinBps > 0
    ? `Tokens allocated by √payment weight if at least ${fillMinBps / 100}% of the target is collected.`
    : 'Tokens allocated by √payment weight if the raise target is met by end block.';

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-muted-foreground">Raise target</span>
        <span className="text-xl font-semibold">
          {target > 0n ? formatMicrocredits(target) : '—'}
        </span>
      </div>
      {target > 0n && (
        <>
          <Progress value={raisePct} className="h-2" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{formatMicrocredits(totalPayments)} raised</span>
            <span>{raisePct.toFixed(1)}%</span>
          </div>
          {threshold != null && (
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Min fill threshold</span>
              <span>{formatMicrocredits(threshold)} ({fillMinBps / 100}%)</span>
            </div>
          )}
        </>
      )}
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  );
}
