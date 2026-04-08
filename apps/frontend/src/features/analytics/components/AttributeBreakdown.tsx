import { Skeleton } from '@/components';
import { GateMode } from '@fairdrop/types/domain';
import { useAttributeBreakdown } from '../hooks/useAnalytics';

const GATE_COLORS: Record<GateMode, string> = {
  [GateMode.Open]:       'bg-sky-500',
  [GateMode.Merkle]:     'bg-violet-500',
  [GateMode.Credential]: 'bg-amber-500',
};

const GATE_LABELS: Record<GateMode, string> = {
  [GateMode.Open]:       'Open',
  [GateMode.Merkle]:     'Merkle',
  [GateMode.Credential]: 'Credential',
};

interface ProportionBarProps {
  label:   string;
  count:   number;
  total:   number;
  color:   string;
}

function ProportionBar({ label, count, total, color }: ProportionBarProps) {
  const pct   = total > 0 ? Math.round((count / total) * 100) : 0;
  const barW  = total > 0 ? (count / total) * 100 : 0;

  return (
    <div className="group flex items-center gap-3">
      <span className="w-20 shrink-0 truncate text-[11px] text-muted-foreground transition-colors group-hover:text-foreground">
        {label}
      </span>
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${barW}%` }}
        />
      </div>
      <div className="flex w-16 shrink-0 items-center justify-end gap-1.5">
        <span className="text-xs font-semibold tabular-nums text-foreground">
          {count.toLocaleString()}
        </span>
        <span className="text-[10px] tabular-nums text-muted-foreground/60">
          {pct}%
        </span>
      </div>
    </div>
  );
}

export function AttributeBreakdown() {
  const { data, isLoading } = useAttributeBreakdown();

  if (isLoading) {
    return (
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-5 rounded-md" />)}
        </div>
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-5 rounded-md" />)}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const gateModes  = Object.values(GateMode);
  const gateTotal  = gateModes.reduce((s, m) => s + (data.gateMode[m] ?? 0), 0);
  const vestTotal  = data.vesting.enabled + data.vesting.disabled;

  return (
    <div className="grid gap-6 sm:grid-cols-2">
      {/* Gate mode */}
      <div className="space-y-2.5">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Gate mode
        </p>
        <div className="space-y-2">
          {gateModes.map((mode) => (
            <ProportionBar
              key={mode}
              label={GATE_LABELS[mode]}
              count={data.gateMode[mode] ?? 0}
              total={gateTotal}
              color={GATE_COLORS[mode]}
            />
          ))}
        </div>
      </div>

      {/* Vesting */}
      <div className="space-y-2.5">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Vesting adoption
        </p>
        <div className="space-y-2">
          <ProportionBar label="Vesting on"  count={data.vesting.enabled}  total={vestTotal} color="bg-emerald-500" />
          <ProportionBar label="No vesting"  count={data.vesting.disabled} total={vestTotal} color="bg-muted-foreground/40" />
        </div>
        {vestTotal > 0 && (
          <p className="text-[11px] text-muted-foreground">
            {Math.round((data.vesting.enabled / vestTotal) * 100)}% of auctions use vesting
          </p>
        )}
      </div>
    </div>
  );
}
