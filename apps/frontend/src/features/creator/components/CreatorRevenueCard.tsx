import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  InfoRow,
  Separator,
  Spinner,
} from '@/components';
import { formatMicrocredits } from '@fairdrop/sdk/credits';
import { formatAmount } from '@fairdrop/sdk/format';
import type { AuctionView } from '@fairdrop/types/domain';

interface Props {
  auction:           AuctionView;
  paymentsWithdrawn: bigint;
  unsoldWithdrawn:   bigint;
  loading:           boolean;
}

export function CreatorRevenueCard({ auction, paymentsWithdrawn, unsoldWithdrawn, loading }: Props) {
  const decimals = auction.saleTokenDecimals ?? 0;
  const symbol   = auction.saleTokenSymbol ?? '';
  const revenue  = BigInt(auction.creatorRevenue ?? 0);
  const unsold   = BigInt(auction.supply) - BigInt(auction.totalCommitted);

  const revenueRemaining = revenue - BigInt(paymentsWithdrawn);
  const unsoldRemaining  = unsold  - BigInt(unsoldWithdrawn);

  return (
    <Card className="border-sky-500/10 bg-gradient-surface shadow-xs ring-1 ring-white/5">
      <CardHeader className="pb-0">
        <CardTitle className="text-sm font-semibold">Revenue</CardTitle>
      </CardHeader>
      <CardContent className="pt-3">
        {loading ? (
          <div className="flex justify-center py-4"><Spinner className="size-5" /></div>
        ) : (
          <div className="space-y-2">
            <InfoRow label="Total revenue" value={<span className="text-xs font-semibold">{formatMicrocredits(revenue)}</span>} />
            <InfoRow label="Withdrawn"     value={<span className="text-xs text-muted-foreground">{formatMicrocredits(paymentsWithdrawn)}</span>} />
            <InfoRow label="Remaining"     value={<span className="text-xs font-semibold text-emerald-500">{formatMicrocredits(revenueRemaining)}</span>} />

            {unsold > 0n && (
              <>
                <Separator />
                <InfoRow label="Unsold supply"    value={<span className="text-xs">{formatAmount(unsold, decimals)} {symbol}</span>} />
                <InfoRow label="Unsold withdrawn" value={<span className="text-xs text-muted-foreground">{formatAmount(unsoldWithdrawn, decimals)} {symbol}</span>} />
                <InfoRow label="Unsold remaining" value={<span className="text-xs font-semibold text-amber-500">{formatAmount(unsoldRemaining, decimals)} {symbol}</span>} />
              </>
            )}

            {auction.referralBudget != null && auction.referralBudget > 0n && (
              <>
                <Separator />
                <InfoRow label="Referral budget" value={<span className="text-xs font-medium text-sky-500">{formatMicrocredits(auction.referralBudget)}</span>} />
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
