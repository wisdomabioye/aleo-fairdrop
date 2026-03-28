import { useWallet }          from '@provablehq/aleo-wallet-adaptor-react';
import { RefreshCw }          from 'lucide-react';
import { Button, PageHeader, Spinner } from '@/components';
import { AuctionStatus }      from '@fairdrop/types/domain';
import { ConnectWalletPrompt } from '@/shared/components/wallet/ConnectWalletPrompt';
import { useClaimable }       from '../hooks/useClaimable';
import { ClaimGroup }         from '../components/ClaimGroup';

export function ClaimPage() {
  const { connected } = useWallet();
  const { groups, loading, reload } = useClaimable();

  const pageHeader = (
    <PageHeader
      title="Claim"
      description="Claim tokens from cleared auctions, or refunds from cancelled ones."
    />
  );

  if (!connected) {
    return (
      <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-5 lg:p-6">
        {pageHeader}
        <ConnectWalletPrompt message="Connect your wallet to see your claimable bids." />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-5 lg:p-6">
        {pageHeader}
        <div className="flex justify-center py-12">
          <Spinner className="h-6 w-6" />
        </div>
      </div>
    );
  }

  const actionable  = groups.filter(
    (g) => g.auction?.status === AuctionStatus.Cleared || g.auction?.status === AuctionStatus.Voided,
  );
  const clearedCount   = actionable.filter((g) => g.auction?.status === AuctionStatus.Cleared).length;
  const refundableCount = actionable.filter((g) => g.auction?.status === AuctionStatus.Voided).length;

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 sm:p-5 lg:p-6">
      {pageHeader}

      {/* ── Summary bar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {actionable.length === 0 ? (
            'No claimable auctions found.'
          ) : (
            <>
              <span className="font-medium text-foreground">{actionable.length}</span>{' '}
              auction{actionable.length !== 1 ? 's' : ''} ready
              {clearedCount > 0 && (
                <>
                  {' · '}
                  <span className="text-emerald-600 dark:text-emerald-400">
                    {clearedCount} cleared
                  </span>
                </>
              )}
              {refundableCount > 0 && (
                <>
                  {' · '}
                  <span className="text-amber-600 dark:text-amber-400">
                    {refundableCount} refundable
                  </span>
                </>
              )}
            </>
          )}
        </p>

        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
          onClick={reload}
        >
          <RefreshCw className="size-3" />
          Reload
        </Button>
      </div>

      {/* ── Groups ──────────────────────────────────────────────────────────── */}
      {actionable.length === 0 ? (
        <div className="rounded-lg border border-border/50 bg-muted/20 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            No claimable bids right now.
          </p>
          <p className="mt-1 text-xs text-muted-foreground/70">
            Records are scanned across all auction programs when your wallet is connected.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {actionable.map((group) => (
            <ClaimGroup key={group.auctionId} group={group} />
          ))}
        </div>
      )}
    </div>
  );
}
