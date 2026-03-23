import { Spinner } from '@fairdrop/ui';
import { useTransactionStore } from '@/stores/transaction.store';
import { config } from '@/env';

const STATUS_LABELS: Record<string, string> = {
  signing:   'Waiting for wallet…',
  pending:   'Transaction submitted',
  confirmed: 'Confirmed',
  failed:    'Failed',
  rejected:  'Rejected',
};

export function TxStatusStepper() {
  const { status, label, txId, reset } = useTransactionStore();

  if (status === 'idle') return null;

  const isTerminal = status === 'confirmed' || status === 'failed' || status === 'rejected';

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 rounded-xl border border-border bg-background/95 p-4 shadow-lg backdrop-blur-md">
      <div className="flex items-start gap-3">
        <Spinner
          className={`mt-0.5 shrink-0 ${status === 'pending' || status === 'signing' ? 'opacity-100' : 'opacity-0'}`}
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">{label ?? 'Transaction'}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{STATUS_LABELS[status] ?? status}</p>
          {txId && isTerminal && (
            <a
              href={`${config.explorerUrl}/${txId}`}
              target="_blank"
              rel="noreferrer"
              className="mt-1 block text-xs text-primary hover:underline"
            >
              View on explorer →
            </a>
          )}
        </div>
        {isTerminal && (
          <button
            onClick={reset}
            className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
            aria-label="Dismiss"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
