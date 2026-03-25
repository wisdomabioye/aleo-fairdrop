import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components';
import { formatMicrocredits }       from '@fairdrop/sdk/credits';
import { AuctionStatus }            from '@fairdrop/types/domain';
import { useAuctions }              from '../../auctions/hooks/useAuctions';
import { useProtocolConfig }        from '../../../shared/hooks/useProtocolConfig';
import { CloseAuctionsTab }         from '../components/CloseAuctionsTab';
import { SlashBidsTab }             from '../components/SlashBidsTab';
import { ReferralCommissionsTab }   from '../components/ReferralCommissionsTab';

export function EarningsPage() {
  const ended   = useAuctions({ status: AuctionStatus.Ended,   pageSize: 1 });
  const clearing = useAuctions({ status: AuctionStatus.Clearing, pageSize: 1 });
  const { data: pc } = useProtocolConfig();

  const closeableCount  = (ended.data?.total ?? 0) + (clearing.data?.total ?? 0);
  const closerReward    = pc ? formatMicrocredits(BigInt(pc.closerReward)) : '…';

  return (
    <div className="max-w-3xl mx-auto space-y-6 py-6 px-4">
      <div>
        <h1 className="text-2xl font-semibold">Earnings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Close auctions, slash unrevealed bids, and claim referral commissions.
        </p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-md border border-border bg-card px-4 py-3">
          <p className="text-2xl font-semibold">{closeableCount}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Auctions to close</p>
          <p className="text-xs text-emerald-600 dark:text-emerald-400">{closerReward} each</p>
        </div>
        <div className="rounded-md border border-border bg-card px-4 py-3">
          <p className="text-2xl font-semibold">—</p>
          <p className="text-xs text-muted-foreground mt-0.5">Slashable commitments</p>
          <p className="text-xs text-muted-foreground">Connect wallet to load</p>
        </div>
        <div className="rounded-md border border-border bg-card px-4 py-3">
          <p className="text-2xl font-semibold">—</p>
          <p className="text-xs text-muted-foreground mt-0.5">Referral earned</p>
          <p className="text-xs text-muted-foreground">Connect wallet to load</p>
        </div>
      </div>

      <Tabs defaultValue="close">
        <TabsList>
          <TabsTrigger value="close">
            Close Auctions
            {closeableCount > 0 && (
              <span className="ml-1.5 rounded-full bg-primary text-primary-foreground text-xs px-1.5 py-0.5 leading-none">
                {closeableCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="slash">Slash Bids</TabsTrigger>
          <TabsTrigger value="referral">Referral Commissions</TabsTrigger>
        </TabsList>

        <TabsContent value="close"   className="mt-4"><CloseAuctionsTab /></TabsContent>
        <TabsContent value="slash"   className="mt-4"><SlashBidsTab /></TabsContent>
        <TabsContent value="referral" className="mt-4"><ReferralCommissionsTab /></TabsContent>
      </Tabs>
    </div>
  );
}
