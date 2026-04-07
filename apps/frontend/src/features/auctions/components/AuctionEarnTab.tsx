import { Link } from 'react-router-dom';
import { ArrowRight, Coins, Gift, Gavel } from 'lucide-react';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { Button, Spinner, Card, CardContent } from '@/components';
import { Badge } from '@/components/ui/badge';
import { formatMicrocredits } from '@fairdrop/sdk/credits';
import { AuctionStatus, AuctionType } from '@fairdrop/types/domain';
import type { AuctionView } from '@fairdrop/types/domain';
import { useBlockHeight } from '@/shared/hooks/useBlockHeight';
import { useProtocolConfig } from '@/shared/hooks/useProtocolConfig';
import { AppRoutes } from '@/config';
import { closeAuction } from '@fairdrop/sdk/transactions';
import { cn } from '@/lib/utils';
import { useConfirmedSequentialTx } from '@/shared/hooks/useConfirmedSequentialTx';

interface AuctionEarnTabProps {
  auction: AuctionView;
}

function EarnItem({
  title,
  description,
  value,
  icon: Icon,
  href,
  action,
  muted,
}: {
  title: string;
  description: string;
  value?: string;
  icon: typeof Gavel;
  href?: string;
  action?: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border px-3 py-2.5',
        muted
          ? 'border-border/70 bg-background/45'
          : 'border-sky-500/10 bg-background/60'
      )}
    >
      <div className="flex items-start gap-2.5">
        <div
          className={cn(
            'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border',
            muted
              ? 'border-border/70 bg-muted/50 text-muted-foreground'
              : 'border-sky-500/12 bg-sky-500/8 text-sky-600 dark:text-sky-300'
          )}
        >
          <Icon className="size-4" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-foreground">{title}</p>
            {value ? (
              <Badge
                variant="outline"
                className={cn(
                  'h-5 rounded-full px-1.5 text-[10px] font-medium',
                  muted
                    ? ''
                    : 'border-sky-500/14 bg-sky-500/8 text-sky-700 dark:text-sky-300'
                )}
              >
                {value}
              </Badge>
            ) : null}
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
          {href ? (
            <Link
              to={href}
              className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-foreground transition-colors hover:text-primary"
            >
              Open
              <ArrowRight className="size-3.5" />
            </Link>
          ) : action ? (
            <div className="mt-2">{action}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function AuctionEarnTab({ auction }: AuctionEarnTabProps) {
  const { data: blockHeight = 0 } = useBlockHeight();
  const { connected, executeTransaction } = useWallet();
  const protocolConfig = useProtocolConfig();

  // ── close auction ──────────────────────────────────────────────────────────

  // For ascending auctions use the live (potentially extended) end block.
  const liveEndBlock = auction.type === AuctionType.Ascending
    ? (auction.effectiveEndBlock ?? auction.endBlock)
    : auction.endBlock;

  const isCloseable =
    auction.status === AuctionStatus.Active   ||
    auction.status === AuctionStatus.Ended    ||
    auction.status === AuctionStatus.Clearing;

  // Raise auctions can close early once the partial fill threshold is met.
  const fillThresholdMet =
    auction.type === AuctionType.Raise &&
    auction.fillMinBps != null && auction.fillMinBps > 0 &&
    auction.raiseTarget != null &&
    auction.totalPayments >= (auction.raiseTarget * BigInt(auction.fillMinBps)) / 10000n;

  const canCloseNow =
    auction.status === AuctionStatus.Ended    ||
    auction.status === AuctionStatus.Clearing ||
    (auction.status === AuctionStatus.Active && blockHeight > 0 && blockHeight >= liveEndBlock) ||
    (auction.status === AuctionStatus.Active && fillThresholdMet);

  const blocksLeft =
    auction.status === AuctionStatus.Active && blockHeight > 0
      ? Math.max(0, liveEndBlock - blockHeight)
      : null;

  const closeDescription =
    auction.status === AuctionStatus.Cleared || auction.status === AuctionStatus.Voided
      ? 'Auction is already finalized.'
      : canCloseNow
      ? auction.status === AuctionStatus.Clearing
        ? 'Supply target met — finalize this auction to claim the closer reward.'
        : fillThresholdMet
        ? 'Fill threshold reached — finalize this auction to claim the closer reward.'
        : 'Auction period has ended — finalize it to claim the closer reward.'
      : blocksLeft !== null
      ? `Closes at block #${liveEndBlock} · ${blocksLeft} blocks remaining`
      : `Available once the auction period ends (block #${liveEndBlock}).`;

  // ── slash unrevealed ───────────────────────────────────────────────────────

  const isSealed = auction.type === AuctionType.Sealed;
  const canSlash  = isSealed && blockHeight >= auction.endBlock;
  const slashBps  =
    isSealed && auction.params.type === AuctionType.Sealed
      ? parseInt(String(auction.params.slash_reward_bps))
      : 0;

  const slashDescription = !isSealed
    ? 'Only available for sealed commitment auctions.'
    : canSlash
    ? slashBps > 0
      ? `${(slashBps / 100).toFixed(2)}% of each slashed stake paid to the reporter.`
      : 'Slash uncommitted bids after the reveal window.'
    : auction.status === AuctionStatus.Cleared || auction.status === AuctionStatus.Voided
    ? 'Auction finalized.'
    : 'Available after the sealed auction ends and the reveal window closes.';

  // ── referral commission ────────────────────────────────────────────────────
  const maxReferralBudget = BigInt(protocolConfig.data?.maxReferralBps ?? 0) / 100n;
  const hasBudget = maxReferralBudget > 0n;
  const isActive  = auction.status === AuctionStatus.Active;

  const referralDescription = !hasBudget
    ? 'No referral budget configured for this auction.'
    : isActive
    ? 'Earn a share of each bid placed through your referral link.'
    : auction.status === AuctionStatus.Cleared || auction.status === AuctionStatus.Voided
    ? 'Auction closed — check Earnings for any claimable commissions.'
    : 'Available once the auction becomes active.';

  // ── close handler ──────────────────────────────────────────────────────────
  const closeAuctionStep = [{
    label: 'Close Auction',
    execute: async () => {
      const spec = closeAuction(auction);
      const result = await executeTransaction({ ...spec, inputs: spec.inputs as string[] });
      return result?.transactionId;
    },
  }];

  const {
    busy: auctionCloseSiging,
    isWaiting: auctionCloseConfirming,
    error: auctionCloseError,
    advance: handleCloseAuction,
  } = useConfirmedSequentialTx(closeAuctionStep);

  const isAuctionClosing = auctionCloseConfirming || auctionCloseSiging

  return (
    <Card className="border-sky-500/10 bg-gradient-surface shadow-xs ring-1 ring-white/5">
      <CardContent className="space-y-2.5">
        <EarnItem
          title="Close Auction"
          value={formatMicrocredits(auction.closerReward)}
          icon={Gavel}
          description={closeDescription}
          muted={!isCloseable}
          action={
            canCloseNow && connected ? (
              <Button size="sm" disabled={isAuctionClosing} onClick={handleCloseAuction}>
                {isAuctionClosing ? (
                  <><Spinner className="mr-2 h-3 w-3" />Submitting…</>
                ) : (
                  `Close & Earn ${formatMicrocredits(auction.closerReward)}`
                )}
              </Button>
            ) : undefined
          }
        />
        {auctionCloseError ? (
          <p className="px-1 pb-2 text-xs text-destructive">{auctionCloseError.message}</p>
        ) : null}

        <EarnItem
          title="Slash Unrevealed Bids"
          icon={Coins}
          description={slashDescription}
          muted={!canSlash}
          href={canSlash ? AppRoutes.earnings : undefined}
        />

        <EarnItem
          title="Referral Commission"
          value={`up to ${(maxReferralBudget).toString()}% commission`}
          icon={Gift}
          description={referralDescription}
          muted={!isActive || !hasBudget}
          href={isActive && hasBudget ? '?tab=referral' : undefined}
        />
      </CardContent>
    </Card>
  );
}
