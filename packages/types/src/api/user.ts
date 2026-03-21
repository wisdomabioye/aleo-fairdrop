import type { CreatorProfile } from '../domain/creator.js';
import type { BidView } from '../domain/bid.js';
import type { AuctionListItem } from '../domain/auction.js';
import type { VestingSchedule } from '../domain/vesting.js';
import type { Page } from './pagination.js';

export type UserProfileResponse = CreatorProfile;

export type UserBidsResponse     = Page<BidView>;
export type UserAuctionsResponse = Page<AuctionListItem>;
export type UserVestingResponse  = Page<VestingSchedule>;
