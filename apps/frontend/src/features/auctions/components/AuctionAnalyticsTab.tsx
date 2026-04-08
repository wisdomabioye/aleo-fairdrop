import { AuctionType } from '@fairdrop/types/domain';
import type { AuctionView } from '@fairdrop/types/domain';
import { getRegistrySlot } from '../registry';

interface Props {
  auction: AuctionView;
}

function NoChartMessage({ auction }: { auction: AuctionView }) {
  if (auction.type === AuctionType.Sealed && auction.params.type === AuctionType.Sealed) {
    const commitEndBlock = auction.params.commit_end_block;
    return (
      <div className="space-y-1 py-4 text-center">
        <p className="text-sm text-muted-foreground">
          Clearing price is the Dutch price at block {commitEndBlock.toLocaleString()}.
        </p>
        <p className="text-xs text-muted-foreground/70">
          Revealed only after the commit window closes — use the Estimate panel to preview.
        </p>
      </div>
    );
  }
  return (
    <p className="py-4 text-center text-sm text-muted-foreground">
      No price curve available for this auction type.
    </p>
  );
}

export function AuctionAnalyticsTab({ auction }: Props) {
  const slot = getRegistrySlot(auction.type);
  const Chart = slot?.chartComponent ?? null;

  if (!Chart) {
    return (
      <div className="rounded-xl border border-border/60 bg-background/50 p-4">
        <NoChartMessage auction={auction} />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/60 bg-background/50 p-4">
      <p className="mb-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Price Curve
      </p>
      <Chart auction={auction} />
    </div>
  );
}
