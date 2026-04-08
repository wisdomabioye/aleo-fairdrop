import { Progress } from '@/components';
import { useBlockHeight } from '@/shared/hooks/useBlockHeight';
import { formatAmount } from '@fairdrop/sdk/format';
import type { ProgressPanelProps } from './types';

export function SealedProgressPanel({ auction }: ProgressPanelProps) {
  const { data: blockHeight = 0 } = useBlockHeight();

  const sealedP        = auction.params.type === 'sealed' ? auction.params : null;
  const commitEndBlock = sealedP ? sealedP.commit_end_block : 0;
  const endBlock       = auction.endBlock;
  const startBlock     = auction.startBlock;

  const isRevealPhase = blockHeight > commitEndBlock;

  // Commit phase: time-based progress through commit window (supply unknown)
  // Reveal phase: supply-based progress from auction.progressPct (totalCommitted now valid)
  const [phasePct, blocksLeft, phaseLabel, phaseEnd] = (() => {
    if (!isRevealPhase) {
      const total = commitEndBlock - startBlock;
      const elapsed = blockHeight - startBlock;
      const pct = total > 0 ? Math.min(100, (elapsed / total) * 100) : 0;
      return [pct, Math.max(0, commitEndBlock - blockHeight), 'Commit phase', commitEndBlock];
    } else {
      return [auction.progressPct, Math.max(0, endBlock - blockHeight), 'Reveal phase', endBlock];
    }
  })();

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>
          {isRevealPhase
            ? `${formatAmount(BigInt(auction.totalCommitted), auction.saleTokenDecimals)} ${auction.saleTokenSymbol ?? ''} revealed`
            : phaseLabel}
        </span>
        <span>
          {blocksLeft > 0
            ? `${blocksLeft.toLocaleString()} blocks left (ends at ${phaseEnd.toLocaleString()})`
            : `Block ${phaseEnd.toLocaleString()} passed`}
        </span>
      </div>

      <Progress value={phasePct} className="h-2" />

      {!isRevealPhase && commitEndBlock > 0 && (
        <p className="text-[11px] text-muted-foreground">
          Order book sealed — no bids visible until reveal opens at block {commitEndBlock.toLocaleString()}.
        </p>
      )}

      {isRevealPhase && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-[11px] text-destructive space-y-0.5">
          <p className="font-medium">Reveal window is open</p>
          <p>
            You must reveal your commitment before block {endBlock.toLocaleString()}.{' '}
            {blocksLeft > 0
              ? <><strong>{blocksLeft.toLocaleString()} blocks remaining.</strong></>
              : 'The window has closed.'}
            {' '}Failure to reveal results in complete forfeiture of your collateral — there is no recovery path.
          </p>
        </div>
      )}
    </div>
  );
}
