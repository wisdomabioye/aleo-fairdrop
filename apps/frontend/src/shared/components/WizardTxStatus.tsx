import { CheckCircle2, XCircle, ExternalLink } from 'lucide-react';
import { Spinner } from '@/components';
import { useTransactionTracker, type TrackedTx, type TrackedTxStatus } from '@/providers/transaction-tracker';
import { config } from '@/env';

// ── Status metadata ───────────────────────────────────────────────────────────

const STATUS_LABEL: Record<TrackedTxStatus, string> = {
  signing:   'Waiting for wallet…',
  pending:   'Submitted — awaiting confirmation',
  confirmed: 'Confirmed',
  failed:    'Failed',
  rejected:  'Rejected',
};

const TERMINAL: Set<TrackedTxStatus> = new Set(['confirmed', 'failed', 'rejected']);

// ── Single row ────────────────────────────────────────────────────────────────

function TxRow({ tx }: { tx: TrackedTx }) {
  const isActive    = tx.status === 'signing' || tx.status === 'pending';
  const isConfirmed = tx.status === 'confirmed';
  const isFailed    = tx.status === 'failed' || tx.status === 'rejected';

  return (
    <div className="flex items-start gap-2 py-2 border-b border-border/40 last:border-0">
      <div className="shrink-0 mt-0.5 size-[18px] flex items-center justify-center">
        {isActive    && <Spinner className="size-[18px]" />}
        {isConfirmed && <CheckCircle2 className="size-[18px] text-emerald-500" />}
        {isFailed    && <XCircle className="size-[18px] text-destructive" />}
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-foreground truncate leading-tight">{tx.label}</p>
        <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">{STATUS_LABEL[tx.status]}</p>
      </div>

      {tx.aleoId && (
        <a
          href={`${config.explorerUrl}/${tx.aleoId}`}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 mt-0.5 rounded p-0.5 text-muted-foreground hover:text-primary transition-colors"
          aria-label="View on explorer"
        >
          <ExternalLink className="size-3.5" />
        </a>
      )}
    </div>
  );
}

// ── WizardTxStatus ────────────────────────────────────────────────────────────

interface WizardTxStatusProps {
  /** Internal tracker IDs for transactions belonging to this wizard/flow. */
  trackedIds: string[];
}

/**
 * Inline (non-floating) transaction status panel, filtered to a specific
 * wizard or flow by its tracker entry IDs. Reusable across any multi-step
 * feature: token launch, create auction, bidding, claiming, etc.
 */
export function WizardTxStatus({ trackedIds }: WizardTxStatusProps) {
  const { transactions } = useTransactionTracker();

  const wizardTxs = transactions.filter((t) => trackedIds.includes(t.id));
  if (wizardTxs.length === 0) return null;

  const hasActive = wizardTxs.some((t) => !TERMINAL.has(t.status));

  return (
    <div className="rounded-xl border border-border bg-muted/20 px-4 py-1">
      <div className="flex items-center gap-2 py-2 mb-0.5">
        {hasActive && <Spinner className="size-3" />}
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Transaction Status
        </span>
      </div>
      {wizardTxs.map((tx) => (
        <TxRow key={tx.id} tx={tx} />
      ))}
    </div>
  );
}
