import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  InfoRow,
  Progress,
  Separator,
} from '@/components';
import { formatMicrocredits } from '@fairdrop/sdk/credits';
import { formatAmount } from '@fairdrop/sdk/format';
import type { AuctionView } from '@fairdrop/types/domain';

interface Props {
  auction: AuctionView;
}

export function AuctionSalesCard({ auction }: Props) {
  const decimals = auction.saleTokenDecimals ?? 0;
  const symbol   = auction.saleTokenSymbol ?? '';
  const pct      = auction.progressPct;

  return (
    <Card className="border-sky-500/10 bg-gradient-surface shadow-xs ring-1 ring-white/5">
      <CardHeader className="pb-0">
        <CardTitle className="text-sm font-semibold">Sales & Supply</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-3">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Progress</span>
            <span className="font-medium">{pct.toFixed(1)}%</span>
          </div>
          <Progress value={pct} className="h-2" />
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Sold: {formatAmount(auction.totalCommitted, decimals)} {symbol}</span>
            <span>Supply: {formatAmount(auction.supply, decimals)} {symbol}</span>
          </div>
        </div>

        <Separator />

        <InfoRow
          label="Clearing price"
          value={
            auction.clearingPrice != null
              ? <span className="text-xs font-medium">{formatMicrocredits(auction.clearingPrice)} / token</span>
              : <span className="text-xs text-muted-foreground">Set at clearing</span>
          }
        />
        <InfoRow
          label="Creator revenue"
          value={
            auction.creatorRevenue != null
              ? <span className="text-xs font-semibold text-emerald-500">{formatMicrocredits(auction.creatorRevenue)}</span>
              : <span className="text-xs text-muted-foreground">Available after clearing</span>
          }
        />
      </CardContent>
    </Card>
  );
}
