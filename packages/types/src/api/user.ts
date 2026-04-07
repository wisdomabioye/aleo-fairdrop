import type { BidView } from '../domain/bid';
import type { AuctionListItem } from '../domain/auction';
import type { VestingSchedule } from '../domain/vesting';
import type { Page } from './pagination';

/** Bidder-side profile — on-chain participation stats as a buyer. */
export interface UserProfileResponse {
  address:        string;
  totalAuctions:  number;
  filledAuctions: number;
  fillRate:       number | null;
}

export type UserBidsResponse     = Page<BidView>;
export type UserAuctionsResponse = Page<AuctionListItem>;
export type UserVestingResponse  = Page<VestingSchedule>;
