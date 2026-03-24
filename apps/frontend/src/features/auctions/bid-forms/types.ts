import type { AuctionView, ProtocolConfig } from '@fairdrop/types/domain';

export interface BidFormProps {
  auction:        AuctionView;
  blockHeight:    number;
  protocolConfig: ProtocolConfig;
  /** Blocks behind chain tip — form is disabled when > 10. */
  lagBlocks:      number;
}
