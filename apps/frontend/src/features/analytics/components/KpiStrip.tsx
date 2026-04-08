import { Skeleton } from '@/components';
import { useDashboardStats } from '@/shared/hooks/useDashboardStats';
import { formatMicrocredits } from '@fairdrop/sdk/credits';

interface KpiCardProps {
  label: string;
  value: string;
}

function KpiCard({ label, value }: KpiCardProps) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border/60 bg-gradient-surface px-4 py-3 shadow-xs ring-1 ring-white/5">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="text-xl font-semibold tabular-nums text-foreground">
        {value}
      </span>
    </div>
  );
}

export function KpiStrip() {
  const { data, isLoading } = useDashboardStats();

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[72px] rounded-xl" />
        ))}
      </div>
    );
  }

  if (!data) return null;

  // Success rate = cleared / all completed (excludes still-active auctions)
  const completed  = data.totalAuctions - data.activeAuctions;
  const successRate = completed > 0
    ? Math.round((data.clearedAuctions / completed) * 100)
    : 0;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      <KpiCard label="Total auctions" value={data.totalAuctions.toLocaleString()} />
      <KpiCard label="Cleared"        value={data.clearedAuctions.toLocaleString()} />
      <KpiCard label="Voided"         value={data.voidedAuctions.toLocaleString()} />
      <KpiCard label="Success rate"   value={`${successRate}%`} />
      <KpiCard label="Total volume"   value={formatMicrocredits(BigInt(data.totalVolume))} />
      <KpiCard label="Avg fill rate"  value={`${Math.round(data.avgFillRate * 100)}%`} />
    </div>
  );
}
