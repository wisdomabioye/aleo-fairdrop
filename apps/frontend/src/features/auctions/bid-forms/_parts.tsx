/**
 * Shared UI primitives for bid forms.
 *
 * All bid forms share the same mode toggle, credit record selector,
 * referral input, summary panel, submit button, and error/blocker banners.
 * Import from here instead of copy-pasting.
 */

import { Link } from 'react-router-dom';
import { Eye, Shield } from 'lucide-react';
import {
  Button,
  Input,
  Label,
  Spinner,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components';
import { AppRoutes } from '@/config';
import { formatMicrocredits } from '@fairdrop/sdk/credits';
import { cn } from '@/lib/utils';
import type { WalletCreditRecord } from '@fairdrop/types/primitives';

// ── Mode toggle ───────────────────────────────────────────────────────────────

interface BidModeToggleProps {
  mode:     'private' | 'public';
  onChange: (mode: 'private' | 'public') => void;
}

export function BidModeToggle({ mode, onChange }: BidModeToggleProps) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {(['private', 'public'] as const).map((value) => {
        const active = mode === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => onChange(value)}
            className={cn(
              'flex h-9 items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-medium transition-colors',
              active
                ? 'border-sky-500/16 bg-sky-500/10 text-sky-700 dark:text-sky-300'
                : 'border-border/70 bg-background/50 text-muted-foreground hover:border-sky-500/10 hover:text-foreground',
            )}
          >
            {value === 'private' ? <Shield className="size-3.5" /> : <Eye className="size-3.5" />}
            {value === 'private' ? 'Private' : 'Public'}
          </button>
        );
      })}
    </div>
  );
}

// ── Credits record selector ───────────────────────────────────────────────────

interface CreditRecordSelectProps {
  records:  WalletCreditRecord[];
  loading:  boolean;
  value:    string;
  onChange: (id: string) => void;
  error?:   string | null;
  label?:   string;
}

export function CreditRecordSelect({
  records,
  loading,
  value,
  onChange,
  error,
  label = 'Payment source',
}: CreditRecordSelectProps) {
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
                  {`Record ${i + 1} · ${formatMicrocredits(r.microcredits)} ALEO`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {error
            ? <p className="text-[11px] text-destructive">{error}</p>
            : <p className="text-[11px] text-muted-foreground">Choose the shielded record used to fund this bid.</p>}
        </>
      ) : (
        <div className="rounded-xl border border-border/70 bg-background/50 px-3 py-2.5 text-xs text-muted-foreground">
          {loading ? 'Loading private records…' : (
            <>
              No private credits records.{' '}
              <Link
                to={AppRoutes.shield}
                className="font-medium text-foreground underline underline-offset-4"
              >
                Shield credits
              </Link>.
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Referral input ────────────────────────────────────────────────────────────

interface ReferralInputProps {
  value:    string;
  onChange: (value: string) => void;
  show:     boolean;
  onToggle: () => void;
  inputId?: string;
}

export function ReferralInput({ value, onChange, show, onToggle, inputId }: ReferralInputProps) {
  if (!show && !value) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className="text-left text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        + Add referral code
      </button>
    );
  }

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={onToggle}
        className="text-left text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        {show ? '− Hide referral code' : '+ Add referral code'}
      </button>

      {show && (
        <div className="space-y-1.5">
          <Label htmlFor={inputId}>Referral code</Label>
          <Input
            id={inputId}
            placeholder="Optional"
            value={value}
            className="h-8 text-xs"
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      )}
    </div>
  );
}

// ── Cost summary panel ────────────────────────────────────────────────────────

type SummaryRow = [label: string, value: string] | null | false | undefined;

interface BidSummaryPanelProps {
  title?: string;
  rows:   SummaryRow[];
}

export function BidSummaryPanel({ title = 'Cost', rows }: BidSummaryPanelProps) {
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

// ── Submit button ─────────────────────────────────────────────────────────────

interface BidSubmitButtonProps {
  busy:     boolean;
  waiting:  boolean;
  disabled: boolean;
  onClick:  () => void;
  label:    string;
}

export function BidSubmitButton({ busy, waiting, disabled, onClick, label }: BidSubmitButtonProps) {
  return (
    <Button type="button" className="w-full" disabled={disabled} onClick={onClick}>
      {busy    ? <><Spinner className="mr-2 h-3 w-3" />Authorizing…</>
       : waiting ? <><Spinner className="mr-2 h-3 w-3" />Confirming…</>
       : label}
    </Button>
  );
}

// ── Error banner ──────────────────────────────────────────────────────────────

export function BidErrorBanner({ error }: { error: Error | null | undefined }) {
  if (!error) return null;
  return (
    <div className="rounded-lg border border-destructive/15 bg-destructive/5 px-3 py-2 text-xs text-destructive">
      {error.message}
    </div>
  );
}

// ── Form blocker notice ───────────────────────────────────────────────────────

export function FormBlockerNotice({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return (
    <div className="rounded-lg border border-border/70 bg-background/60 px-3 py-2 text-xs text-muted-foreground">
      {message}
    </div>
  );
}
