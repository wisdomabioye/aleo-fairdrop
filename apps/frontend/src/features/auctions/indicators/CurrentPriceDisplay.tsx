import { formatMicrocredits } from '@fairdrop/sdk/credits';
import type { AuctionView } from '@fairdrop/types/domain';

interface Props {
  auction: AuctionView;
}

export function CurrentPriceDisplay({ auction }: Props) {
  const price = BigInt(auction.currentPrice ?? 0);
  if (price <= 0n) return null;

  return (
    <p className="py-2 text-sm font-semibold text-green-600 dark:text-green-400">
      Current Price: {formatMicrocredits(price)}
    </p>
  );
}
