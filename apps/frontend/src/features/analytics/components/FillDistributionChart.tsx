import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';
import { Skeleton } from '@/components';
import { AUCTION_REGISTRY } from '@/features/auctions/registry';
import { AuctionType } from '@fairdrop/types/domain';
import type { FillBucket } from '@fairdrop/types/api';
import { useFillDistribution } from '../hooks/useAnalytics';

const TICK_STYLE = { fill: 'currentColor', fontSize: 10 } as const;

// Types in each histogram, derived from registry — no hardcoded strings
const SUPPLY_TYPES = Object.values(AuctionType).filter(
  (t) => !AUCTION_REGISTRY[t].hasRaiseTarget,
);
const RAISE_TYPES = Object.values(AuctionType).filter(
  (t) => AUCTION_REGISTRY[t].hasRaiseTarget,
);

function typeLabels(types: AuctionType[]): string {
  return types.map((t) => AUCTION_REGISTRY[t].label).join(', ');
}

interface HistogramProps {
  label:    string;
  subtitle: string;
  data:     FillBucket[];
  color:    string;
}

function Histogram({ label, subtitle, data, color }: HistogramProps) {
  const total = data.reduce((s, b) => s + b.count, 0);

  if (total === 0) {
    return (
      <div className="space-y-2">
        <div>
          <p className="text-xs font-medium text-foreground">{label}</p>
          <p className="text-[11px] text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex h-[160px] items-center justify-center rounded-xl border border-dashed border-border/60 text-xs text-muted-foreground">
          No data yet.
        </div>
      </div>
    );
  }

  const chartData = data.map((b) => ({
    name:  `${b.bucketFloor}–${b.bucketFloor + 10}%`,
    count: b.count,
  }));

  return (
    <div className="min-w-0 space-y-2 overflow-hidden text-muted-foreground">
      <div>
        <p className="text-xs font-medium text-foreground">{label}</p>
        <p className="text-[11px] text-muted-foreground">{subtitle}</p>
      </div>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.1} vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ ...TICK_STYLE, fontSize: 9 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={TICK_STYLE}
            axisLine={false}
            tickLine={false}
            width={28}
            allowDecimals={false}
          />
          <Tooltip
            formatter={(v: number) => [v, 'Auctions']}
            contentStyle={{
              background:   'var(--background)',
              border:       '1px solid color-mix(in oklch, currentColor 20%, transparent)',
              borderRadius: '8px',
              fontSize:     11,
              color:        'var(--foreground)',
            }}
          />
          <Bar dataKey="count" fill={color} radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function FillDistributionChart() {
  const { data, isLoading } = useFillDistribution();

  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-[200px] rounded-xl" />
        <Skeleton className="h-[200px] rounded-xl" />
      </div>
    );
  }

  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <Histogram
        label="Supply fill"
        subtitle={`Fill % at close · ${typeLabels(SUPPLY_TYPES)}`}
        data={data?.supplyFill ?? []}
        color="#3b82f6"
      />
      <Histogram
        label="Raise fill"
        subtitle={`Funding goal reached · ${typeLabels(RAISE_TYPES)}`}
        data={data?.raiseFill ?? []}
        color="#22c55e"
      />
    </div>
  );
}
