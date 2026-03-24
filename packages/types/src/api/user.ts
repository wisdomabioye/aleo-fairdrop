import type { CreatorProfile } from '../domain/creator';
import type { BidView } from '../domain/bid';
import type { AuctionListItem } from '../domain/auction';
import type { VestingSchedule } from '../domain/vesting';
import type { Page } from './pagination';

export type UserProfileResponse = CreatorProfile;

export type UserBidsResponse     = Page<BidView>;
export type UserAuctionsResponse = Page<AuctionListItem>;
export type UserVestingResponse  = Page<VestingSchedule>;
