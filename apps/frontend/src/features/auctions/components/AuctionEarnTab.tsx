import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components';
import { formatMicrocredits } from '@fairdrop/sdk/credits';
import { AuctionStatus, AuctionType } from '@fairdrop/types/domain';
import type { AuctionView } from '@fairdrop/types/domain';
import { AppRoutes } from '@/config';

interface AuctionEarnTabProps {
  auction: AuctionView;
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

  return (
    <Card>
      <CardContent className="pt-4 space-y-3">
        <p className="text-sm font-medium">Earning opportunities</p>

        {!closeable && !slashable && !hasReferral && (
          <p className="text-sm text-muted-foreground">
            {auction.status === AuctionStatus.Cleared || auction.status === AuctionStatus.Voided
              ? <>This auction is closed. Check <Link to={AppRoutes.earnings} className="underline">Earnings</Link> for referral commissions.</>
              : 'No earning opportunities available yet.'}
          </p>
        )}

        {closeable && (
          <div className="rounded-md border border-border p-3 space-y-0.5">
            <p className="text-sm font-medium text-foreground">Close Auction</p>
            <p className="text-sm text-muted-foreground">
              Earn {formatMicrocredits(auction.closerReward)} by calling{' '}
              <code className="text-xs">close_auction</code>.
            </p>
          </div>
        )}

        {slashable && (
          <div className="rounded-md border border-border p-3 space-y-0.5">
            <p className="text-sm font-medium text-foreground">Slash Unrevealed Bids</p>
            <p className="text-sm text-muted-foreground">
              Earn a share of collateral for each unrevealed bid slashed after the reveal window.
              Available from the{' '}
              <Link to={AppRoutes.earnings} className="underline">Earnings</Link> page.
            </p>
          </div>
        )}

        {hasReferral && (
          <div className="rounded-md border border-border p-3 space-y-0.5">
            <p className="text-sm font-medium text-foreground">Referral Commission</p>
            <p className="text-sm text-muted-foreground">
              Create a referral code and earn from every bid placed through your link.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
