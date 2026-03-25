import { useState } from 'react';
import { CheckCircle2, XCircle, ChevronDown, ChevronUp, X, Trash2, ExternalLink } from 'lucide-react';
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

function TxRow({
  tx,
  onDismiss,
}: {
  tx: TrackedTx;
  onDismiss: () => void;
}) {
  const isTerminal  = TERMINAL.has(tx.status);
  const isActive    = tx.status === 'signing' || tx.status === 'pending';
  const isConfirmed = tx.status === 'confirmed';
  const isFailed    = tx.status === 'failed' || tx.status === 'rejected';

  return (
    <div className="flex items-start gap-2 py-2.5 border-b border-border/50 last:border-0">
      {/* Status icon */}
      <div className="shrink-0 mt-0.5 size-[18px] flex items-center justify-center">
        {isActive    && <Spinner className="size-[18px]" />}
        {isConfirmed && <CheckCircle2 className="size-[18px] text-emerald-500" />}
        {isFailed    && <XCircle className="size-[18px] text-destructive" />}
      </div>

      {/* Label + status stacked */}
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-foreground truncate leading-tight">{tx.label}</p>
        <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">{STATUS_LABEL[tx.status]}</p>
      </div>

      {/* Explorer + dismiss */}
      <div className="shrink-0 flex items-center gap-0.5 mt-0.5">
        {tx.aleoId && (
          <a
            href={`${config.explorerUrl}/${tx.aleoId}`}
            target="_blank"
            rel="noreferrer"
            className="rounded p-0.5 text-muted-foreground hover:text-primary transition-colors"
            aria-label="View on explorer"
          >
            <ExternalLink className="size-3.5" />
          </a>
        )}
        {isTerminal && (
          <button
            onClick={onDismiss}
            className="rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Dismiss"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

// ── TxStatusStepper ───────────────────────────────────────────────────────────

export function TxStatusStepper() {
  const { transactions, removeEntry, clearCompleted } = useTransactionTracker();
  const [collapsed, setCollapsed] = useState(false);

  if (transactions.length === 0) return null;

  const activeCount    = transactions.filter((t) => t.status === 'signing' || t.status === 'pending').length;
  const completedCount = transactions.filter((t) => TERMINAL.has(t.status)).length;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 rounded-xl border border-border bg-background/95 shadow-lg backdrop-blur-md overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/70">
        <div className="flex items-center gap-2">
          {(activeCount > 0 && collapsed) && <Spinner className="size-3.5" />}
          <span className="text-xs font-semibold text-foreground">Transactions</span>

          {activeCount > 0 && (
            <span className="rounded-full bg-primary/15 text-primary px-1.5 py-0.5 text-[10px] font-semibold leading-none">
              {activeCount} active
            </span>
          )}
          {completedCount > 0 && (
            <span className="rounded-full bg-muted text-muted-foreground px-1.5 py-0.5 text-[10px] font-semibold leading-none">
              {completedCount} done
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {completedCount > 0 && (
            <button
              onClick={clearCompleted}
              className="rounded p-1 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Clear completed transactions"
              title="Clear done"
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="rounded p-1 text-muted-foreground hover:text-foreground transition-colors"
            aria-label={collapsed ? 'Expand' : 'Collapse'}
          >
            {collapsed ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          </button>
        </div>
      </div>

      {/* Transaction list */}
      {!collapsed && (
        <div className="max-h-72 overflow-y-auto px-3">
          {transactions.map((tx) => (
            <TxRow
              key={tx.id}
              tx={tx}
              onDismiss={() => removeEntry(tx.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
