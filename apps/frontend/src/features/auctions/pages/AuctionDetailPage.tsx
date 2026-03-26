import { Link, useParams } from 'react-router-dom';
import {
  Card, CardContent, CardHeader, CardTitle,
  Tabs, TabsList, TabsTrigger, TabsContent,
  Separator, Skeleton,
} from '@/components';
import { AuctionStatus } from '@fairdrop/types/domain';
import { AppRoutes } from '@/config';
import { useBlockHeight } from '@/shared/hooks/useBlockHeight';
import { useIndexerStatus } from '@/shared/hooks/useIndexerStatus';
import { useAuction } from '../hooks/useAuction';
import { useCurrentPrice } from '../hooks/useCurrentPrice';
import { useProtocolConfig } from '../../../shared/hooks/useProtocolConfig';
import { AuctionHeader } from '../components/AuctionHeader';
import { ActionsPanel } from '../components/ActionsPanel';
import { AuctionInfoTab } from '../components/AuctionInfoTab';
import { AuctionEarnTab } from '../components/AuctionEarnTab';
import { AuctionReferralTab } from '../components/AuctionReferralTab';
import { getRegistrySlot } from '../registry';

export function AuctionDetailPage() {
  const { id } = useParams<{ id: string }>();

  if (!id) {
    return (
      <div className="p-6 text-center space-y-2">
        <p className="text-sm text-destructive">Invalid auction ID.</p>
        <Link to={AppRoutes.auctions} className="text-sm underline">
          Back to auctions
        </Link>
      </div>
    );
  }

  return <AuctionDetailContent id={id} />;
}

function AuctionDetailContent({ id }: { id: string }) {
  const { data: auction, isLoading, isError } = useAuction(id);
  const { data: blockHeight }  = useBlockHeight();
  const { data: indexerData }  = useIndexerStatus();
  const { data: protocolConfig } = useProtocolConfig();

  const lagBlocks    = indexerData?.lagBlocks ?? 0;
  const currentPrice = useCurrentPrice(auction, blockHeight);

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-20 w-full rounded-xl" />
        <div className="grid gap-6 lg:grid-cols-5">
          <Skeleton className="col-span-3 h-96 rounded-xl" />
          <Skeleton className="col-span-2 h-96 rounded-xl" />
        </div>
      </div>
    );
  }

  if (isError || !auction) {
    return (
      <div className="p-6 text-center space-y-2">
        <p className="text-sm text-destructive">Auction not found or failed to load.</p>
        <Link to={AppRoutes.auctions} className="text-sm underline">
          Back to auctions
        </Link>
      </div>
    );
  }

  const slot = getRegistrySlot(auction.type);
  const { PricePanel, BidForm, ProgressPanel } = slot ?? {};

  const isActive =
    auction.status === AuctionStatus.Active || auction.status === AuctionStatus.Clearing;

  return (
    <div className="p-6 space-y-6">
      <AuctionHeader auction={auction} />

      <Separator />

      <div className="grid gap-6 lg:grid-cols-5">
        {/* ── Left: progress + tabs ── */}
        <div className="space-y-6 lg:col-span-3">
          {ProgressPanel && (
            <Card>
              <CardContent className="pt-4">
                <ProgressPanel auction={auction} />
              </CardContent>
            </Card>
          )}

          {auction.metadata?.description && (
            <p className="text-sm leading-relaxed text-muted-foreground">
              {auction.metadata.description}
            </p>
          )}

          <Tabs defaultValue="info">
            <TabsList className="w-full">
              <TabsTrigger value="info"     className="flex-1">Info</TabsTrigger>
              <TabsTrigger value="earn"     className="flex-1">Earn</TabsTrigger>
              <TabsTrigger value="referral" className="flex-1">Referral</TabsTrigger>
              <TabsTrigger value="receipts" className="flex-1">Your Receipts</TabsTrigger>
            </TabsList>

            <TabsContent value="info">
              <AuctionInfoTab auction={auction} protocolConfig={protocolConfig} />
            </TabsContent>

            <TabsContent value="earn">
              <AuctionEarnTab auction={auction} />
            </TabsContent>

            <TabsContent value="referral">
              <AuctionReferralTab auction={auction} />
            </TabsContent>

            <TabsContent value="receipts">
              <Card>
                <CardContent className="pt-4 space-y-2">
                  <p className="text-sm font-medium">Your participation receipts</p>
                  <p className="text-sm text-muted-foreground">
                    Receipts are private records held in your wallet. Use the{' '}
                    <Link to={AppRoutes.claim} className="underline">
                      Claim page
                    </Link>{' '}
                    to view and claim all eligible receipts across auctions.
                  </p>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* ── Right: price + bid + actions (sticky) ── */}
        <div className="space-y-4 lg:col-span-2 lg:sticky lg:top-6 lg:self-start">
          {PricePanel && (
            <Card>
              <CardContent className="pt-4">
                <PricePanel
                  auction={auction}
                  blockHeight={blockHeight ?? 0}
                  currentPrice={currentPrice}
                />
              </CardContent>
            </Card>
          )}

          {BidForm && isActive && protocolConfig && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Place a Bid</CardTitle>
              </CardHeader>
              <CardContent>
                <BidForm
                  auction={auction}
                  blockHeight={blockHeight ?? 0}
                  protocolConfig={protocolConfig}
                  lagBlocks={lagBlocks}
                />
              </CardContent>
            </Card>
          )}

          <ActionsPanel auction={auction} blockHeight={blockHeight} />
        </div>
      </div>
    </div>
  );
}
