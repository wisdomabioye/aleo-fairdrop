import { Link } from 'react-router-dom';
import { Lock, KeyRound } from 'lucide-react';
import { Card, CardContent, Progress, AuctionStatusBadge, Countdown } from '@/components';
import { formatMicrocredits } from '@fairdrop/sdk/credits';
import { truncateAddress } from '@fairdrop/sdk/format';
import { IPFS_GATEWAY } from '@/env';
import { auctionDetailUrl } from '@/config';
import { getRegistrySlot } from '../registry';
import { GateMode } from '@fairdrop/types/domain';
import type { AuctionListItem } from '@fairdrop/types/domain';
import { LetterAvatar } from './LetterAvatar';

// ── AuctionCard ───────────────────────────────────────────────────────────────

interface AuctionCardProps {
  auction: AuctionListItem;
}

export function AuctionCard({ auction }: AuctionCardProps) {
  const slot  = getRegistrySlot(auction.type);
  const name  = auction.name ?? truncateAddress(auction.id);
  const clearingPrice = BigInt(auction.clearingPrice ?? 0)
  const currentPrice = BigInt(auction.currentPrice ?? 0)
  const isClearing = clearingPrice > 0n;
  const price = isClearing ? clearingPrice : currentPrice;

  const logoUrl = auction.logoIpfs
    ? `${IPFS_GATEWAY}/${auction.logoIpfs}`
    : null;

  return (
    <Link to={auctionDetailUrl(auction.id)} className="group block">
      <Card className="transition-shadow group-hover:shadow-md">
        <CardContent className="p-4 space-y-3">
          {/* Header row */}
          <div className="flex items-start gap-3">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={name}
                className="size-10 shrink-0 rounded-lg object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  e.currentTarget.nextElementSibling?.removeAttribute('style');
                }}
              />
            ) : null}
            <LetterAvatar name={name} />

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="truncate text-sm font-medium text-foreground">{name}</p>
                {/* Gate/vest icons */}
                {auction.gateMode !== GateMode.Open && (
                  <span title={`Gate: ${auction.gateMode}`}>
                    {auction.gateMode === GateMode.Merkle
                      ? <Lock className="size-3 text-muted-foreground" />
                      : <KeyRound className="size-3 text-muted-foreground" />}
                  </span>
                )}
                {auction.vestEnabled && (
                  <span title="Vesting enabled">
                    <Lock className="size-3 text-sky-500" />
                  </span>
                )}
              </div>
              <div className="mt-0.5 flex items-center gap-2 flex-wrap">
                {slot && (
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${slot.color}`}>
                    {slot.label}
                  </span>
                )}
                <AuctionStatusBadge status={auction.status} />
              </div>
            </div>
          </div>

          {/* Price */}
          {price != null && (
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-muted-foreground">
                {isClearing ? 'Clearing' : 'Current'} price
              </span>
              <span className="text-sm font-semibold">
                {formatMicrocredits(BigInt(price))}
              </span>
            </div>
          )}

          {/* Progress */}
          <div className="space-y-1">
            <Progress value={auction.progressPct} className="h-1.5" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{auction.progressPct.toFixed(1)}% filled</span>
              {auction.saleTokenSymbol && (
                <span>{auction.saleTokenSymbol}</span>
              )}
            </div>
          </div>

          {/* Countdown */}
          {auction.estimatedEnd && (
            <Countdown
              targetTime={auction.estimatedEnd}
              className="text-xs text-muted-foreground"
            />
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
