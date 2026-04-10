/**
 * Shared UI primitives for DEX forms.
 * Mirrors the pattern in auctions/bid-forms/_parts.tsx.
 */

import { Link } from 'react-router-dom';
import {
  Button,
  Label,
  Spinner,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components';
import { AppRoutes } from '@/config';
import { formatAmount } from '@fairdrop/sdk/format';
import { cn } from '@/lib/utils';
import type { WalletTokenRecord } from '@fairdrop/types/primitives';
import type { WalletLpRecord } from '@fairdrop/types/primitives';

// ── Token record selector (private swap / add-liquidity) ─────────────────────

interface TokenRecordSelectProps {
  records:   WalletTokenRecord[];
  loading:   boolean;
  value:     string;
  onChange:  (id: string) => void;
  decimals:  number;
  symbol?:   string | null;
  error?:    string | null;
  label?:    string;
}

export function TokenRecordSelect({
  records,
  loading,
  value,
  onChange,
  decimals,
  symbol,
  error,
  label = 'Token record',
}: TokenRecordSelectProps) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>

      {records.length > 0 ? (
        <>
          <Select value={value} onValueChange={onChange}>
            <SelectTrigger className="h-8 w-full text-xs">
              <SelectValue placeholder={loading ? 'Loading records…' : 'Select record'} />
            </SelectTrigger>
            <SelectContent>
              {records.map((r, i) => (
                <SelectItem key={r.id} value={r.id} className="text-xs">
                  {`Record ${i + 1} · ${formatAmount(r.amount, decimals)}${symbol ? ` ${symbol}` : ''}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {error
            ? <p className="text-[11px] text-destructive">{error}</p>
            : <p className="text-[11px] text-muted-foreground">Full record amount will be consumed.</p>}
        </>
      ) : (
        <div className="rounded-xl border border-border/70 bg-background/50 px-3 py-2.5 text-xs text-muted-foreground">
          {loading ? 'Loading private records…' : (
            <>
              No private token records.{' '}
              <Link
                to={AppRoutes.shield}
                className="font-medium text-foreground underline underline-offset-4"
              >
                Shield tokens
              </Link>.
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── LP record selector (private remove-liquidity) ────────────────────────────

interface LpRecordSelectProps {
  records:  WalletLpRecord[];
  loading:  boolean;
  value:    string;
  onChange: (id: string) => void;
  error?:   string | null;
  label?:   string;
}

export function LpRecordSelect({
  records,
  loading,
  value,
  onChange,
  error,
  label = 'LP record',
}: LpRecordSelectProps) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>

      {records.length > 0 ? (
        <>
          <Select value={value} onValueChange={onChange}>
            <SelectTrigger className="h-8 w-full text-xs">
              <SelectValue placeholder={loading ? 'Loading records…' : 'Select LP record'} />
            </SelectTrigger>
            <SelectContent>
              {records.map((r, i) => (
                <SelectItem key={r.id} value={r.id} className="text-xs">
                  {`LP Record ${i + 1} · ${r.amount.toLocaleString()} LP`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {error
            ? <p className="text-[11px] text-destructive">{error}</p>
            : <p className="text-[11px] text-muted-foreground">Full LP amount will be burned.</p>}
        </>
      ) : (
        <div className="rounded-xl border border-border/70 bg-background/50 px-3 py-2.5 text-xs text-muted-foreground">
          {loading ? 'Loading LP records…' : 'No private LP records for this pool.'}
        </div>
      )}
    </div>
  );
}

// ── Summary panels ───────────────────────────────────────────────────────────

type SummaryRow = [label: string, value: string] | null | false | undefined;

interface DexSummaryPanelProps {
  title?: string;
  rows:   SummaryRow[];
}

export function SwapPreviewPanel({ title = 'Swap Preview', rows }: DexSummaryPanelProps) {
  return <DexSummaryPanel title={title} rows={rows} />;
}

export function LiquidityPreviewPanel({ title = 'Liquidity Preview', rows }: DexSummaryPanelProps) {
  return <DexSummaryPanel title={title} rows={rows} />;
}

function DexSummaryPanel({ title, rows }: DexSummaryPanelProps) {
  const valid = rows.filter((r): r is [string, string] => !!r);
  if (!valid.length) return null;

  return (
    <div className="rounded-xl border border-border/70 bg-background/50 px-3 py-3">
      <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground/80">
        {title}
      </p>
      <div className="space-y-1.5 text-xs">
        {valid.map(([label, val]) => (
          <div key={label} className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">{label}</span>
            <span className="font-medium text-foreground">{val}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Submit button ────────────────────────────────────────────────────────────

interface DexSubmitButtonProps {
  busy:     boolean;
  waiting:  boolean;
  disabled: boolean;
  onClick:  () => void;
  label:    string;
}

export function DexSubmitButton({ busy, waiting, disabled, onClick, label }: DexSubmitButtonProps) {
  return (
    <Button type="button" className="w-full" disabled={disabled} onClick={onClick}>
      {busy    ? <><Spinner className="mr-2 h-3 w-3" />Authorizing…</>
       : waiting ? <><Spinner className="mr-2 h-3 w-3" />Confirming…</>
       : label}
    </Button>
  );
}

// ── Error banner ─────────────────────────────────────────────────────────────

export function DexErrorBanner({ error }: { error: Error | null | undefined }) {
  if (!error) return null;
  return (
    <div className="rounded-lg border border-destructive/15 bg-destructive/5 px-3 py-2 text-xs text-destructive">
      {error.message}
    </div>
  );
}

// ── Blocker notice ───────────────────────────────────────────────────────────

export function DexFormBlockerNotice({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return (
    <div className={cn('rounded-lg border border-border/70 bg-background/60 px-3 py-2 text-xs text-muted-foreground')}>
      {message}
    </div>
  );
}
