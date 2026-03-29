import { ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CopyField } from '@/components';
import { Badge } from '@/components/ui/badge';
import { formatMicrocredits } from '@fairdrop/sdk/credits';
import { formatAmount } from '@fairdrop/sdk/format';
import { AuctionType } from '@fairdrop/types/domain';
import type { AuctionView, ProtocolConfig } from '@fairdrop/types/domain';
import { IPFS_GATEWAY } from '@/env';
import { cn } from '@/lib/utils';

interface AuctionInfoTabProps {
  auction: AuctionView;
  protocolConfig: ProtocolConfig | undefined;
}

function MetaItem({
  label,
  value,
  className,
}: {
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('rounded-lg border border-border/70 bg-background/60 px-3 py-2', className)}>
      <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground/75">
        {label}
      </p>
      <div className="mt-1 text-sm font-medium text-foreground">{value}</div>
    </div>
  );
}

function Row({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: React.ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-start gap-x-3 py-1.5">
      <span className="text-[11px] font-medium text-muted-foreground/75">{label}</span>
      <span
        className={cn(
          'min-w-0 text-right text-xs font-medium text-foreground/88',
          valueClassName
        )}
      >
        {value}
      </span>
    </div>
  );
}

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

export function AuctionInfoTab({ auction, protocolConfig }: AuctionInfoTabProps) {
  const vestingLabel = auction.vestEnabled
    ? `Cliff ${auction.vestCliffBlocks.toLocaleString()} • Duration ${auction.vestEndBlocks.toLocaleString()}`
    : 'Disabled';

  const tokenDecimals = auction.saleTokenDecimals as number;
  const isSealed = auction.type === AuctionType.Sealed;
  const isRaise = auction.type === AuctionType.Raise;
  const commitEndBlock = auction.params.type === AuctionType.Sealed ? auction.params.commit_end_block : 0 
  
  return (
    <Card className="border-sky-500/10 bg-gradient-surface shadow-xs ring-1 ring-white/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Overview</CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        <CopyField label="Auction ID" value={auction.id} />

        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <MetaItem
            label="Sale token"
            value={auction.saleTokenSymbol ?? auction.saleTokenId}
          />

          <MetaItem
            label="Supply"
            value={formatAmount(
              auction.supply,
              tokenDecimals
            )}
          />

          <MetaItem
            label="Gate"
            value={
              <Badge
                variant="outline"
                className="h-5 rounded-full px-1.5 text-[10px] font-medium"
              >
                {auction.gateMode}
              </Badge>
            }
          />

          <MetaItem
            label="Vesting"
            value={
              <Badge
                variant="outline"
                className="h-5 rounded-full px-1.5 text-[10px] font-medium"
              >
                {auction.vestEnabled ? 'Enabled' : 'Disabled'}
              </Badge>
            }
          />
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-xl border border-border/70 bg-background/55 px-3 py-2.5">
            <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-muted-foreground/75">
              Timing
            </p>

            <div className="mt-2 divide-y divide-border/60">
              <Row
                label="Start block"
                value={auction.startBlock.toLocaleString()}
                valueClassName="font-mono text-[12px] text-foreground/80"
              />
              

              { 
                isSealed ? 
                <>
                  <Row
                    label="Commit End block"
                    value={Number(commitEndBlock).toLocaleString()}
                    valueClassName="font-mono text-[12px] text-foreground/80"
                  />
                  <Row
                    label="Reveal End block"
                    value={auction.endBlock.toLocaleString()}
                    valueClassName="font-mono text-[12px] text-foreground/80"
                  />
                </>
                :
                <Row
                  label="End block"
                  value={auction.endBlock.toLocaleString()}
                  valueClassName="font-mono text-[12px] text-foreground/80"
                />
              }
              
              {auction.estimatedStart ? (
                <Row
                  label="Est. start"
                  value={formatDateTime(auction.estimatedStart)}
                  valueClassName="text-[12px] font-normal text-muted-foreground"
                />
              ) : null}

              {auction.estimatedEnd ? (
                <Row
                  label="Est. end"
                  value={formatDateTime(auction.estimatedEnd)}
                  valueClassName="text-[12px] font-normal text-muted-foreground"
                />
              ) : null}
            </div>
          </div>

          <div className="rounded-xl border border-border/70 bg-background/55 px-3 py-2.5">
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground/75">
              Economics
            </p>

            <div className="mt-2 divide-y divide-border/60">
              <Row
                label="Protocol fee"
                value={`${auction.feeBps / 100}%`}
                valueClassName="text-[11px] text-foreground/82"
              />

              <Row
                label="Closer reward"
                value={formatMicrocredits(auction.closerReward)}
                valueClassName="text-[11px] text-foreground/82"
              />

              {auction.minBidAmount > 0n ? (
                <Row
                  label="Min bid"
                  value={
                    isRaise ?
                    `${formatAmount(auction.minBidAmount, tokenDecimals)} ALEO` // minAmount contribution is ALEO
                    :
                    `${formatAmount(auction.minBidAmount, tokenDecimals)} ${auction.saleTokenSymbol}`
                  }
                  valueClassName="text-[11px] text-foreground/82"
                />
              ) : null}

              {auction.maxBidAmount > 0n ? (
                <Row
                  label="Max bid"
                  value={
                    isRaise ?
                    `${formatAmount(auction.maxBidAmount, tokenDecimals)} ALEO` // minAmount contribution is ALEO
                    :
                    `${formatAmount(auction.maxBidAmount, tokenDecimals)} ${auction.saleTokenSymbol}`
                  }
                  valueClassName="text-[11px] text-foreground/82"
                />
              ) : null}

              <Row
                label="Vesting"
                value={vestingLabel}
                valueClassName="text-[11px] font-normal text-muted-foreground"
              />

              {isSealed && protocolConfig ? (
                <Row
                  label="Slash reward"
                  value={`${protocolConfig.slashRewardBps / 100}% of collateral`}
                  valueClassName="text-[11px] font-normal text-muted-foreground"
                />
              ) : null}

              {auction.referralBudget != null && auction.referralBudget > 0n ? (
                <Row
                  label="Referral"
                  value={formatMicrocredits(auction.referralBudget)}
                  valueClassName="text-[11px] text-foreground/82"
                />
              ) : null}

              {auction.metadata?.ipfsCid ? (
                <Row
                  label="Metadata"
                  value={
                    <a
                      href={`${IPFS_GATEWAY}/${auction.metadata.ipfsCid}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                    >
                      IPFS
                      <ExternalLink className="size-3" />
                    </a>
                  }
                />
              ) : null}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
