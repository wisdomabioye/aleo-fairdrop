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
  DutchCreateAuctionInput,
  DutchPlaceBidPublicInput,
  DutchPlaceBidPrivateInput,
  DutchPlaceBidPublicRefInput,
  DutchPlaceBidPrivateRefInput,
  DutchCloseAuctionInput,
  DutchPushReferralBudgetInput,
  DutchClaimInput,
  DutchClaimVestedInput,
  DutchWithdrawPaymentsInput,
  DutchWithdrawUnsoldInput,
  DutchCancelAuctionInput,
} from './dutch.js';

// Sealed-bid auction
export type {
  SealedParams,
  SealedAuctionConfig,
  SealedCommitment,
  SealedBid,
  CommitState,
  SealedCreateAuctionInput,
  SealedCommitBidInput,
  SealedCommitBidRefInput,
  SealedRevealBidInput,
  SealedSlashUnrevealedInput,
  SealedCloseAuctionInput,
  SealedClaimInput,
  SealedClaimVestedInput,
  SealedPushReferralBudgetInput,
  SealedWithdrawPaymentsInput,
  SealedWithdrawUnsoldInput,
  SealedCancelAuctionInput,
} from './sealed.js';

// Raise auction
export type {
  RaiseAuctionConfig,
  RaiseBid,
  RaiseCreateAuctionInput,
  RaisePlaceBidPublicInput,
  RaisePlaceBidPrivateInput,
  RaisePlaceBidPublicRefInput,
  RaisePlaceBidPrivateRefInput,
  RaiseCloseAuctionInput,
  RaisePushReferralBudgetInput,
  RaiseClaimInput,
  RaiseClaimVestedInput,
  RaiseWithdrawPaymentsInput,
  RaiseWithdrawUnsoldInput,
  RaiseCancelAuctionInput,
} from './raise.js';

// Ascending auction
export type {
  AscendingParams,
  AscendingAuctionConfig,
  AscendingBid,
  AscendingCreateAuctionInput,
  AscendingPlaceBidPublicInput,
  AscendingPlaceBidPrivateInput,
  AscendingPlaceBidPublicRefInput,
  AscendingPlaceBidPrivateRefInput,
  AscendingCloseAuctionInput,
  AscendingClaimInput,
  AscendingClaimVestedInput,
  AscendingPushReferralBudgetInput,
  AscendingWithdrawPaymentsInput,
  AscendingWithdrawUnsoldInput,
  AscendingCancelAuctionInput,
} from './ascending.js';

// LBP auction
export type { LbpAuctionConfig, LbpBid } from './lbp.js';

// Quadratic auction
export type { QuadraticAuctionConfig, QuadraticBid } from './quadratic.js';
