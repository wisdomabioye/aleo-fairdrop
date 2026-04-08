import { AuctionType } from '@fairdrop/types/domain';

/** Hex color values for each auction type — used by Recharts charts. */
export const AUCTION_TYPE_COLOR: Record<AuctionType, string> = {
  [AuctionType.Dutch]:     '#3b82f6',
  [AuctionType.Sealed]:    '#a855f7',
  [AuctionType.Raise]:     '#22c55e',
  [AuctionType.Ascending]: '#f97316',
  [AuctionType.Lbp]:       '#f59e0b',
  [AuctionType.Quadratic]: '#f43f5e',
};
