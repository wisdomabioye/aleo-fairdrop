import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Lock, KeyRound } from 'lucide-react';
import { Card, CardContent, Progress, AuctionStatusBadge, Countdown } from '@/components';
import { formatMicrocredits } from '@fairdrop/sdk/credits';
import { truncateAddress } from '@fairdrop/sdk/format';
import { IPFS_GATEWAY } from '@/env';
import { auctionDetailUrl } from '@/config';
import { getRegistrySlot } from '../registry';
import { AuctionStatus, AuctionType, GateMode } from '@fairdrop/types/domain';
import type { AuctionListItem } from '@fairdrop/types/domain';
import { useBlockHeight } from '@/shared/hooks/useBlockHeight';
import { LetterAvatar } from './LetterAvatar';

function CardProgress({ auction }: { auction: AuctionListItem }) {
  const isSealed = auction.type === AuctionType.Sealed;
  const { data: blockHeight = 0 } = useBlockHeight();

  if (isSealed && auction.commitEndBlock != null) {
    const commitEndBlock = auction.commitEndBlock;
    const isRevealPhase  = blockHeight > commitEndBlock;

    if (!isRevealPhase) {
      const total   = commitEndBlock - auction.startBlock;
      const elapsed = blockHeight - auction.startBlock;
      const pct     = total > 0 ? Math.min(100, (elapsed / total) * 100) : 0;
      return (
        <div className="space-y-1">
          <Progress value={pct} className="h-1.5" />
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Commit phase</span>
            <span>{Math.max(0, commitEndBlock - blockHeight).toLocaleString()} blocks to reveal</span>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-1">
        <Progress value={auction.progressPct} className="h-1.5" />
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>{auction.progressPct.toFixed(1)}% revealed</span>
          <span>{Math.max(0, auction.endBlock - blockHeight).toLocaleString()} blocks to close</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <Progress value={auction.progressPct} className="h-1.5" />
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{auction.progressPct.toFixed(1)}% filled</span>
        <span>{auction.saleTokenSymbol ?? 'Token sale'}</span>
      </div>
    </div>
  );
}

interface AuctionCardProps {
  auction: AuctionListItem;
}

export function AuctionCard({ auction }: AuctionCardProps) {
  const slot = getRegistrySlot(auction.type);
  const name = auction.name ?? truncateAddress(auction.id);
  const [imageError, setImageError] = useState(false);

  const clearingPrice = BigInt(auction.clearingPrice ?? 0);
  const currentPrice = BigInt(auction.currentPrice ?? 0);
  const isClearing = clearingPrice > 0n;
  const price = isClearing ? clearingPrice : currentPrice;
  const hasPrice = price > 0n;

  const logoUrl = auction.logoIpfs ? `${IPFS_GATEWAY}/${auction.logoIpfs}` : null;

  const showCountdown =
    auction.estimatedEnd &&
    (auction.status === AuctionStatus.Active || auction.status === AuctionStatus.Clearing);

  return (
    <Link to={auctionDetailUrl(auction.id)} className="group mx-auto flex h-full w-full max-w-[20rem] flex-col">
      <Card className="flex flex-1 flex-col border-border/70 transition-[border-color,box-shadow] group-hover:border-sky-500/12 group-hover:shadow-md">
        <CardContent className="flex flex-1 flex-col gap-3 p-4">

          {/* ── Header ──────────────────────────────────────────────────────── */}
          <div className="flex items-start gap-3">
            {!imageError && logoUrl ? (
              <img
                src={logoUrl}
                alt={name}
                crossOrigin="anonymous"
                className="size-10 shrink-0 rounded-lg border border-border/60 object-cover"
                onError={() => setImageError(true)}
              />
            ) : (
              <LetterAvatar name={name} className="size-10 shrink-0 rounded-lg" />
            )}

            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{name}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {slot ? (
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${slot.color}`}>
                        {slot.label}
                      </span>
                    ) : null}
                    <AuctionStatusBadge status={auction.status} />
                    {auction.gateMode !== GateMode.Open ? (
                      <span className="inline-flex items-center" title={`Gate: ${auction.gateMode}`}>
                        {auction.gateMode === GateMode.Merkle
                          ? <Lock className="size-3 text-muted-foreground" />
                          : <KeyRound className="size-3 text-muted-foreground" />}
                      </span>
                    ) : null}
                    {auction.vestEnabled ? (
                      <span className="inline-flex items-center" title="Vesting enabled">
                        <Lock className="size-3 text-sky-500" />
                      </span>
                    ) : null}
                  </div>
                </div>

                {/* Price block — always reserves width; invisible when absent */}
                <div className={`w-16 shrink-0 text-right ${hasPrice ? '' : 'invisible'}`}>
                  <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/75">
                    {isClearing ? 'Clearing' : 'Current'}
                  </p>
                  <p className="text-sm font-semibold text-foreground">
                    {formatMicrocredits(price)}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Spacer — absorbs any header height variance; anchors bottom sections */}
          <div className="flex-1" />

          {/* ── Progress ────────────────────────────────────────────────────── */}
          <CardProgress auction={auction} />

          {/* ── Footer ──────────────────────────────────────────────────────── */}
          <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <span className="truncate">By {truncateAddress(auction.creator)}</span>
            {showCountdown ? (
              <div className="shrink-0">
                <Countdown targetTime={auction.estimatedEnd!} className="text-[11px]" />
              </div>
            ) : (
              <span className="shrink-0">
                {auction.status === AuctionStatus.Cleared  ? 'Finalized'      :
                 auction.status === AuctionStatus.Voided   ? 'Voided'         :
                 auction.status === AuctionStatus.Ended    ? 'Awaiting close' :
                                                             auction.status}
              </span>
            )}
          </div>

        </CardContent>
      </Card>
    </Link>
  );
}
