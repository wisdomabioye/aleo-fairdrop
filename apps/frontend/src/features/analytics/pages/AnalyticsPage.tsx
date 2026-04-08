import { type ReactNode, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { KpiStrip }              from '../components/KpiStrip';
import { VolumeChart }           from '../components/VolumeChart';
import { TypePerformanceTable }  from '../components/TypePerformanceTable';
import { FillDistributionChart } from '../components/FillDistributionChart';
import { AttributeBreakdown }    from '../components/AttributeBreakdown';
import { CreatorLeaderboard }    from '../components/CreatorLeaderboard';

// ── Section wrapper ───────────────────────────────────────────────────────────

interface SectionProps {
  title:    string;
  action?:  ReactNode;
  children: ReactNode;
}

function Section({ title, action, children }: SectionProps) {
  return (
    <Card className="border-sky-500/10 bg-gradient-surface shadow-xs ring-1 ring-white/5">
      <CardContent className="p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {title}
          </p>
          {action}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

// ── Toggle pill — shared between VolumeChart and CreatorLeaderboard ───────────

interface ToggleProps<T extends string> {
  options: { value: T; label: string }[];
  value:   T;
  onChange: (v: T) => void;
}

function TogglePill<T extends string>({ options, value, onChange }: ToggleProps<T>) {
  return (
    <div className="flex gap-1 rounded-lg border border-border/60 bg-muted/40 p-0.5 text-[11px]">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={[
            'rounded-md px-2.5 py-1 font-medium transition-colors',
            value === opt.value
              ? 'bg-background text-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground',
          ].join(' ')}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

type VolumeBucket   = 'weekly' | 'monthly';
type CreatorSortKey = 'volume' | 'fillRate' | 'auctionsRun' | 'bidCount';

const VOLUME_OPTIONS: { value: VolumeBucket; label: string }[] = [
  { value: 'weekly',  label: 'Weekly'  },
  { value: 'monthly', label: 'Monthly' },
];

const CREATOR_SORT_OPTIONS: { value: CreatorSortKey; label: string }[] = [
  { value: 'volume',      label: 'Volume'    },
  { value: 'fillRate',    label: 'Fill rate' },
  { value: 'auctionsRun', label: 'Auctions'  },
  { value: 'bidCount',    label: 'Bids'      },
];

// ── Page ──────────────────────────────────────────────────────────────────────

export function AnalyticsPage() {
  const [volumeBucket, setVolumeBucket]   = useState<VolumeBucket>('weekly');
  const [creatorSort,  setCreatorSort]    = useState<CreatorSortKey>('volume');

  return (
    <div className="space-y-5 p-4 sm:p-5 lg:p-6">
      {/* Page header */}
      <div>
        <h1 className="text-lg font-semibold tracking-tight text-foreground">Analytics</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Historical protocol health — trends, outcomes, and creator performance.
        </p>
      </div>

      {/* KPI strip */}
      <KpiStrip />

      {/* Volume over time */}
      <Section
        title="Volume over time"
        action={
          <TogglePill
            options={VOLUME_OPTIONS}
            value={volumeBucket}
            onChange={setVolumeBucket}
          />
        }
      >
        <VolumeChart bucket={volumeBucket} />
      </Section>

      {/* Type performance + Fill distribution */}
      <div className="grid gap-5 xl:grid-cols-2">
        <Section title="Auction type performance">
          <TypePerformanceTable />
        </Section>

        <Section title="Fill distribution">
          <FillDistributionChart />
        </Section>
      </div>

      {/* Gate mode + Vesting */}
      <Section title="Attributes">
        <AttributeBreakdown />
      </Section>

      {/* Creator leaderboard */}
      <Section
        title="Creator leaderboard"
        action={
          <TogglePill
            options={CREATOR_SORT_OPTIONS}
            value={creatorSort}
            onChange={setCreatorSort}
          />
        }
      >
        <CreatorLeaderboard sort={creatorSort} />
      </Section>
    </div>
  );
}
