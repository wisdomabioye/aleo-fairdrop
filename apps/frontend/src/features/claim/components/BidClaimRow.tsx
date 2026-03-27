import { useWallet }             from '@provablehq/aleo-wallet-adaptor-react';
import { Button, Spinner, Badge } from '@/components';
import { formatMicrocredits }    from '@fairdrop/sdk/credits';
import { AuctionStatus }         from '@fairdrop/types/domain';
import type { AuctionView }      from '@fairdrop/types/domain';
import { parseExecutionError }   from '@/shared/utils/errors';
import { useConfirmedSequentialTx } from '@/shared/hooks/useConfirmedSequentialTx';
import type { ClaimableRecord }  from '../hooks/useClaimable';
import { TX_DEFAULT_FEE } from '@/env';

interface Props {
  record:  ClaimableRecord;
  auction: AuctionView | null;
}

type ClaimAction = 'claim' | 'claim_vested' | 'claim_voided' | 'claim_commit_voided';

function resolveAction(record: ClaimableRecord, auction: AuctionView): ClaimAction | null {
  if (auction.status === AuctionStatus.Cleared && record.kind === 'bid') {
    return auction.vestEnabled ? 'claim_vested' : 'claim';
  }
  if (auction.status === AuctionStatus.Voided) {
    return record.kind === 'commitment' ? 'claim_commit_voided' : 'claim_voided';
  }
  return null;
}

const ACTION_LABELS: Record<ClaimAction, string> = {
  claim:               'Claim Tokens',
  claim_vested:        'Claim (Vested)',
  claim_voided:        'Claim Refund',
  claim_commit_voided: 'Claim Refund',
};

export function BidClaimRow({ record, auction }: Props) {
  const { executeTransaction } = useWallet();

  // Derived before hooks so the step closure captures the latest values via stepsRef
  const action = auction ? resolveAction(record, auction) : null;
  const label  = action ? ACTION_LABELS[action] : null;

  const tx = useConfirmedSequentialTx([{
    label: label ?? 'Claim',
    execute: async () => {
      if (!action || !auction) throw new Error('Nothing to claim');
      const needsScale = action === 'claim' || action === 'claim_vested';
      const inputs: (string | Record<string, unknown>)[] = needsScale
        ? [record.raw, auction.id, `${record.paymentAmount}u128`, `${auction.saleScale}u128`]
        : [record.raw, auction.id, `${record.paymentAmount}u128`];
      const result = await executeTransaction({
        program:  record.programId,
        function: action,
        inputs:   inputs as string[],
        fee:      TX_DEFAULT_FEE,
      });
      return result?.transactionId;
    },
  }]);

  if (!auction) {
    return (
      <div className="rounded-md border border-border px-4 py-3 text-xs text-muted-foreground">
        {record.auctionId.slice(0, 16)}… — auction details unavailable
      </div>
    );
  }

  if (tx.done) {
    return (
      <div className="rounded-md border border-border px-4 py-3 flex items-center gap-2 text-sm">
        <Badge variant="outline" className="text-xs text-emerald-600 dark:text-emerald-400">
          Submitted
        </Badge>
        <span className="text-muted-foreground text-xs">
          {auction.metadata?.name ?? auction.id.slice(0, 16) + '…'}
        </span>
      </div>
    );
  }

  const busy     = tx.busy || tx.isWaiting;
  const errorMsg = tx.error ? parseExecutionError(tx.error) : '';

  return (
    <div className="rounded-md border border-border px-4 py-3 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <p className="font-medium truncate text-sm">
            {auction.metadata?.name ?? `${auction.id.slice(0, 12)}…`}
          </p>
          <p className="text-xs text-muted-foreground">
            {record.kind === 'commitment' ? 'Sealed commitment' : 'Bid'} ·{' '}
            {formatMicrocredits(record.paymentAmount)}
          </p>
        </div>

        {action ? (
          <Button size="sm" disabled={busy} onClick={tx.advance}>
            {busy ? <><Spinner className="mr-2 h-3 w-3" />Claiming…</> : label}
          </Button>
        ) : (
          <Badge variant="outline" className="text-xs text-muted-foreground">
            {auction.status}
          </Badge>
        )}
      </div>

      {errorMsg && <p className="text-xs text-destructive">{errorMsg}</p>}
    </div>
  );
}
