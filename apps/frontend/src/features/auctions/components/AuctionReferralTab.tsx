import { Link } from 'react-router-dom';
import { ArrowRight, Gift, Share2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CopyField } from '@/components';
import { Badge } from '@/components/ui/badge';
import { formatMicrocredits } from '@fairdrop/sdk/credits';
import type { AuctionView } from '@fairdrop/types/domain';
import { AppRoutes } from '@/config';

interface AuctionReferralTabProps {
  auction: AuctionView;
}

export function AuctionReferralTab({ auction }: AuctionReferralTabProps) {
  const shareUrl = `${window.location.origin}/auctions/${auction.id}`;
  const hasBudget = auction.referralBudget != null && auction.referralBudget > 0n;

  return (
    <Card className="border-sky-500/10 bg-gradient-surface shadow-xs ring-1 ring-white/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Referral</CardTitle>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="rounded-xl border border-sky-500/10 bg-background/60 px-3 py-2.5">
          <div className="flex items-start gap-2.5">
            <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-sky-500/12 bg-sky-500/8 text-sky-600 dark:text-sky-300">
              <Gift className="size-4" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-foreground">
                  Referral rewards
                </p>

                {hasBudget ? (
                  <Badge
                    variant="outline"
                    className="h-5 rounded-full border-sky-500/14 bg-sky-500/8 px-1.5 text-[10px] font-medium text-sky-700 dark:text-sky-300"
                  >
                    {formatMicrocredits(auction.referralBudget!)}
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="h-5 rounded-full px-1.5 text-[10px] font-medium"
                  >
                    No budget
                  </Badge>
                )}
              </div>

              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Create a referral code to earn a share from bids placed through your link.
              </p>

              <Link
                to={AppRoutes.referral}
                className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-foreground transition-colors hover:text-primary"
              >
                Open referral page
                <ArrowRight className="size-3.5" />
              </Link>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border/70 bg-background/50 px-3 py-2.5">
          <div className="mb-2 flex items-center gap-2">
            <Share2 className="size-3.5 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">Auction share link</p>
          </div>

          <p className="mb-3 text-xs leading-5 text-muted-foreground">
            Share this auction directly, or generate a referral-aware link from the referral page.
          </p>

          <CopyField label="Share link" value={shareUrl} truncate={false} />
        </div>
      </CardContent>
    </Card>
  );
}
