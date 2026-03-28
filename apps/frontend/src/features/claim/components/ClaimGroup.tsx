import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { AuctionStatus } from '@fairdrop/types/domain';
import { Card, CardContent, CardHeader } from '@/components';
import { AUCTION_REGISTRY } from '@/features/auctions/registry';
import { auctionDetailUrl } from '@/config';
import { BidClaimRow } from './BidClaimRow';
import type { ClaimableGroup } from '../hooks/useClaimable';

interface ClaimGroupProps {
  group: ClaimableGroup;
}

const STATUS_CONFIG = {
  [AuctionStatus.Cleared]: {
    description: 'Tokens ready to claim',
    borderClass: 'border-l-emerald-500/50',
    badge:       'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  },
  [AuctionStatus.Voided]: {
    description: 'Refund available',
    borderClass: 'border-l-amber-500/50',
    badge:       'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  },
} as const;

export function ClaimGroup({ group }: ClaimGroupProps) {
  const { auction, auctionId, records } = group;

  const status = auction?.status;
  const cfg    = status ? STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] : undefined;
  const slot   = auction ? AUCTION_REGISTRY[auction.type] : null;
  const name   = auction?.metadata?.name ?? `${auctionId.slice(0, 22)}…`;

  return (
    <Card className={`overflow-hidden border-sky-500/10 border-l-2 bg-gradient-surface shadow-xs ring-1 ring-white/5 ${cfg?.borderClass ?? 'border-l-border/50'}`}>
      <CardHeader className="px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              {slot && (
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${slot.color}`}>
                  {slot.label}
                </span>
              )}
              {cfg && (
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${cfg.badge}`}>
                  {cfg.description}
                </span>
              )}
            </div>
            <p className="text-sm font-semibold leading-tight">{name}</p>
          </div>

          <Link
            to={auctionDetailUrl(auctionId)}
            className="mt-0.5 shrink-0 text-muted-foreground transition-colors hover:text-foreground"
          >
            <ExternalLink className="size-3.5" />
          </Link>
        </div>
      </CardHeader>

      <CardContent className="space-y-2 px-4 pb-4 pt-0">
        <div className="h-px bg-border/40" />
        {records.map((rec, idx) => (
          <BidClaimRow
            key={`${rec.kind}-${idx}`}
            record={rec}
            auction={auction}
          />
        ))}
      </CardContent>
    </Card>
  );
}
