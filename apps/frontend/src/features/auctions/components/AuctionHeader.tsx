import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Check,
  Copy,
  Globe,
  Hash,
  KeyRound,
  Lock,
  TimerIcon,
  X,
} from 'lucide-react';
import { AuctionStatusBadge, Countdown } from '@/components';
import { Badge } from '@/components/ui/badge';
import { truncateAddress, sanitizeExternalUrl } from '@fairdrop/sdk/format';
import { GateMode } from '@fairdrop/types/domain';
import type { AuctionView } from '@fairdrop/types/domain';
import { IPFS_GATEWAY } from '@/env';
import { AppRoutes } from '@/config';
import { cn } from '@/lib/utils';
import { getRegistrySlot } from '../registry';
import { LetterAvatar } from './LetterAvatar';

interface AuctionHeaderProps {
  auction: AuctionView;
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
        'inline-flex h-8 items-center gap-2 rounded-lg border border-border/70 bg-background/60 px-2.5 text-left text-xs',
        asButton &&
          'transition-[border-color,background-color,color] hover:border-sky-500/12 hover:bg-background/80 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-sky-400/15'
      )}
    >
      <Icon className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate font-medium text-foreground">{value}</span>
      {asButton ? (
        copied ? (
          <Check className="size-3.5 shrink-0 text-emerald-500" />
        ) : (
          <Copy className="size-3.5 shrink-0 text-muted-foreground" />
        )
      ) : null}
    </Comp>
  );
}

function formatBlock(value: number | bigint | undefined) {
  if (value == null) return null;
  return typeof value === 'bigint' ? value.toString() : value.toLocaleString();
}

export function AuctionHeader({ auction }: AuctionHeaderProps) {
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

  const isActive =
    auction.status === 'active' || auction.status === 'clearing';

  const commitEndBlock = useMemo(() => {
    const candidate = (auction as AuctionView & { commitEndBlock?: number | bigint })
      .commitEndBlock;
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

  return (
    <div className="overflow-hidden rounded-xl border border-sky-500/10 bg-gradient-surface shadow-xs ring-1 ring-white/5">
      <div className="flex flex-col gap-4 px-4 py-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start gap-4">
            {!imageError && logoUrl ? (
              <img
                src={logoUrl}
                alt={name}
                crossOrigin="anonymous"
                className="size-20 shrink-0 rounded-2xl border border-sky-500/10 object-cover shadow-xs sm:size-24"
                onError={() => setImageError(true)}
              />
            ) : (
              <LetterAvatar
                name={name}
                size="lg"
                className="size-20 shrink-0 rounded-2xl sm:size-24"
              />
            )}

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="min-w-0 truncate text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
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
                <p className="mt-1.5 max-w-3xl text-sm leading-6 text-muted-foreground">
                  {description}
                </p>
              ) : null}

              <div className="mt-3 flex flex-wrap items-center gap-2">
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

                <MetaChip
                  icon={Hash}
                  label="End"
                  value={formatBlock(auction.endBlock)}
                />

                {commitEndBlock != null ? (
                  <MetaChip
                    icon={Hash}
                    label="Commit end"
                    value={formatBlock(commitEndBlock)}
                  />
                ) : null}

                <Link
                  to={`${AppRoutes.auctions}?creator=${auction.creator}`}
                  className="inline-flex h-8 items-center rounded-lg border border-border/70 bg-background/60 px-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  More by creator
                </Link>

                {website ? (
                  <a
                    href={website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/70 bg-background/60 px-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                    aria-label="Website"
                  >
                    <Globe className="size-3.5" />
                    <span>Website</span>
                  </a>
                ) : null}

                {twitter ? (
                  <a
                    href={twitter}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/70 bg-background/60 px-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                    aria-label="Twitter/X"
                  >
                    <X className="size-3.5" />
                    <span>X</span>
                  </a>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <div className="grid shrink-0 gap-2 sm:grid-cols-2 xl:min-w-[14rem] xl:grid-cols-1">
          <div className="rounded-xl border border-sky-500/10 bg-background/60 px-3 py-2.5">
            <div className="flex items-center gap-2">
              <TimerIcon className="size-3.5 text-muted-foreground" />
              <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground/80">
                {isActive ? 'Ends in' : 'Status'}
              </p>
            </div>

            <div className="mt-1 text-sm font-medium text-foreground">
              {auction.estimatedEnd && isActive ? (
                <Countdown targetTime={auction.estimatedEnd} />
              ) : (
                <span>{auction.status}</span>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-border/70 bg-background/60 px-3 py-2.5">
            <div className="flex items-center gap-2">
              {auction.gateMode !== GateMode.Open ? (
                <KeyRound className="size-3.5 text-muted-foreground" />
              ) : (
                <Lock className="size-3.5 text-muted-foreground" />
              )}
              <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground/80">
                Access
              </p>
            </div>

            <div className="mt-1 text-sm font-medium text-foreground">
              {auction.gateMode === GateMode.Open ? 'Open participation' : auction.gateMode}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
