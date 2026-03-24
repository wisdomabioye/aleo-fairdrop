import { Link } from 'react-router-dom';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { useQuery } from '@tanstack/react-query';
import {
  Button,
  Spinner,
  Card,
  CardContent,
  AuctionStatusBadge,
  PageHeader,
} from '@/components';
import { PlusCircle, ExternalLink } from 'lucide-react';
import { ConnectWalletPrompt } from '@/shared/components/wallet/ConnectWalletPrompt';
import { usersService }       from '@/services/users.service';
import { AUCTION_REGISTRY }   from '@/features/auctions/registry';
import { auctionDetailUrl, AppRoutes } from '@/config';

export function MyAuctionsPage() {
  const { address, connected } = useWallet();

  const { data, isLoading, isError } = useQuery({
    queryKey:  ['user-auctions', address],
    queryFn:   () => usersService.auctions(address!),
    enabled:   !!address,
    staleTime: 15_000,
  });

  if (!connected) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 p-6">
        <PageHeader title="My Auctions" description="Manage auctions you've created." />
        <ConnectWalletPrompt message="Connect your wallet to see your auctions." />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex items-start justify-between">
        <PageHeader title="My Auctions" description="Manage auctions you've created." />
        <Button asChild size="sm">
          <Link to={AppRoutes.createAuction}>
            <PlusCircle className="mr-1.5 size-4" />
            Create Auction
          </Link>
        </Button>
      </div>

      {isError && (
        <p className="text-sm text-destructive">Failed to load auctions.</p>
      )}

      {isLoading && (
        <div className="flex justify-center py-12">
          <Spinner className="size-6" />
        </div>
      )}

      {!isLoading && data && (
        <>
          {data.items.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-14 text-center">
              <p className="text-sm font-medium text-muted-foreground">
                You haven't created any auctions yet.
              </p>
              <Button asChild size="sm" variant="outline">
                <Link to={AppRoutes.createAuction}>
                  <PlusCircle className="mr-1.5 size-4" />
                  Create your first auction
                </Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {data.items.map((auction) => {
                const slot = AUCTION_REGISTRY[auction.type];
                return (
                  <Card key={auction.id} className="hover:bg-card/80 transition-colors">
                    <CardContent className="flex items-center gap-4 py-4">
                      {/* Type badge */}
                      <span className={`hidden shrink-0 rounded-full px-2.5 py-1 text-xs font-medium sm:inline ${slot?.color ?? 'bg-muted text-muted-foreground'}`}>
                        {slot?.label ?? auction.type}
                      </span>

                      {/* Name */}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {auction.name ?? `${auction.id.slice(0, 24)}…`}
                        </p>
                        <p className="text-xs text-muted-foreground font-mono">
                          {auction.id.slice(0, 32)}…
                        </p>
                      </div>

                      {/* Status */}
                      <AuctionStatusBadge status={auction.status} showIcon={false} />

                      {/* Manage link */}
                      <Button asChild variant="ghost" size="sm">
                        <Link to={auctionDetailUrl(auction.id)}>
                          <ExternalLink className="mr-1.5 size-3.5" />
                          Manage
                        </Link>
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
