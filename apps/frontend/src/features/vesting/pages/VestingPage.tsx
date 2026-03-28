import { RefreshCw }          from 'lucide-react';
import { useWallet }           from '@provablehq/aleo-wallet-adaptor-react';
import { Button, PageHeader, Spinner } from '@/components';
import { ConnectWalletPrompt } from '@/shared/components/wallet/ConnectWalletPrompt';
import { useBlockHeight }      from '@/shared/hooks/useBlockHeight';
import { useVestRecords }      from '../hooks/useVestRecords';
import { VestCard }            from '../components/VestCard';

export function VestingPage() {
  const { connected }               = useWallet();
  const { data: blockHeight = 0 }   = useBlockHeight();
  const { records, auctionMap, loading, reload } = useVestRecords();

  const pageHeader = (
    <PageHeader
      title="Vesting"
      description="Release vested token allocations from auctions you participated in."
    />
  );

  if (!connected) {
    return (
      <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-5 lg:p-6">
        {pageHeader}
        <ConnectWalletPrompt message="Connect your wallet to see your vesting positions." />
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

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 sm:p-5 lg:p-6">
      {pageHeader}

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {records.length === 0
            ? 'No vesting positions found.'
            : <><span className="font-medium text-foreground">{records.length}</span> position{records.length !== 1 ? 's' : ''}</>
          }
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

      {records.length === 0 ? (
        <div className="rounded-lg border border-border/50 bg-muted/20 py-12 text-center">
          <p className="text-sm text-muted-foreground">No vesting positions found.</p>
          <p className="mt-1 text-xs text-muted-foreground/70">
            Vested allocations appear here after claiming from an auction with a vesting schedule.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {records.map((v, i) => (
            <VestCard
              key={`${v.auctionId}:${v.tokenId}:${i}`}
              vest={v}
              auction={auctionMap[v.auctionId]}
              blockHeight={blockHeight}
            />
          ))}
        </div>
      )}
    </div>
  );
}
