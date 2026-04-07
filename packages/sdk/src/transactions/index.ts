/**
 * Transaction input builders for all fairdrop contracts.
 *
 * import { buildCreateAuction, closeAuction, claimBid, … } from '@fairdrop/sdk/transactions'
 *
 * Each function encodes the exact input ordering for one on-chain transition
 * and returns a TxSpec (or CreateAuctionSpec) that can be spread directly
 * into executeTransaction().
 *
 * D11 pattern: caller reads public on-chain state and passes it as inputs;
 * finalize validates with assert_eq. Wrong inputs → tx fails in finalize.
 *
 * Quadratic claims require totalSqrtWeight from fetchSqrtWeights() in @fairdrop/sdk/chain.
 * create_auction nonce requires fetchCreatorNonce() from @fairdrop/sdk/chain.
 */

export { DEFAULT_TX_FEE, type TxSpec, type ClaimRecord } from './_types';

// ── Auction setup ─────────────────────────────────────────────────────────────

export {
  buildCreateAuction,
  type CreateAuctionInput,
  type CreateBase,
  type GateInput,
  type VestInput,
  type ConfigSnapshotInput,
} from './create';

// ── Auction lifecycle ─────────────────────────────────────────────────────────

export {
  closeAuction,
  cancelAuction,
  pushReferralBudget,
  withdrawPayments,
  withdrawUnsold,
  withdrawTreasuryFees,
} from './auction';

// ── Claims ────────────────────────────────────────────────────────────────────

export {
  claimBid,
  claimVested,
  claimVoided,
  claimCommitVoided,
  claimRaiseBid,
  claimRaiseVested,
  claimQuadraticBid,
  claimQuadraticVested,
  type ContributionAuction,
} from './claim';

// ── Bids ──────────────────────────────────────────────────────────────────────

export {
  placeBidPublic,
  placeBidPublicRef,
  placeBidPrivate,
  placeBidPrivateRef,
  type BidParams,
} from './bid';

// ── Sealed commit / reveal ────────────────────────────────────────────────────

export {
  commitBidPublic,
  commitBidPublicRef,
  commitBidPrivate,
  commitBidPrivateRef,
  revealBid,
  slashUnrevealed,
} from './sealed';

// ── Gate verification (user pre-steps for gated auctions) ─────────────────────

export { verifyMerkle, verifyCredential, setGateAllowedCaller } from './gate';

// ── Proof participation ────────────────────────────────────────────────────────

export { setProofAllowedCaller } from './proof';

// ── Referral ──────────────────────────────────────────────────────────────────

export {
  createReferralCode,
  creditCommission,
  claimCommission,
  setRefAllowedCaller,
} from './ref';

// ── Vesting ───────────────────────────────────────────────────────────────────

export { releaseVested, setVestAllowedCaller } from './vest';

// ── AMM seeding ───────────────────────────────────────────────────────────────

export {
  buildSeedFromAuction,
  buildAddLiquidity,
  type SeedFromAuctionInput,
} from './dex';

// ── Protocol config (multisig-protected) ─────────────────────────────────────

export {
  setFeeBps,
  setCreationFee,
  setCloserReward,
  setSlashRewardBps,
  setMaxReferralBps,
  setReferralPoolBps,
  setMinAuctionDuration,
  setPaused,
} from './config';
