import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Check,
  Copy,
  Globe,
  Hash,
  KeyRound,
  Lock,
  Target,
  TimerIcon,
  X,
} from 'lucide-react';
import { AuctionStatusBadge, Countdown } from '@/components';
import { Badge } from '@/components/ui/badge';
import { truncateAddress, sanitizeExternalUrl } from '@fairdrop/sdk/format';
import { AuctionStatus, AuctionType, GateMode } from '@fairdrop/types/domain';
import type { AuctionView } from '@fairdrop/types/domain';
import { IPFS_GATEWAY } from '@/env';
import { AppRoutes } from '@/config';
import { cn } from '@/lib/utils';
import { getRegistrySlot } from '../registry';
import { LetterAvatar } from './LetterAvatar';
import { formatMicrocredits } from '@fairdrop/sdk/credits';

interface AuctionHeaderProps {
  auction: AuctionView;
  currentPrice?: bigint | number;
}

function MetaChip({
  icon: Icon,
  label,
  value,
  asButton,
  onClick,
  copied,
}: {
  icon: typeof Hash;
  label: string;
  value: React.ReactNode;
  asButton?: boolean;
  onClick?: () => void;
  copied?: boolean;
}) {
  const Comp = asButton ? 'button' : 'div';

  return (
    <Comp
      type={asButton ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'inline-flex h-7 max-w-full items-center gap-1.5 rounded-lg border border-border/60 bg-background/50 px-2 text-[11px]',
        asButton &&
          'transition-[border-color,background-color,color] hover:border-sky-500/12 hover:bg-background/70 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-sky-400/15'
      )}
    >
      <Icon className="size-3 shrink-0 text-muted-foreground" />
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate font-medium text-foreground/90">{value}</span>
      {asButton ? (
        copied ? (
          <Check className="size-3 shrink-0 text-emerald-500" />
        ) : (
          <Copy className="size-3 shrink-0 text-muted-foreground" />
        )
      ) : null}
    </Comp>
  );
}

function InlineStat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: React.ReactNode;
  icon: typeof Hash;
}) {
  return (
    <div className="inline-flex min-w-0 items-center gap-2 rounded-lg border border-border/60 bg-background/50 px-2.5 py-1.5">
      <Icon className="size-3 shrink-0 text-muted-foreground" />
      <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/70">
        {label}
      </span>
      <span className="min-w-0 truncate text-xs font-medium text-foreground/90">
        {value}
      </span>
    </div>
  );
}

function formatBlock(value: number | bigint | undefined) {
  if (value == null) return null;
  return typeof value === 'bigint' ? value.toString() : value.toLocaleString();
}

export function AuctionHeader({ auction, currentPrice }: AuctionHeaderProps) {
  const slot = getRegistrySlot(auction.type);
  const name = auction.metadata?.name ?? truncateAddress(auction.id);
  const description = auction.metadata?.description;
  const logoUrl = auction.metadata?.logoIpfs
    ? `${IPFS_GATEWAY}/${auction.metadata.logoIpfs}`
    : null;
  const website = auction.metadata?.website
    ? sanitizeExternalUrl(auction.metadata.website)
    : null;
  const twitter = auction.metadata?.twitter
    ? sanitizeExternalUrl(auction.metadata.twitter)
    : null;
  
  const [copied, setCopied] = useState(false);
  const [imageError, setImageError] = useState(false);

  const commitEndBlock = useMemo(() => {
    const candidate = auction.commitEndBlock;
    return candidate;
  }, [auction]);

  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  const copyCreator = async () => {
    await navigator.clipboard.writeText(auction.creator);
    setCopied(true);
  };

  const isActive = auction.status === AuctionStatus.Active || auction.status === AuctionStatus.Clearing;
  const isRaise = auction.type === AuctionType.Raise;
  const isSealed = auction.type === AuctionType.Sealed;
  const priceLabel = isSealed
    ? (auction.status === AuctionStatus.Clearing || auction.status === AuctionStatus.Cleared ? 'Clearing price' : 'Dutch ref.')
    : (auction.status === AuctionStatus.Clearing ? 'Clearing price' : 'Current price');

  return (
    <div className="overflow-hidden rounded-xl border border-sky-500/10 bg-gradient-surface shadow-xs ring-1 ring-white/5">
      <div className="space-y-3 px-3.5 py-3.5 sm:px-4 sm:py-4">
        <div className="flex min-w-0 items-start gap-3">
          {!imageError && logoUrl ? (
            <img
              src={logoUrl}
              alt={name}
              crossOrigin="anonymous"
              className="size-16 shrink-0 rounded-xl border border-sky-500/10 object-cover shadow-xs sm:size-18"
              onError={() => setImageError(true)}
            />
          ) : (
            <LetterAvatar
              name={name}
              size="lg"
              className="size-16 shrink-0 rounded-xl sm:size-18"
            />
          )}

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <h1 className="min-w-0 truncate text-lg font-semibold tracking-tight text-foreground sm:text-xl">
                {name}
              </h1>

              {slot ? (
                <Badge
                  variant="outline"
                  className={cn(
                    'h-5 rounded-full px-1.5 text-[10px] font-medium',
                    slot.color
                  )}
                >
                  {slot.label}
                </Badge>
              ) : null}

              <AuctionStatusBadge status={auction.status} />

              {auction.gateMode !== GateMode.Open ? (
                <Badge
                  variant="outline"
                  className="h-5 rounded-full px-1.5 text-[10px] font-medium"
                >
                  {auction.gateMode === GateMode.Merkle ? 'Allowlist' : 'Private'}
                </Badge>
              ) : null}

              {auction.vestEnabled ? (
                <Badge
                  variant="outline"
                  className="h-5 rounded-full border-sky-500/14 bg-sky-500/8 px-1.5 text-[10px] font-medium text-sky-700 dark:text-sky-300"
                >
                  Vesting
                </Badge>
              ) : null}
            </div>

            {description ? (
              <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground sm:text-sm">
                {description}
              </p>
            ) : null}

            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <MetaChip
                icon={Copy}
                label="Creator"
                value={truncateAddress(auction.creator)}
                asButton
                onClick={copyCreator}
                copied={copied}
              />

              <MetaChip
                icon={Hash}
                label="Start"
                value={formatBlock(auction.startBlock)}
              />
              
              {commitEndBlock != null ? (
                <MetaChip
                  icon={Hash}
                  label="Commit"
                  value={formatBlock(commitEndBlock)}
                />
              ) : null}

              <MetaChip
                icon={Hash}
                label="End"
                value={formatBlock(auction.endBlock)}
              />


              <Link
                to={`${AppRoutes.auctions}?creator=${auction.creator}`}
                className="inline-flex h-7 items-center rounded-lg border border-border/60 bg-background/50 px-2 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
              >
                More by creator
              </Link>

              {website ? (
                <a
                  href={website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-7 items-center gap-1 rounded-lg border border-border/60 bg-background/50 px-2 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                  aria-label="Website"
                >
                  <Globe className="size-3" />
                  <span>Website</span>
                </a>
              ) : null}

              {twitter ? (
                <a
                  href={twitter}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-7 items-center align-center gap-1 rounded-lg border border-border/60 bg-background/50 px-2 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                  aria-label="Twitter/X"
                >
                  <X className="size-3" />
                  <span>X/Twitter</span>
                </a>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 border-t border-border/50 pt-2.5">
          {isRaise ? (() => {
            const raiseTarget = auction.params.type === AuctionType.Raise
              ? BigInt(auction.params.raise_target)
              : null;
            const targetMet = auction.status === AuctionStatus.Clearing
              || auction.status === AuctionStatus.Cleared;
            return raiseTarget != null ? (
              <InlineStat
                label={targetMet ? 'Target met' : 'Raise target'}
                value={formatMicrocredits(raiseTarget)}
                icon={Target}
              />
            ) : null;
          })() : currentPrice != null ? (
            <InlineStat
              label={priceLabel}
              value={formatMicrocredits(BigInt(currentPrice))}
              icon={Hash}
            />
          ) : null}

          <InlineStat
            label={isActive ? 'Ends in' : 'Status'}
            value={
              auction.estimatedEnd && isActive ? (
                <Countdown targetTime={auction.estimatedEnd} />
              ) : (
                <span>{auction.status}</span>
              )
            }
            icon={TimerIcon}
          />

          <InlineStat
            label="Access"
            value={auction.gateMode === GateMode.Open ? 'Open participation' : auction.gateMode}
            icon={auction.gateMode !== GateMode.Open ? KeyRound : Lock}
          />
        </div>
      </div>
    </div>
  );
}
