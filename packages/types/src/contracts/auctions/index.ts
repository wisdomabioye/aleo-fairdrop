// Common base types shared across all auction programs
export type {
  BaseAuctionConfig,
  AuctionState,
  BaseBid,
  AuctionStats,
  ConfigSnapshot,
  GateParams,
  VestParams,
} from './common.js';

// Dutch auction
export type {
  DutchParams,
  DutchAuctionConfig,
  DutchBid,
  CreateAuctionInput,
  PlaceBidPublicInput,
  PlaceBidPrivateInput,
  PlaceBidPublicRefInput,
  PlaceBidPrivateRefInput,
  CloseAuctionInput,
  PushReferralBudgetInput,
  ClaimInput,
  ClaimVestedInput,
  WithdrawPaymentsInput,
  WithdrawUnsoldInput,
  CancelAuctionInput,
} from './dutch.js';
export { DUTCH_PROGRAM_ID, DUTCH_PROGRAM_SALT, DUTCH_REFERRAL_SHARE_BPS } from './dutch.js';

// Sealed-bid auction
export type { SealedAuctionConfig, SealedBid } from './sealed.js';
export { SEALED_PROGRAM_ID, SEALED_PROGRAM_SALT } from './sealed.js';

// Raise auction
export type { RaiseAuctionConfig, RaiseBid } from './raise.js';
export { RAISE_PROGRAM_ID, RAISE_PROGRAM_SALT } from './raise.js';

// Ascending auction
export type { AscendingAuctionConfig, AscendingBid } from './ascending.js';
export { ASCENDING_PROGRAM_ID, ASCENDING_PROGRAM_SALT } from './ascending.js';

// LBP auction
export type { LbpAuctionConfig, LbpBid } from './lbp.js';
export { LBP_PROGRAM_ID, LBP_PROGRAM_SALT } from './lbp.js';

// Quadratic auction
export type { QuadraticAuctionConfig, QuadraticBid } from './quadratic.js';
export { QUADRATIC_PROGRAM_ID, QUADRATIC_PROGRAM_SALT } from './quadratic.js';
