import { Link } from 'react-router-dom';
import { Lock, KeyRound, Globe, X } from 'lucide-react';
import { AuctionStatusBadge, Countdown } from '@/components';
import { truncateAddress, sanitizeExternalUrl } from '@fairdrop/sdk/format';
import { GateMode } from '@fairdrop/types/domain';
import type { AuctionView } from '@fairdrop/types/domain';
import { IPFS_GATEWAY } from '@/env';
import { AppRoutes } from '@/config';
import { getRegistrySlot } from '../registry';
import { LetterAvatar } from './LetterAvatar';

interface AuctionHeaderProps {
  auction: AuctionView;
}

export function AuctionHeader({ auction }: AuctionHeaderProps) {
  const slot    = getRegistrySlot(auction.type);
  const name    = auction.metadata?.name ?? truncateAddress(auction.id);
  const logoUrl = auction.metadata?.logoIpfs
    ? `${IPFS_GATEWAY}/${auction.metadata.logoIpfs}`
    : null;
  const website = auction.metadata?.website
    ? sanitizeExternalUrl(auction.metadata.website)
    : null;
  const twitter = auction.metadata?.twitter
    ? sanitizeExternalUrl(auction.metadata.twitter)
    : null;

  const isActive =
    auction.status === 'active' || auction.status === 'clearing';

  return (
    <div className="flex items-start gap-4">
      {/* Logo / fallback */}
      {logoUrl ? (
        <img
          src={logoUrl}
          alt={name}
          crossOrigin="anonymous"
          className="size-16 shrink-0 rounded-xl object-cover"
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
        />
      ) : (
        <LetterAvatar name={name} size="lg" />
      )}

      <div className="min-w-0 flex-1 space-y-1">
        {/* Name + gate/vest icons */}
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="truncate text-xl font-bold text-foreground">{name}</h1>

          {auction.gateMode !== GateMode.Open && (
            <span title={`Gate: ${auction.gateMode}`}>
              {auction.gateMode === GateMode.Merkle
                ? <Lock className="size-4 text-muted-foreground" />
                : <KeyRound className="size-4 text-muted-foreground" />}
            </span>
          )}
          {auction.vestEnabled && (
            <span title="Vesting enabled">
              <Lock className="size-4 text-sky-500" />
            </span>
          )}
        </div>

        {/* Badges + external links */}
        <div className="flex flex-wrap items-center gap-2">
          {slot && (
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${slot.color}`}>
              {slot.label}
            </span>
          )}
          <AuctionStatusBadge status={auction.status} />

          {website && (
            <a href={website} target="_blank" rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground" aria-label="Website">
              <Globe className="size-4" />
            </a>
          )}
          {twitter && (
            <a href={twitter} target="_blank" rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground" aria-label="Twitter/X">
              <X className="size-4" />
            </a>
          )}
        </div>

        {/* Creator */}
        <p className="text-xs text-muted-foreground">
          Creator:{' '}
          <Link
            to={`${AppRoutes.auctions}?creator=${auction.creator}`}
            className="font-mono hover:underline"
          >
            {truncateAddress(auction.creator)}
          </Link>
        </p>
      </div>

      {/* Countdown — top-right when active */}
      {auction.estimatedEnd && isActive && (
        <div className="shrink-0">
          <Countdown
            targetTime={auction.estimatedEnd}
            className="text-xs text-muted-foreground"
          />
        </div>
      )}
    </div>
  );
}
