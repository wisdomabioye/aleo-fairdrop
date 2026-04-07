import { Link } from 'react-router-dom';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatMicrocredits } from '@fairdrop/sdk/credits';
import type { CreatorTier, CreatorReputationStats } from '@fairdrop/types/domain';
import { creatorUrl } from '@/config';
import { cn } from '@/lib/utils';

// ── Tier display config ───────────────────────────────────────────────────────

const TIER_CONFIG: Record<CreatorTier, { label: string; color: string; icon: string }> = {
  none:   { label: 'Unrated',  color: 'text-muted-foreground',                              icon: '○' },
  bronze: { label: 'Bronze',   color: 'text-amber-600 dark:text-amber-400',                 icon: '◈' },
  silver: { label: 'Silver',   color: 'text-slate-400 dark:text-slate-300',                 icon: '◈' },
  gold:   { label: 'Gold',     color: 'text-yellow-500 dark:text-yellow-300',               icon: '◈' },
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface CreatorBadgeProps {
  tier:  CreatorTier | null;
  stats?: CreatorReputationStats | null;
  /** 'sm' = icon only, 'md' = icon + fill rate, 'lg' = full stats card */
  size?: 'sm' | 'md' | 'lg';
  /** Creator address — used to link to creator page from 'lg' variant. */
  address?: string;
  className?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CreatorBadge({ tier, stats, size = 'sm', address, className }: CreatorBadgeProps) {
  if (!tier || tier === 'none') return null;

  const { label, color, icon } = TIER_CONFIG[tier];
  const fillPct = stats ? `${(stats.fillRate * 100).toFixed(0)}%` : null;

  if (size === 'sm') {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={cn('inline-flex items-center text-xs font-semibold cursor-default', color, className)}>
            {icon}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {label} creator{fillPct ? ` · ${fillPct} fill rate` : ''}
        </TooltipContent>
      </Tooltip>
    );
  }

  if (size === 'md') {
    return (
      <span className={cn('inline-flex items-center gap-1 text-xs font-medium', color, className)}>
        <span>{icon}</span>
        <span>{label}</span>
        {fillPct ? <span className="text-muted-foreground">· {fillPct}</span> : null}
      </span>
    );
  }

  // lg — full stats card
  return (
    <div className={cn('rounded-xl border border-border/70 bg-background/60 p-4 space-y-3', className)}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-foreground">Creator Reputation</span>
        <span className={cn('text-sm font-semibold', color)}>{icon} {label}</span>
      </div>

      {stats ? (
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg border border-border/60 bg-background/50 px-2 py-2">
            <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/75">Auctions</p>
            <p className="mt-0.5 text-sm font-semibold text-foreground">{stats.auctionsRun}</p>
          </div>
          <div className="rounded-lg border border-border/60 bg-background/50 px-2 py-2">
            <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/75">Filled</p>
            <p className="mt-0.5 text-sm font-semibold text-foreground">{stats.filledAuctions}</p>
          </div>
          <div className="rounded-lg border border-border/60 bg-background/50 px-2 py-2">
            <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/75">Fill rate</p>
            <p className="mt-0.5 text-sm font-semibold text-foreground">{fillPct ?? '—'}</p>
          </div>
        </div>
      ) : null}

      {stats ? (
        <p className="text-xs text-muted-foreground">
          {formatMicrocredits(BigInt(stats.volumeMicrocredits))} total raised across all auctions.
        </p>
      ) : null}

      {address ? (
        <Link
          to={creatorUrl(address)}
          className="block text-center text-xs text-muted-foreground hover:text-foreground underline underline-offset-4"
        >
          View creator profile →
        </Link>
      ) : null}
    </div>
  );
}
