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

// Sealed-bid auction
export type {
  SealedParams,
  SealedAuctionConfig,
  SealedCommitment,
  SealedBid,
  CommitState,
  CommitBidInput,
  CommitBidRefInput,
  RevealBidInput,
  SlashUnrevealedInput,
} from './sealed.js';

// Raise auction
export type { RaiseAuctionConfig, RaiseBid } from './raise.js';

// Ascending auction
export type {
  AscendingParams,
  AscendingAuctionConfig,
  AscendingBid,
} from './ascending.js';

// LBP auction
export type { LbpAuctionConfig, LbpBid } from './lbp.js';

// Quadratic auction
export type { QuadraticAuctionConfig, QuadraticBid } from './quadratic.js';
