// Common base types shared across all auction programs
export type {
  BaseAuctionConfig,
  AuctionState,
  BaseBid,
  AuctionStats,
  ConfigSnapshot,
  GateParams,
  VestParams,
} from './common';

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
} from './dutch';

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
} from './sealed';

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
} from './raise';

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
} from './ascending';

// LBP auction
export type {
  LbpParams,
  LbpAuctionConfig,
  LbpBid,
  LbpCreateAuctionInput,
  LbpPlaceBidInput,
  LbpCloseAuctionInput,
  LbpPushReferralBudgetInput,
  LbpClaimInput,
  LbpClaimVestedInput,
  LbpWithdrawPaymentsInput,
  LbpWithdrawUnsoldInput,
  LbpCancelAuctionInput,
} from './lbp';

// Quadratic auction
export type {
  QuadraticAuctionConfig,
  QuadraticBid,
  QuadraticCreateAuctionInput,
  QuadraticPlaceBidInput,
  QuadraticCloseAuctionInput,
  QuadraticPushReferralBudgetInput,
  QuadraticClaimInput,
  QuadraticClaimVestedInput,
  QuadraticWithdrawPaymentsInput,
  QuadraticWithdrawUnsoldInput,
  QuadraticCancelAuctionInput,
} from './quadratic';
