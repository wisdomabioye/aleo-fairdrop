import { Link } from 'react-router-dom';
import { Card, CardContent, CopyField } from '@fairdrop/ui';
import type { AuctionView } from '@fairdrop/types/domain';
import { routes } from '@/config';

interface AuctionReferralTabProps {
  auction: AuctionView;
}

export function AuctionReferralTab({ auction }: AuctionReferralTabProps) {
  const shareUrl = `${window.location.origin}/auctions/${auction.id}`;

  return (
    <Card>
      <CardContent className="pt-4 space-y-3">
        <p className="text-sm font-medium">Your referral link</p>
        <p className="text-sm text-muted-foreground">
          Create a referral code on the{' '}
          <Link to={routes.referral} className="underline">
            Referral page
          </Link>{' '}
          to earn a portion of the protocol fee from bids placed through your link.
        </p>
        <CopyField label="Share link" value={shareUrl} truncate={false} />
      </CardContent>
    </Card>
  );
}
