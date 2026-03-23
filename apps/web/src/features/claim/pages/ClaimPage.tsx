import { useWallet }              from '@provablehq/aleo-wallet-adaptor-react';
import { Spinner }                 from '@fairdrop/ui';
import { AuctionStatus }           from '@fairdrop/types/domain';
import { ConnectWalletPrompt }     from '@/shared/components/wallet/ConnectWalletPrompt';
import { AUCTION_REGISTRY }        from '../../auctions/registry';
import { useClaimable }            from '../hooks/useClaimable';
import { BidClaimRow }             from '../components/BidClaimRow';

export function ClaimPage() {
  const { connected } = useWallet();
  const { groups, loading } = useClaimable();

  const header = (
    <div>
      <h1 className="text-2xl font-semibold">Claim</h1>
      <p className="text-sm text-muted-foreground mt-1">
        Claim tokens from cleared auctions, or refunds from voided ones.
      </p>
    </div>
  );

  if (!connected) {
    return (
      <div className="max-w-3xl mx-auto py-6 px-4 space-y-6">
        {header}
        <ConnectWalletPrompt message="Connect your wallet to see your claimable bids." />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto py-6 px-4 space-y-6">
        {header}
        <div className="flex justify-center py-12"><Spinner className="h-6 w-6" /></div>
      </div>
    );
  }

  const actionable = groups.filter((g) =>
    g.auction &&
    (g.auction.status === AuctionStatus.Cleared || g.auction.status === AuctionStatus.Voided),
  );

  return (
    <div className="max-w-3xl mx-auto space-y-6 py-6 px-4">
      {header}

      {actionable.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-12">
          No claimable bids right now.
        </p>
      ) : (
        <div className="space-y-6">
          {actionable.map((group) => {
            const slot = group.auction ? AUCTION_REGISTRY[group.auction.type] : null;
            return (
              <div key={group.auctionId} className="space-y-2">
                <div className="flex items-center gap-2">
                  {slot && (
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${slot.color}`}>
                      {slot.label}
                    </span>
                  )}
                  <span className="text-sm font-semibold">
                    {group.auction?.metadata?.name ?? `${group.auctionId.slice(0, 16)}…`}
                  </span>
                </div>
                {group.records.map((rec, idx) => (
                  <BidClaimRow
                    key={`${rec.auctionId}-${rec.kind}-${idx}`}
                    record={rec}
                    auction={group.auction}
                  />
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
