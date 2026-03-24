import { useState }           from 'react';
import { useWallet }           from '@provablehq/aleo-wallet-adaptor-react';
import { Button, Spinner }     from '@/components';
import { formatMicrocredits }  from '@fairdrop/sdk/credits';
import { AuctionStatus }       from '@fairdrop/types/domain';
import type { AuctionListItem, AuctionView } from '@fairdrop/types/domain';
import { parseExecutionError } from '@/shared/utils/errors';
import { useTransactionStore } from '@/stores/transaction.store';
import { useAuctions }         from '../../auctions/hooks/useAuctions';
import { useProtocolConfig }   from '../../auctions/hooks/useProtocolConfig';
import { auctionsService }     from '@/services/auctions.service';
import { AUCTION_REGISTRY }    from '../../auctions/registry';

export function CloseAuctionsTab() {
  const { connected, executeTransaction } = useWallet();
  const { setTx }     = useTransactionStore();
  const { data: pc }  = useProtocolConfig();

  const ended   = useAuctions({ status: AuctionStatus.Ended,   sort: 'endBlock', order: 'asc', pageSize: 50 });
  const clearing = useAuctions({ status: AuctionStatus.Clearing, sort: 'endBlock', order: 'asc', pageSize: 50 });

  const items: AuctionListItem[] = [
    ...(clearing.data?.items ?? []),
    ...(ended.data?.items ?? []),
  ];

  const [closing, setClosing] = useState<string | null>(null);
  const [errors,  setErrors]  = useState<Record<string, string>>({});

  async function handleClose(auction: AuctionListItem) {
    if (!connected) return;
    setErrors((e) => ({ ...e, [auction.id]: '' }));
    setClosing(auction.id);
    try {
      // Re-fetch full detail to get live volume + closer_reward (D11 validation)
      const full: AuctionView = await auctionsService.get(auction.id);
      const result = await executeTransaction({
        program:  full.programId,
        function: 'close_auction',
        inputs: [
          full.id,
          full.creator,
          String(full.status === AuctionStatus.Clearing), // filled = supply_met
          `${full.totalCommitted}u128`,                    // volume
          `${full.closerReward}u128`,                      // closer_reward
        ],
        fee: 0.5,
      });
      if (result?.transactionId) setTx(result.transactionId, 'Close auction');
    } catch (err) {
      setErrors((e) => ({ ...e, [auction.id]: parseExecutionError(err) }));
    } finally {
      setClosing(null);
    }
  }

  const isLoading = ended.isLoading || clearing.isLoading;

  if (isLoading) {
    return <div className="flex justify-center py-8"><Spinner className="h-6 w-6" /></div>;
  }

  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        No auctions waiting to be closed right now.
      </p>
    );
  }

  const rewardLabel = pc ? formatMicrocredits(BigInt(pc.closerReward)) : '…';

  return (
    <div className="space-y-2">
      {items.map((a) => {
        const slot   = AUCTION_REGISTRY[a.type];
        const isBusy = closing === a.id;
        return (
          <div
            key={a.id}
            className="flex items-center justify-between rounded-md border border-border px-4 py-3 text-sm gap-3"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${slot?.color ?? ''}`}>
                {slot?.label ?? a.type}
              </span>
              <span className="truncate font-medium">{a.name ?? `${a.id.slice(0, 12)}…`}</span>
              <span className="text-muted-foreground text-xs shrink-0">ends #{a.endBlock}</span>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <Button
                size="sm"
                variant="outline"
                disabled={!connected || !!closing}
                onClick={() => handleClose(a)}
              >
                {isBusy
                  ? <><Spinner className="mr-2 h-3 w-3" />Submitting…</>
                  : `Close & Earn ${rewardLabel}`}
              </Button>
              {errors[a.id] && <p className="text-xs text-destructive">{errors[a.id]}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
