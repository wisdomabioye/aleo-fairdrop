import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Separator,
  Skeleton,
} from '@/components';
import { AuctionStatus, AuctionType } from '@fairdrop/types/domain';
import { AppRoutes } from '@/config';
import { useBlockHeight } from '@/shared/hooks/useBlockHeight';
import { useIndexerStatus } from '@/shared/hooks/useIndexerStatus';
import { useProtocolConfig } from '@/shared/hooks/useProtocolConfig';
import { useAuction } from '../hooks/useAuction';
import { useCurrentPrice } from '../hooks/useCurrentPrice';
import { AuctionHeader } from '../components/AuctionHeader';
import { ActionsPanel } from '../components/ActionsPanel';
import { AuctionInfoTab } from '../components/AuctionInfoTab';
import { AuctionEarnTab } from '../components/AuctionEarnTab';
import { AuctionReferralTab } from '../components/AuctionReferralTab';
import { DefaultPostAuctionPanel } from '../post-auction-panels/DefaultPostAuctionPanel';
import { GateGuard }               from '@/features/gate/components/GateGuard';
import { getRegistrySlot } from '../registry';

export function AuctionDetailPage() {
  const { id } = useParams<{ id: string }>();

  if (!id) {
    return (
      <div className="p-4 sm:p-5 lg:p-6">
        <Card className="mx-auto max-w-md border-sky-500/10 bg-gradient-surface shadow-xs ring-1 ring-white/5">
          <CardContent className="space-y-2 p-4 text-center">
            <p className="text-sm text-destructive">Invalid auction ID.</p>
            <Link to={AppRoutes.auctions} className="text-sm text-muted-foreground underline underline-offset-4">
              Back to auctions
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <AuctionDetailContent id={id} />;
}

function AuctionDetailContent({ id }: { id: string }) {
  const { data: auction, isLoading, isError, refetch: refetchAuction } = useAuction(id);
  const { data: blockHeight } = useBlockHeight();
  const { data: indexerData } = useIndexerStatus();
  const { data: protocolConfig } = useProtocolConfig();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') ?? 'info';

  const lagBlocks = indexerData?.lagBlocks ?? 0;
  const currentPrice = useCurrentPrice(auction, blockHeight);

  if (isLoading) {
    return (
      <div className="space-y-4 p-4 sm:p-5 lg:p-6">
        <Skeleton className="h-5 w-32 rounded-md" />
        <Skeleton className="h-20 w-full rounded-xl" />

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="space-y-4">
            <Skeleton className="h-44 rounded-xl" />
            <Skeleton className="h-11 rounded-xl" />
            <Skeleton className="h-80 rounded-xl" />
          </div>

          <div className="space-y-4">
            <Skeleton className="h-96 rounded-xl" />
            <Skeleton className="h-44 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (isError || !auction) {
    return (
      <div className="p-4 sm:p-5 lg:p-6">
        <Card className="mx-auto max-w-md border-sky-500/10 bg-gradient-surface shadow-xs ring-1 ring-white/5">
          <CardContent className="space-y-2 p-4 text-center">
            <p className="text-sm text-destructive">Auction not found or failed to load.</p>
            <Link to={AppRoutes.auctions} className="text-sm text-muted-foreground underline underline-offset-4">
              Back to auctions
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const slot = getRegistrySlot(auction.type);
  const { PricePanel, BidForm, ProgressPanel } = slot ?? {};

  const isActive =
    auction.status === AuctionStatus.Active || auction.status === AuctionStatus.Clearing;

  const isPostAuction =
    auction.status === AuctionStatus.Ended   ||
    auction.status === AuctionStatus.Clearing ||
    auction.status === AuctionStatus.Cleared  ||
    auction.status === AuctionStatus.Voided;

  const bidPanelTitle =
    auction.status === AuctionStatus.Cleared ? 'Claim Tokens' :
    auction.status === AuctionStatus.Voided  ? 'Claim Refund' :
    auction.type   === AuctionType.Dutch     ? 'Place Bid'    :
                                               'Market & Bid';

  const hasOverviewIntro = Boolean(ProgressPanel);
  // For sealed, only show the price panel once clearing price is set (after close_auction).
  // During commit/reveal the bid form itself carries price context.
  const showPricePanel = PricePanel
    && auction.type !== AuctionType.Dutch
    && !(auction.type === AuctionType.Sealed && !auction.clearingPrice);

  return (
    <div className="space-y-4 p-4 sm:p-5 lg:p-6">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Link to={AppRoutes.auctions} className="transition-colors hover:text-foreground">
          Auctions
        </Link>
        <span>/</span>
        <span className="truncate text-foreground">Detail</span>
      </div>

      <AuctionHeader
        auction={auction}
        currentPrice={currentPrice ?? undefined}
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-4">
          {hasOverviewIntro ? (
            <Card className="border-sky-500/10 bg-gradient-surface shadow-xs ring-1 ring-white/5">
              <CardHeader className="pb-0 mb-0">
                <CardTitle className="text-sm font-semibold">Auction Progress</CardTitle>
              </CardHeader>
              <CardContent>
                {ProgressPanel ? (
                  <ProgressPanel auction={auction} />
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          <Tabs value={activeTab} onValueChange={(tab) => setSearchParams({ tab }, { replace: true })} className="space-y-3">
            <TabsList className="grid h-9 w-full grid-cols-3 rounded-xl border border-sky-500/10 bg-gradient-surface p-1 shadow-xs ring-1 ring-white/5">
              <TabsTrigger value="info" className="rounded-md text-xs sm:text-sm">
                Overview
              </TabsTrigger>
              <TabsTrigger value="earn" className="rounded-md text-xs sm:text-sm">
                Earn
              </TabsTrigger>
              <TabsTrigger value="referral" className="rounded-md text-xs sm:text-sm">
                Referral
              </TabsTrigger>
            </TabsList>

            <TabsContent value="info" className="mt-0">
              <AuctionInfoTab auction={auction} protocolConfig={protocolConfig} />
            </TabsContent>

            <TabsContent value="earn" className="mt-0">
              <AuctionEarnTab auction={auction} />
            </TabsContent>

            <TabsContent value="referral" className="mt-0">
              <AuctionReferralTab auction={auction} />
            </TabsContent>
          </Tabs>
        </div>

        <div className="space-y-4 xl:sticky xl:top-4 xl:self-start">
          <Card className="border-sky-500/10 bg-gradient-surface shadow-xs ring-1 ring-white/5">
            <CardHeader className="pb-0 mb-0">
              <CardTitle className="text-sm font-semibold mb-0 pb-0">
                {bidPanelTitle}
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-3">
              {showPricePanel ? (
                <PricePanel
                  auction={auction}
                  blockHeight={blockHeight ?? 0}
                  currentPrice={currentPrice}
                />
              ) : null}

              <>
                {showPricePanel ? <Separator /> : null}

                {isActive && BidForm && protocolConfig ? (
                  <GateGuard auction={auction}>
                    <BidForm
                      auction={auction}
                      blockHeight={blockHeight ?? 0}
                      protocolConfig={protocolConfig}
                      lagBlocks={lagBlocks}
                      onBidSuccess={async () => {
                        await new Promise(resolve => setTimeout(resolve, 5000)) // wait for indexer to catch up
                        void refetchAuction()
                      }}
                    />
                  </GateGuard>
                ) : isPostAuction ? (
                  <DefaultPostAuctionPanel auction={auction} />
                ) : (
                  <div className="rounded-lg border border-border/70 bg-background/70 px-3 py-2 text-xs text-muted-foreground">
                    Bidding is currently unavailable for this auction.
                  </div>
                )}
              </>
            </CardContent>
          </Card>

          <ActionsPanel auction={auction} blockHeight={blockHeight} />
        </div>
      </div>
    </div>
  );
}
