/**
 * Blockchain event types emitted by the indexer.
 * Each on-chain transition produces a TransitionEvent; mapping writes produce
 * MappingUpdateEvents. Services subscribe to these to update derived state.
 */

/** All fairdrop_dutch_v3.aleo transition names. Extend as new auction types land. */
export enum DutchTransition {
  CreateAuction       = 'create_auction',
  PlaceBidPrivate     = 'place_bid_private',
  PlaceBidPublic      = 'place_bid_public',
  PlaceBidPrivateRef  = 'place_bid_private_ref',
  PlaceBidPublicRef   = 'place_bid_public_ref',
  CloseAuction        = 'close_auction',
  PushReferralBudget  = 'push_referral_budget',
  Claim               = 'claim',
  ClaimVested         = 'claim_vested',
  WithdrawPayments    = 'withdraw_payments',
  WithdrawUnsold      = 'withdraw_unsold',
  CancelAuction       = 'cancel_auction',
  ClaimVoided         = 'claim_voided',
}

/** Utility contract transition names. */
export enum UtilityTransition {
  // fairdrop_proof_v3.aleo
  IssueReceipt       = 'issue_receipt',
  UpdateReputation   = 'update_reputation',
  // fairdrop_vest_v3.aleo
  CreateVest         = 'create_vest',
  Release            = 'release',
  // fairdrop_ref_v3.aleo
  RecordReferral     = 'record_referral',
  FundReserve        = 'fund_reserve',
  CreditCommission   = 'credit_commission',
  // fairdrop_gate_v3.aleo
  RegisterGate       = 'register_gate',
  CheckAdmission     = 'check_admission',
}

/** A single transition execution observed on-chain. */
export interface TransitionEvent {
  /** Unique transition ID (from Aleo node). */
  transitionId:    string;
  /** Transaction that contains this transition. */
  transactionId:   string;
  programId:       string;
  transitionName:  string;
  blockHeight:     number;
  timestamp:       Date;
  /** Public input values keyed by parameter name. */
  inputs:          Record<string, string>;
  /** Public output values keyed by position or name. */
  outputs:         Record<string, string>;
  /** Fee paid (microcredits). */
  fee:             string;
}

/** A mapping key/value update observed on-chain. */
export interface MappingUpdateEvent {
  programId:   string;
  mappingName: string;
  key:         string;
  value:       string;
  blockHeight: number;
  timestamp:   Date;
}
