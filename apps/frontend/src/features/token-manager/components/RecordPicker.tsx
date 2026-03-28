/**
 * RecordPicker — selectable list of WalletTokenRecord rows.
 * Caller is responsible for pre-filtering records before passing them in.
 */
import { formatAmount } from '@fairdrop/sdk/format';
import type { WalletTokenRecord } from '@fairdrop/types/primitives';
import type { TokenMetadata }     from '@fairdrop/types/domain';
import { cn } from '@/lib/utils';

export interface RecordPickerProps {
  records:       WalletTokenRecord[];
  metaMap:       Map<string, TokenMetadata>;
  selected:      WalletTokenRecord | null;
  onSelect:      (r: WalletTokenRecord) => void;
  disabled?:     boolean;
  emptyMessage?: string;
}

export function RecordPicker({
  records,
  metaMap,
  selected,
  onSelect,
  disabled,
  emptyMessage = 'No records found.',
}: RecordPickerProps) {
  if (records.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">{emptyMessage}</p>
    );
  }

  return (
    <div className="space-y-1.5">
      {records.map((rec, i) => {
        const meta       = metaMap.get(rec.token_id);
        const isSelected = selected?.id === rec.id;

        return (
          <button
            key={rec.id}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(rec)}
            className={cn(
              'w-full rounded-lg border px-3 py-2.5 text-left transition-colors',
              isSelected
                ? 'border-sky-500/40 bg-sky-500/8 ring-1 ring-sky-500/20'
                : 'border-border hover:border-sky-500/20 hover:bg-muted/40',
              disabled && 'cursor-not-allowed opacity-50',
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className={cn(
                  'flex size-5 shrink-0 items-center justify-center rounded text-[10px] font-semibold',
                  isSelected ? 'bg-sky-500/20 text-sky-300' : 'bg-muted text-muted-foreground',
                )}>
                  {i + 1}
                </span>
                <span className={cn('text-sm font-semibold tabular-nums', isSelected && 'text-sky-200')}>
                  {formatAmount(rec.amount, meta?.decimals ?? 0)}
                  {meta?.symbol && (
                    <span className="ml-1.5 font-normal text-muted-foreground">{meta.symbol}</span>
                  )}
                </span>
              </div>
              <span className="shrink-0 font-mono text-[10px] text-muted-foreground/50">
                {rec.token_id.slice(0, 10)}…
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
