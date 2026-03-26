import { CheckCircle2, ExternalLink, PenSquare, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components';
import { useTransactionTracker, type TrackedTx, type TrackedTxStatus } from '@/providers/transaction-tracker';
import { config } from '@/env';
import { cn } from '@/lib/utils';

const STATUS_META: Record<
  TrackedTxStatus,
  {
    label: string;
    badgeClassName: string;
    accentClassName: string;
    iconClassName: string;
  }
> = {
  signing: {
    label: 'Waiting for wallet',
    badgeClassName: 'border-violet-500/16 bg-violet-500/10 text-violet-700 dark:text-violet-300',
    accentClassName: 'bg-violet-500/70',
    iconClassName: 'text-violet-500 dark:text-violet-400',
  },
  pending: {
    label: 'Pending confirmation',
    badgeClassName: 'border-sky-500/16 bg-sky-500/10 text-sky-700 dark:text-sky-300',
    accentClassName: 'bg-sky-500/70',
    iconClassName: 'text-sky-500 dark:text-sky-400',
  },
  confirmed: {
    label: 'Confirmed',
    badgeClassName: 'border-emerald-500/16 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    accentClassName: 'bg-emerald-500/70',
    iconClassName: 'text-emerald-500 dark:text-emerald-400',
  },
  failed: {
    label: 'Failed',
    badgeClassName: 'border-rose-500/16 bg-rose-500/10 text-rose-700 dark:text-rose-300',
    accentClassName: 'bg-rose-500/70',
    iconClassName: 'text-rose-500 dark:text-rose-400',
  },
  rejected: {
    label: 'Rejected',
    badgeClassName: 'border-amber-500/16 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    accentClassName: 'bg-amber-500/70',
    iconClassName: 'text-amber-500 dark:text-amber-400',
  },
};

const TERMINAL: Set<TrackedTxStatus> = new Set(['confirmed', 'failed', 'rejected']);

function StatusIcon({ status }: { status: TrackedTxStatus }) {
  const meta = STATUS_META[status];

  if (status === 'pending') {
    return <Spinner className={cn('size-4', meta.iconClassName)} />;
  }

  if (status === 'signing') {
    return <PenSquare className={cn('size-4', meta.iconClassName)} />;
  }

  if (status === 'confirmed') {
    return <CheckCircle2 className={cn('size-4', meta.iconClassName)} />;
  }

  return <XCircle className={cn('size-4', meta.iconClassName)} />;
}

function TxRow({ tx }: { tx: TrackedTx }) {
  const meta = STATUS_META[tx.status];

  return (
    <div className="relative overflow-hidden rounded-lg border border-border/70 bg-background/70 px-2.5 py-2 shadow-xs">
      <span className={cn('absolute inset-y-0 left-0 w-0.5', meta.accentClassName)} aria-hidden="true" />

      <div className="pl-1">
        <div className="flex items-center gap-2">
          <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted/60">
            <StatusIcon status={tx.status} />
          </div>

          <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
            {tx.label}
          </p>

          {tx.aleoId ? (
            <a
              href={`${config.explorerUrl}/${tx.aleoId}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
              aria-label="View on explorer"
              title="View on explorer"
            >
              <ExternalLink className="size-3.5" />
            </a>
          ) : null}
        </div>

        <div className="mt-1.5 flex items-center gap-2 pl-8">
          <Badge
            variant="outline"
            className={cn('h-5 rounded-full px-1.5 text-[10px] font-medium', meta.badgeClassName)}
          >
            {meta.label}
          </Badge>

          {tx.aleoId ? (
            <span className="min-w-0 truncate font-mono text-[10px] text-muted-foreground">
              {tx.aleoId}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

interface WizardTxStatusProps {
  trackedIds: string[];
}

export function WizardTxStatus({ trackedIds }: WizardTxStatusProps) {
  const { transactions } = useTransactionTracker();

  const wizardTxs = transactions.filter((t) => trackedIds.includes(t.id));
  if (wizardTxs.length === 0) return null;

  const activeCount = wizardTxs.filter((t) => !TERMINAL.has(t.status)).length;

  return (
    <div className="overflow-hidden rounded-xl border border-sky-500/12 bg-gradient-surface shadow-xs ring-1 ring-white/5 backdrop-blur-sm">
      <div className="border-b border-sky-500/10 px-3 py-2.5">
        <div className="flex items-center gap-2">
          {activeCount > 0 ? <Spinner className="size-3.5 text-sky-500" /> : <CheckCircle2 className="size-3.5 text-emerald-500" />}
          <p className="min-w-0 flex-1 text-sm font-semibold tracking-tight text-foreground">
            Transaction Status
          </p>

          <Badge
            variant="outline"
            className="h-5 rounded-full border-sky-500/16 bg-sky-500/10 px-1.5 text-[10px] font-medium text-sky-700 dark:text-sky-300"
          >
            {wizardTxs.length}
          </Badge>
        </div>
      </div>

      <div className="space-y-1.5 p-2">
        {wizardTxs.map((tx) => (
          <TxRow key={tx.id} tx={tx} />
        ))}
      </div>
    </div>
  );
}
