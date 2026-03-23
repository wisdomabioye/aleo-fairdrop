import type { AuctionView } from '@fairdrop/types/domain';

export interface PricePanelProps {
  auction:      AuctionView;
  blockHeight:  number;
  currentPrice: bigint | null;
}
