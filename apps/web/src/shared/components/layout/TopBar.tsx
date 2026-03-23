import type { ReactNode } from 'react';
import { config } from '@/env';
import { useIndexerStatus } from '@/hooks/useIndexerStatus';

// ── IndexerStatus ────────────────────────────────────────────────────────────

type StatusLevel = 'live' | 'delayed' | 'lagging' | 'offline';

function getStatusLevel(lagBlocks: number): StatusLevel {
  if (lagBlocks <= 5)  return 'live';
  if (lagBlocks <= 20) return 'delayed';
  if (lagBlocks <= 50) return 'lagging';
  return 'offline';
}

const STATUS_DOT: Record<StatusLevel, string> = {
  live:    'bg-emerald-500',
  delayed: 'bg-yellow-400',
  lagging: 'bg-orange-500',
  offline: 'bg-rose-500',
};

const STATUS_LABEL: Record<StatusLevel, string> = {
  live:    'Live',
  delayed: 'Delayed',
  lagging: 'Lagging',
  offline: 'Offline',
};

function IndexerStatusBadge() {
  const { data, isError } = useIndexerStatus();

  const level: StatusLevel =
    isError || !data ? 'offline' : getStatusLevel(data.lagBlocks);

  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={`size-2 rounded-full ${STATUS_DOT[level]}`} aria-hidden="true" />
      {STATUS_LABEL[level]}
    </span>
  );
}

// ── StaleBanner ──────────────────────────────────────────────────────────────

function StaleBanner({ lagBlocks }: { lagBlocks: number }) {
  if (lagBlocks <= 50) return null;
  return (
    <div className="border-b border-yellow-500/30 bg-yellow-500/10 px-4 py-1.5 text-center text-xs text-yellow-600 dark:text-yellow-400">
      Indexer is {lagBlocks} blocks behind chain tip — data may be stale.
    </div>
  );
}

// ── TopBar ───────────────────────────────────────────────────────────────────

interface TopBarProps {
  trigger?: ReactNode;
  actions?: ReactNode;
}

export function TopBar({ trigger, actions }: TopBarProps) {
  const { data } = useIndexerStatus();

  return (
    <>
      {data && <StaleBanner lagBlocks={data.lagBlocks} />}
      <header className="flex h-14 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur-md">
        {trigger}

        {/* Network badge — static from env */}
        <span className="rounded-md border border-border px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {config.network}
        </span>

        <div className="flex-1" />

        <IndexerStatusBadge />

        {actions}
      </header>
    </>
  );
}
