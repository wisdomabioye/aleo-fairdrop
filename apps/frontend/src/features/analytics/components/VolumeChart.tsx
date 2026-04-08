import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';
import { Skeleton } from '@/components';
import { useVolumeByPeriod } from '../hooks/useAnalytics';

const TICK_STYLE = { fill: 'currentColor', fontSize: 10 } as const;

function formatPeriod(iso: string, bucket: 'weekly' | 'monthly'): string {
  const d = new Date(iso);
  if (bucket === 'monthly') {
    return new Intl.DateTimeFormat('en', { month: 'short', year: '2-digit' }).format(d);
  }
  // Weekly: "Jan 6"
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(d);
}

function formatAleo(microcredits: string): string {
  const aleo = Number(microcredits) / 1_000_000;
  if (aleo >= 1_000_000) return `${(aleo / 1_000_000).toFixed(1)}M`;
  if (aleo >= 1_000)     return `${(aleo / 1_000).toFixed(1)}K`;
  return aleo.toFixed(2);
}

interface VolumeChartProps {
  bucket: 'weekly' | 'monthly';
}

export function VolumeChart({ bucket }: VolumeChartProps) {
  const { data, isLoading } = useVolumeByPeriod(bucket);

  const chartData = (data ?? []).map((row) => ({
    period: formatPeriod(row.period, bucket),
    // Convert to ALEO float for readable Y-axis — tooltip shows formatted ALEO
    aleo:   Number(row.volume) / 1_000_000,
    count:  row.count,
    // Keep raw volume for tooltip
    volume: row.volume,
  }));

  return (
    <div>
      {isLoading ? (
        <Skeleton className="h-[220px] rounded-xl" />
      ) : chartData.length === 0 ? (
        <div className="flex h-[220px] items-center justify-center rounded-xl border border-dashed border-border/60 text-sm text-muted-foreground">
          No cleared auctions yet.
        </div>
      ) : (
        // text-muted-foreground sets CSS `color` so fill="currentColor" in SVG resolves
        <div className="min-w-0 overflow-hidden text-muted-foreground">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
              <defs>
                <linearGradient id="volumeGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.1} />

              <XAxis
                dataKey="period"
                tick={TICK_STYLE}
                axisLine={{ stroke: 'currentColor', strokeOpacity: 0.15 }}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tickFormatter={(v: number) => `${formatAleo(String(Math.round(v * 1_000_000)))} ALEO`}
                tick={TICK_STYLE}
                axisLine={false}
                tickLine={false}
                width={72}
              />

              <Tooltip
                formatter={(_v: number, _name: string, entry: { payload?: { volume?: string; count?: number } }) => [
                  `${formatAleo(entry.payload?.volume ?? '0')} ALEO (${entry.payload?.count ?? 0} auctions)`,
                  'Volume',
                ]}
                labelFormatter={(label: string) => label}
                contentStyle={{
                  background:   'var(--background)',
                  border:       '1px solid color-mix(in oklch, currentColor 20%, transparent)',
                  borderRadius: '8px',
                  fontSize:     12,
                  color:        'var(--foreground)',
                }}
              />

              <Area
                type="monotone"
                dataKey="aleo"
                name="Volume"
                stroke="#3b82f6"
                strokeWidth={2}
                fill="url(#volumeGradient)"
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

