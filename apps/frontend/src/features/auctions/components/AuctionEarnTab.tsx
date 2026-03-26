import { Link } from 'react-router-dom';
import { ArrowRight, Coins, Gift, Gavel } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components';
import { Badge } from '@/components/ui/badge';
import { formatMicrocredits } from '@fairdrop/sdk/credits';
import { AuctionStatus, AuctionType } from '@fairdrop/types/domain';
import type { AuctionView } from '@fairdrop/types/domain';
import { AppRoutes } from '@/config';
import { cn } from '@/lib/utils';

interface AuctionEarnTabProps {
  auction: AuctionView;
}

function EarnItem({
  title,
  description,
  value,
  icon: Icon,
  href,
  muted,
}: {
  title: string;
  description: string;
  value?: string;
  icon: typeof Gavel;
  href?: string;
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
                className="h-5 rounded-full border-sky-500/14 bg-sky-500/8 px-1.5 text-[10px] font-medium text-sky-700 dark:text-sky-300"
              >
                {value}
              </Badge>
            ) : null}
          </div>

          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {description}
          </p>

          {href ? (
            <Link
              to={href}
              className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-foreground transition-colors hover:text-primary"
            >
              Open
              <ArrowRight className="size-3.5" />
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function AuctionEarnTab({ auction }: AuctionEarnTabProps) {
  const closeable =
    auction.status === AuctionStatus.Ended || auction.status === AuctionStatus.Clearing;

  const slashable =
    auction.type === AuctionType.Sealed && auction.status === AuctionStatus.Ended;

  const hasReferral =
    auction.referralBudget != null &&
    auction.referralBudget > 0n &&
    auction.status === AuctionStatus.Active;

  const isClosed =
    auction.status === AuctionStatus.Cleared || auction.status === AuctionStatus.Voided;

  const hasItems = closeable || slashable || hasReferral;

  return (
    <Card className="border-sky-500/10 bg-gradient-surface shadow-xs ring-1 ring-white/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Earn</CardTitle>
      </CardHeader>

      <CardContent className="space-y-2.5">
        {!hasItems ? (
          <div className="rounded-xl border border-border/70 bg-background/50 px-3 py-3 text-sm text-muted-foreground">
            {isClosed ? (
              <>
                This auction is closed. Check{' '}
                <Link
                  to={AppRoutes.earnings}
                  className="font-medium text-foreground underline underline-offset-4"
                >
                  Earnings
                </Link>{' '}
                for any claimable referral commissions.
              </>
            ) : (
              'No earning opportunities are available yet.'
            )}
          </div>
        ) : null}

        {closeable ? (
          <EarnItem
            title="Close auction"
            description="Anyone can finalize the auction once the sale period has ended."
            value={formatMicrocredits(auction.closerReward)}
            icon={Gavel}
          />
        ) : null}

        {slashable ? (
          <EarnItem
            title="Slash unrevealed bids"
            description="Sealed auctions may allow slashing after the reveal window. Manage this from Earnings."
            icon={Coins}
            href={AppRoutes.earnings}
          />
        ) : null}

        {hasReferral ? (
          <EarnItem
            title="Referral commission"
            description="Create a referral code and earn from bids placed through your link."
            value={formatMicrocredits(auction.referralBudget!)}
            icon={Gift}
            href={AppRoutes.referral}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}
