import type { AuctionView } from '@fairdrop/types/domain';
import { getRegistrySlot } from '../registry';

interface Props {
  auction: AuctionView;
}

export function AuctionAnalyticsTab({ auction }: Props) {
  const slot = getRegistrySlot(auction.type);
  const Chart = slot?.chartComponent ?? null;

  if (!Chart) {
    return (
      <div className="rounded-xl border border-border/60 bg-background/50 p-4">
        <p className="py-4 text-center text-sm text-muted-foreground">
          No price curve analytics available for this auction type.
        </p>
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
