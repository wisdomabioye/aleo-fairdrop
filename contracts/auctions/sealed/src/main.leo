// fairdrop_sealed_v3.aleo — Privacy-preserving sealed-bid commit-reveal auction.
//
// Mechanism: three-phase commit-reveal with uniform Dutch clearing price.
//   COMMIT  [start_block → commit_end_block]: bidders lock payment + commit to quantity hash.
//   REVEAL  [commit_end_block → end_block]:   bidders reveal quantity; contract verifies hash.
//   SLASH   [end_block → close_auction]:      anyone may slash unrevealed commitments.
//
// Clearing price = Dutch price at commit_end_block (deterministic, set before reveals).
// All winners pay the same clearing price (uniform clearing, same as fairdrop_dutch).
// Overpayment (payment_amount - cost) refunded privately at claim.
//
// Privacy model:
//   - Committed quantity : completely hidden during commit window (only hash on-chain).
//   - Payment amount     : public (on-chain escrow accounting; used as collateral).
//   - Bidder identity    : pseudonymous — only BHP256(bidder, auction_id) on-chain.
//   - Token recipients   : private (mint_private / transfer_public_to_private).
//   - Vest owner         : private (passed as private param to create_vest CPI).
//
// Commitment scheme:
//   commitment = BHP256(CommitRevealKey { quantity, nonce, bidder })
//   Bidder keeps (quantity, nonce) secret; reveals them in the reveal window.
//   One commit per bidder enforced via bid_committed mapping.
//
// Slash model (S5 anti-griefing):
//   After end_block, any unrevealed commitment may be slashed by anyone.
//   Slash reward = payment_amount * slash_reward_bps / 10000 → caller.
//   Remaining payment → protocol treasury.
//   Requires off-chain slasher bot watching commit events.
//
// Revenue accounting (set at close_auction):
//   clearing_price  = Dutch price at commit_end_block
//   total_cost      = total_committed * clearing_price / sale_scale
//   protocol_fee    = total_cost * fee_bps / 10000
//   creator_revenue = total_cost - protocol_fee
//   referral_budget = protocol_fee * referral_pool_bps / 10000
//
// Auction ID derivation:
//   auction_id = BHP256(AuctionKey { creator, nonce, PROGRAM_SALT = 3field })
//
// Pause model:
//   All finalizes except claim_voided and claim_commit_voided assert !paused.
//   Voided claim paths are always available — bidder capital must never be trapped.
//
// Lifecycle:
//   create_auction → commit_bid_* → reveal_bid → [slash_unrevealed] →
//   close_auction → [push_referral_budget] → claim / claim_vested →
//   withdraw_payments + withdraw_unsold
//   OR: cancel_auction → claim_voided / claim_commit_voided

// ── Leo 4.0 migration notes ───────────────────────────────────────────────────
//   async constructor → constructor
//   async transition  → fn; async function finalize_* → deleted, inlined as final {}
//   self.signer captured before final {} where needed
//   record fields captured before final {} in reveal_bid, claim, claim_vested, claim_voided, claim_commit_voided
//   structs moved outside program {}
//   Future → Final, .aleo/ → .aleo::
// ─────────────────────────────────────────────────────────────────────────────

import fairdrop_multisig_v1.aleo;
import credits.aleo;
import token_registry.aleo;
import fairdrop_config_v2.aleo;
import fairdrop_gate_v2.aleo;
import fairdrop_proof_v2.aleo;
import fairdrop_ref_v2.aleo;
import fairdrop_vest_v2.aleo;
import fairswap_dex_v3.aleo;

// =========================================================================
// Structs (moved outside program {} per Leo 4.0)
// =========================================================================

struct TokenOwner { account: address, token_id: field }

struct AuctionKey { creator: address, nonce: u64, program_salt: field }

// Pseudonymous bidder key (raw address never on-chain).
struct BidderKey { bidder: address, auction_id: field }

// BHP256 input for multisig-approved treasury withdrawal. Matches multisig doc.
struct WithdrawalOp  { amount: u128, recipient: address, nonce: u64 }
struct PauseToggleOp { paused: bool, nonce: u64 }

// Pre-image of the commitment hash. Bidder keeps (quantity, nonce) secret until reveal.
struct CommitRevealKey { quantity: u128, nonce: field, bidder: address }

// Immutable auction parameters — written once at create_auction.
// Dutch price params determine the clearing price at commit_end_block.
struct AuctionConfig {
    auction_id:         field,
    creator:            address,
    sale_token_id:      field,
    payment_token_id:   field,
    supply:             u128,
    start_price:        u128,     // Dutch price at start_block (descending)
    floor_price:        u128,     // minimum clearing price
    start_block:        u32,
    end_block:          u32,      // = reveal_end_block; slash window ends here
    price_decay_blocks: u32,      // blocks per price step (for Dutch clearing calc)
    price_decay_amount: u128,     // price drop per step
    commit_end_block:   u32,      // end of commit window; clearing price fixed here
    max_bid_amount:     u128,     // 0 = no per-bidder cap (applied at reveal)
    min_bid_amount:     u128,
    sale_scale:         u128,
    gate_mode:          u8,
    vest_enabled:       bool,
    vest_cliff_blocks:  u32,
    vest_end_blocks:    u32,
    fee_bps:            u16,
    closer_reward:      u128,
    referral_pool_bps:  u16,
    slash_reward_bps:   u16,    // D16: snapshotted at create for slash_unrevealed
    metadata_hash:      field,
}

struct AuctionState {
    total_committed: u128,
    total_payments:  u128,
    supply_met:      bool,
    ended_at_block:  u32,
    cleared:         bool,
    clearing_price:  u128,
    creator_revenue: u128,
    protocol_fee:    u128,
    voided:          bool,
    referral_budget: u128,
}

// Stored per bidder in pending_commits. Keyed by BHP256(BidderKey).
struct CommitState {
    auction_id:      field,
    commitment_hash: field,   // BHP256(CommitRevealKey) — verified at reveal
    payment_amount:  u128,
    revealed:        bool,
    slashed:         bool,    // true after slash_unrevealed; blocks claim_commit_voided
}

struct Stats {
    total_auctions:          u64,
    total_bids:              u64,
    total_payment_collected: u128,
}

// Input struct: sealed-specific parameters (price decay + window blocks).
struct SealedParams {
    start_price:        u128,
    floor_price:        u128,
    price_decay_blocks: u32,
    price_decay_amount: u128,
    commit_end_block:   u32,
    // reveal_end_block passed directly as end_block parameter
}

struct GateParams {
    gate_mode:   u8,
    merkle_root: field,
    issuer:      address,
}

struct VestParams {
    vest_enabled:      bool,
    vest_cliff_blocks: u32,
    vest_end_blocks:   u32,
}

struct ConfigSnapshot {
    fee_bps:           u16,
    creation_fee:      u128,
    closer_reward:     u128,
    slash_reward_bps:  u16,
    referral_pool_bps: u16,
}

program fairdrop_sealed_v3.aleo {
    // Upgrade governance: 3-of-5 multi-sig must call fairdrop_multisig_v1.aleo::approve_upgrade
    // with contract_key=11field and this program's compiled checksum before deployment.
    @checksum(mapping="fairdrop_multisig_v1.aleo::approved_upgrades", key="11field")
    constructor() {}

    // =========================================================================
    // Constants
    // =========================================================================

    const CREDITS_RESERVED_TOKEN_ID: field =
        3443843282313283355522573239085696902919850365217539366784739393210722344986field;

    const SUPPLY_MANAGER_ROLE: u8 = 3u8;

    // Distinguishes sealed auction_ids from other program types.
    // MUST differ from fairdrop_dutch (1field) and fairdrop_ascending (2field).
    const PROGRAM_SALT: field = 3field;

    // Burn address — all-zeros Aleo address. Used to guard lp_recipient in seed_liquidity.
    const ZERO_ADDRESS: address = aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc;

    // =========================================================================
    // Records
    // =========================================================================

    // Private commitment receipt — single-spend UTXO consumed at reveal_bid.
    //
    // quantity and nonce are private copies stored for the owner's use at reveal time.
    // They are encrypted to the owner's view key on-chain — no observer can read them.
    // The wallet (AutoDecrypt) surfaces them so the frontend can pre-fill the reveal form
    // without requiring localStorage or any external persistence.
    // The on-chain commitment_hash is unaffected — privacy guarantee is unchanged.
    record Commitment {
        owner:          address,
        auction_id:     field,
        commitment:     field,   // BHP256(CommitRevealKey) — verified against pending_commits
        payment_amount: u128,
        quantity:       u128,   // private — for owner's reveal use only
        nonce:          field,  // private — for owner's reveal use only
    }

    // Private bid receipt — issued at reveal_bid; consumed at claim / claim_vested /
    // claim_voided. Uniform clearing price applies — full payment_amount stored for refund.
    record Bid {
        owner:          address,
        auction_id:     field,
        quantity:       u128,    // effective (capped) quantity after reveal
        payment_amount: u128,
    }

    // =========================================================================
    // Mappings
    // =========================================================================

    mapping auction_configs:  field => AuctionConfig;
    mapping auction_states:   field => AuctionState;

    // BHP256(BidderKey) → CommitState. One commit per bidder per auction.
    mapping pending_commits: field => CommitState;

    // BHP256(BidderKey) → true once committed; prevents second commit.
    mapping bid_committed: field => bool;

    // Burn-backed mint budget; decremented at claim / withdraw_unsold.
    mapping escrow_sales: field => u128;

    // Bidder credits locked in this program's public credits.aleo balance.
    mapping escrow_payments: field => u128;

    mapping creator_withdrawn: field => u128;
    mapping unsold_withdrawn:  field => u128;

    mapping stats:         field => Stats;
    mapping auction_index: u64   => field;

    mapping creator_auction_count:   address => u64;
    mapping creator_latest_auction:  address => field;
    mapping auction_prev_by_creator: field   => field;
    mapping creator_nonces:          address => u64;

    mapping protocol_treasury: field => u128;

    // Replay protection for withdraw_treasury_fees approvals.
    // Local auction pause. key = 0field; default false (running).
    // Either this OR fairdrop_config_v2::paused being true halts this auction.
    mapping paused:       field => bool;
    mapping consumed_ops: field => bool;

    // =========================================================================
    // 1. create_auction
    // =========================================================================
    //
    // `end_block` = reveal_end_block (the final auction deadline).
    // `sealed.commit_end_block` must satisfy: start_block < commit_end_block < end_block.
    // Clearing price = Dutch price at commit_end_block (validated in finalize).

    fn create_auction(
        token:                 token_registry.aleo::Token,
        public sale_token_id:  field,
        public supply:         u128,
        public start_block:    u32,
        public end_block:      u32,    // = reveal_end_block
        public max_bid_amount: u128,
        public min_bid_amount: u128,
        public sale_scale:     u128,
        public nonce:          u64,
        public metadata_hash:  field,
        public sealed:         SealedParams,
        public gate:           GateParams,
        public vest:           VestParams,
        public snapshot:       ConfigSnapshot,
    ) -> (token_registry.aleo::Token, Final) {
        assert(supply > 0u128);
        assert_eq(token.token_id, sale_token_id);
        assert_eq(token.amount, supply);

        let signer: address = self.signer;

        let auction_id: field = BHP256::hash_to_field(AuctionKey {
            creator:      signer,
            nonce:        nonce,
            program_salt: PROGRAM_SALT,
        });

        let (remainder, f_burn): (token_registry.aleo::Token, Final) =
            token_registry.aleo::burn_private(token, supply);

        let f_creation: Final =
            credits.aleo::transfer_public_as_signer(self.address, snapshot.creation_fee as u64);

        // assert_config validates fee params and end_block > start_block.
        let f_cfg: Final = fairdrop_config_v2.aleo::assert_config(
            snapshot.fee_bps,
            snapshot.creation_fee,
            snapshot.closer_reward,
            snapshot.slash_reward_bps,
            snapshot.referral_pool_bps,
            start_block,
            end_block,
        );

        let f_gate: Final = fairdrop_gate_v2.aleo::register_gate(
            auction_id,
            gate.gate_mode,
            gate.merkle_root,
            gate.issuer,
        );

        let config: AuctionConfig = AuctionConfig {
            auction_id:         auction_id,
            creator:            signer,
            sale_token_id:      sale_token_id,
            payment_token_id:   CREDITS_RESERVED_TOKEN_ID,
            supply:             supply,
            start_price:        sealed.start_price,
            floor_price:        sealed.floor_price,
            start_block:        start_block,
            end_block:          end_block,
            price_decay_blocks: sealed.price_decay_blocks,
            price_decay_amount: sealed.price_decay_amount,
            commit_end_block:   sealed.commit_end_block,
            max_bid_amount:     max_bid_amount,
            min_bid_amount:     min_bid_amount,
            sale_scale:         sale_scale,
            gate_mode:          gate.gate_mode,
            vest_enabled:       vest.vest_enabled,
            vest_cliff_blocks:  vest.vest_cliff_blocks,
            vest_end_blocks:    vest.vest_end_blocks,
            fee_bps:            snapshot.fee_bps,
            closer_reward:      snapshot.closer_reward,
            referral_pool_bps:  snapshot.referral_pool_bps,
            slash_reward_bps:   snapshot.slash_reward_bps,
            metadata_hash:      metadata_hash,
        };

        let creation_fee: u128 = snapshot.creation_fee;

        return (remainder, final {
            f_burn.run();
            f_creation.run();
            f_cfg.run();
            f_gate.run();

            assert(!fairdrop_config_v2.aleo::paused.get_or_use(0field, false) && !paused.get_or_use(0field, false));

            assert_eq(config.payment_token_id, CREDITS_RESERVED_TOKEN_ID);
            assert(config.sale_token_id != CREDITS_RESERVED_TOKEN_ID);
            assert(config.start_block >= block.height);
            assert(config.floor_price > 0u128);
            assert(config.start_price > config.floor_price);
            assert(config.price_decay_blocks > 0u32);
            assert(config.price_decay_amount > 0u128);
            assert(config.min_bid_amount > 0u128);
            assert(config.max_bid_amount == 0u128 || config.max_bid_amount >= config.min_bid_amount);

            // Window ordering: start_block < commit_end_block < end_block (reveal_end_block).
            assert(config.commit_end_block > config.start_block);
            assert(config.end_block > config.commit_end_block);

            // D11 nonce validation.
            assert_eq(nonce, creator_nonces.get_or_use(signer, 0u64));

            let expected_id: field = BHP256::hash_to_field(AuctionKey {
                creator:      signer,
                nonce:        nonce,
                program_salt: PROGRAM_SALT,
            });
            assert_eq(auction_id, expected_id);
            assert_eq(config.auction_id, auction_id);

            // Verify fairdrop_sealed_v3.aleo has SUPPLY_MANAGER_ROLE on the sale token.
            let sealed_role_key: field = BHP256::hash_to_field(TokenOwner {
                account:  fairdrop_sealed_v3.aleo,
                token_id: config.sale_token_id,
            });
            assert_eq(
                token_registry.aleo::roles.get_or_use(sealed_role_key, 0u8),
                SUPPLY_MANAGER_ROLE
            );

            let vest_duration_ok: bool =
                !config.vest_enabled || config.vest_end_blocks > config.vest_cliff_blocks;
            assert(vest_duration_ok);

            let vest_role_key: field = BHP256::hash_to_field(TokenOwner {
                account:  fairdrop_vest_v2.aleo,
                token_id: config.sale_token_id,
            });
            let vest_role_ok: bool =
                !config.vest_enabled ||
                token_registry.aleo::roles.get_or_use(vest_role_key, 0u8) == SUPPLY_MANAGER_ROLE;
            assert(vest_role_ok);

            auction_configs.set(auction_id, config);
            auction_states.set(auction_id, AuctionState {
                total_committed: 0u128,
                total_payments:  0u128,
                supply_met:      false,
                ended_at_block:  0u32,
                cleared:         false,
                clearing_price:  0u128,
                creator_revenue: 0u128,
                protocol_fee:    0u128,
                voided:          false,
                referral_budget: 0u128,
            });
            escrow_sales.set(auction_id, config.supply);

            let s: Stats = stats.get_or_use(0field, Stats {
                total_auctions: 0u64, total_bids: 0u64, total_payment_collected: 0u128
            });
            auction_index.set(s.total_auctions, auction_id);

            let count: u64 = creator_auction_count.get_or_use(signer, 0u64);
            creator_auction_count.set(signer, count + 1u64);
            let prev: field = creator_latest_auction.get_or_use(signer, 0field);
            auction_prev_by_creator.set(auction_id, prev);
            creator_latest_auction.set(signer, auction_id);

            creator_nonces.set(signer, nonce + 1u64);

            let treasury: u128 = protocol_treasury.get_or_use(0field, 0u128);
            protocol_treasury.set(0field, treasury + creation_fee);

            stats.set(0field, Stats {
                total_auctions:          s.total_auctions + 1u64,
                total_bids:              s.total_bids,
                total_payment_collected: s.total_payment_collected,
            });
        });
    }

    // =========================================================================
    // 2. commit_bid_private — private credits UTXO
    // =========================================================================
    //
    // Locks payment as collateral and stores the commitment hash on-chain.
    // quantity and nonce are private (hidden from finalize and from other parties).
    //
    // Collateral rule (C4): payment_amount * sale_scale >= min_bid_amount * floor_price
    //   Enforced in finalize. Ensures escrow covers minimum meaningful bid at floor.
    //
    // One commit per bidder per auction (bid_committed mapping).
    // Gate checked at commit time (not reveal time) to enforce access at entry.
    // ParticipationReceipt issued at commit (proves participation in the auction).

    fn commit_bid_private(
        payment:               credits.aleo::credits,
        public auction_id:     field,
        private quantity:      u128,
        private nonce:         field,
        public payment_amount: u64,
    ) -> (credits.aleo::credits, Commitment, fairdrop_proof_v2.aleo::ParticipationReceipt, Final) {
        assert(quantity > 0u128);
        assert(payment_amount > 0u64);

        let signer: address = self.signer;

        // Pseudonymous key — bidder identity hidden.
        let bidder_key: field = BHP256::hash_to_field(BidderKey {
            bidder:     signer,
            auction_id: auction_id,
        });

        // Commitment hides quantity until reveal.
        let commitment_hash: field = BHP256::hash_to_field(CommitRevealKey {
            quantity: quantity,
            nonce:    nonce,
            bidder:   signer,
        });

        let (change, f_credits): (credits.aleo::credits, Final) =
            credits.aleo::transfer_private_to_public(payment, self.address, payment_amount);

        let f_gate: Final = fairdrop_gate_v2.aleo::check_admission(auction_id);

        let (receipt, f_proof): (fairdrop_proof_v2.aleo::ParticipationReceipt, Final) =
            fairdrop_proof_v2.aleo::issue_receipt(auction_id, 0field, bidder_key);

        let commitment: Commitment = Commitment {
            owner:          signer,
            auction_id:     auction_id,
            commitment:     commitment_hash,
            payment_amount: payment_amount as u128,
            quantity:       quantity,
            nonce:          nonce,
        };

        let payment_amount_u128: u128 = payment_amount as u128;

        return (change, commitment, receipt, final {
            f_credits.run();
            f_gate.run();
            f_proof.run();

            assert(!fairdrop_config_v2.aleo::paused.get_or_use(0field, false) && !paused.get_or_use(0field, false));
            // ── shared commit validation ──────────────────────────────────────────
            let config: AuctionConfig = auction_configs.get(auction_id);
            let state:  AuctionState  = auction_states.get(auction_id);
            assert(!state.cleared);
            assert(!state.voided);
            assert(block.height >= config.start_block);
            assert(block.height <  config.commit_end_block);
            // One commit per bidder.
            assert(!bid_committed.get_or_use(bidder_key, false));
            bid_committed.set(bidder_key, true);
            // Minimum collateral: covers at least min_bid_amount at floor_price.
            assert(payment_amount_u128 * config.sale_scale >= config.min_bid_amount * config.floor_price);
            // Store commitment for verification at reveal.
            pending_commits.set(bidder_key, CommitState {
                auction_id:      auction_id,
                commitment_hash: commitment_hash,
                payment_amount:  payment_amount_u128,
                revealed:        false,
                slashed:         false,
            });
            let escrow: u128 = escrow_payments.get_or_use(auction_id, 0u128);
            escrow_payments.set(auction_id, escrow + payment_amount_u128);
            let s: Stats = stats.get_or_use(0field, Stats {
                total_auctions: 0u64, total_bids: 0u64, total_payment_collected: 0u128
            });
            stats.set(0field, Stats {
                total_auctions:          s.total_auctions,
                total_bids:              s.total_bids + 1u64,
                total_payment_collected: s.total_payment_collected + payment_amount_u128,
            });
            // ─────────────────────────────────────────────────────────────────────
        });
    }

    // =========================================================================
    // 3. commit_bid_public — public credits balance
    // =========================================================================

    fn commit_bid_public(
        public auction_id:     field,
        private quantity:      u128,
        private nonce:         field,
        public payment_amount: u64,
    ) -> (Commitment, fairdrop_proof_v2.aleo::ParticipationReceipt, Final) {
        assert(quantity > 0u128);
        assert(payment_amount > 0u64);

        let signer: address = self.signer;

        let bidder_key: field = BHP256::hash_to_field(BidderKey {
            bidder:     signer,
            auction_id: auction_id,
        });

        let commitment_hash: field = BHP256::hash_to_field(CommitRevealKey {
            quantity: quantity,
            nonce:    nonce,
            bidder:   signer,
        });

        let f_credits: Final =
            credits.aleo::transfer_public_as_signer(self.address, payment_amount);

        let f_gate: Final = fairdrop_gate_v2.aleo::check_admission(auction_id);

        let (receipt, f_proof): (fairdrop_proof_v2.aleo::ParticipationReceipt, Final) =
            fairdrop_proof_v2.aleo::issue_receipt(auction_id, 0field, bidder_key);

        let commitment: Commitment = Commitment {
            owner:          signer,
            auction_id:     auction_id,
            commitment:     commitment_hash,
            payment_amount: payment_amount as u128,
            quantity:       quantity,
            nonce:          nonce,
        };

        let payment_amount_u128: u128 = payment_amount as u128;

        return (commitment, receipt, final {
            f_credits.run();
            f_gate.run();
            f_proof.run();

            assert(!fairdrop_config_v2.aleo::paused.get_or_use(0field, false) && !paused.get_or_use(0field, false));
            // ── shared commit validation ──────────────────────────────────────────
            let config: AuctionConfig = auction_configs.get(auction_id);
            let state:  AuctionState  = auction_states.get(auction_id);
            assert(!state.cleared);
            assert(!state.voided);
            assert(block.height >= config.start_block);
            assert(block.height <  config.commit_end_block);
            assert(!bid_committed.get_or_use(bidder_key, false));
            bid_committed.set(bidder_key, true);
            assert(payment_amount_u128 * config.sale_scale >= config.min_bid_amount * config.floor_price);
            pending_commits.set(bidder_key, CommitState {
                auction_id:      auction_id,
                commitment_hash: commitment_hash,
                payment_amount:  payment_amount_u128,
                revealed:        false,
                slashed:         false,
            });
            let escrow: u128 = escrow_payments.get_or_use(auction_id, 0u128);
            escrow_payments.set(auction_id, escrow + payment_amount_u128);
            let s: Stats = stats.get_or_use(0field, Stats {
                total_auctions: 0u64, total_bids: 0u64, total_payment_collected: 0u128
            });
            stats.set(0field, Stats {
                total_auctions:          s.total_auctions,
                total_bids:              s.total_bids + 1u64,
                total_payment_collected: s.total_payment_collected + payment_amount_u128,
            });
            // ─────────────────────────────────────────────────────────────────────
        });
    }

    // =========================================================================
    // 4. commit_bid_private_ref — private credits + referral attribution
    // =========================================================================

    fn commit_bid_private_ref(
        payment:               credits.aleo::credits,
        public auction_id:     field,
        private quantity:      u128,
        private nonce:         field,
        public payment_amount: u64,
        public code_id:        field,
    ) -> (credits.aleo::credits, Commitment, fairdrop_proof_v2.aleo::ParticipationReceipt, Final) {
        assert(quantity > 0u128);
        assert(payment_amount > 0u64);

        let signer: address = self.signer;

        let bidder_key: field = BHP256::hash_to_field(BidderKey {
            bidder:     signer,
            auction_id: auction_id,
        });

        let commitment_hash: field = BHP256::hash_to_field(CommitRevealKey {
            quantity: quantity,
            nonce:    nonce,
            bidder:   signer,
        });

        let (change, f_credits): (credits.aleo::credits, Final) =
            credits.aleo::transfer_private_to_public(payment, self.address, payment_amount);

        let f_gate: Final = fairdrop_gate_v2.aleo::check_admission(auction_id);

        let (receipt, f_proof): (fairdrop_proof_v2.aleo::ParticipationReceipt, Final) =
            fairdrop_proof_v2.aleo::issue_receipt(auction_id, 0field, bidder_key);

        let f_ref: Final = fairdrop_ref_v2.aleo::record_referral(
            code_id,
            auction_id,
            bidder_key,
            payment_amount as u128,
        );

        let commitment: Commitment = Commitment {
            owner:          signer,
            auction_id:     auction_id,
            commitment:     commitment_hash,
            payment_amount: payment_amount as u128,
            quantity:       quantity,
            nonce:          nonce,
        };

        let payment_amount_u128: u128 = payment_amount as u128;

        return (change, commitment, receipt, final {
            f_credits.run();
            f_gate.run();
            f_proof.run();
            f_ref.run();

            assert(!fairdrop_config_v2.aleo::paused.get_or_use(0field, false) && !paused.get_or_use(0field, false));
            // ── shared commit validation ──────────────────────────────────────────
            let config: AuctionConfig = auction_configs.get(auction_id);
            let state:  AuctionState  = auction_states.get(auction_id);
            assert(!state.cleared);
            assert(!state.voided);
            assert(block.height >= config.start_block);
            assert(block.height <  config.commit_end_block);
            assert(!bid_committed.get_or_use(bidder_key, false));
            bid_committed.set(bidder_key, true);
            assert(payment_amount_u128 * config.sale_scale >= config.min_bid_amount * config.floor_price);
            pending_commits.set(bidder_key, CommitState {
                auction_id:      auction_id,
                commitment_hash: commitment_hash,
                payment_amount:  payment_amount_u128,
                revealed:        false,
                slashed:         false,
            });
            let escrow: u128 = escrow_payments.get_or_use(auction_id, 0u128);
            escrow_payments.set(auction_id, escrow + payment_amount_u128);
            let s: Stats = stats.get_or_use(0field, Stats {
                total_auctions: 0u64, total_bids: 0u64, total_payment_collected: 0u128
            });
            stats.set(0field, Stats {
                total_auctions:          s.total_auctions,
                total_bids:              s.total_bids + 1u64,
                total_payment_collected: s.total_payment_collected + payment_amount_u128,
            });
            // ─────────────────────────────────────────────────────────────────────
        });
    }

    // =========================================================================
    // 5. commit_bid_public_ref — public credits + referral attribution
    // =========================================================================

    fn commit_bid_public_ref(
        public auction_id:     field,
        private quantity:      u128,
        private nonce:         field,
        public payment_amount: u64,
        public code_id:        field,
    ) -> (Commitment, fairdrop_proof_v2.aleo::ParticipationReceipt, Final) {
        assert(quantity > 0u128);
        assert(payment_amount > 0u64);

        let signer: address = self.signer;

        let bidder_key: field = BHP256::hash_to_field(BidderKey {
            bidder:     signer,
            auction_id: auction_id,
        });

        let commitment_hash: field = BHP256::hash_to_field(CommitRevealKey {
            quantity: quantity,
            nonce:    nonce,
            bidder:   signer,
        });

        let f_credits: Final =
            credits.aleo::transfer_public_as_signer(self.address, payment_amount);

        let f_gate: Final = fairdrop_gate_v2.aleo::check_admission(auction_id);

        let (receipt, f_proof): (fairdrop_proof_v2.aleo::ParticipationReceipt, Final) =
            fairdrop_proof_v2.aleo::issue_receipt(auction_id, 0field, bidder_key);

        let f_ref: Final = fairdrop_ref_v2.aleo::record_referral(
            code_id,
            auction_id,
            bidder_key,
            payment_amount as u128,
        );

        let commitment: Commitment = Commitment {
            owner:          signer,
            auction_id:     auction_id,
            commitment:     commitment_hash,
            payment_amount: payment_amount as u128,
            quantity:       quantity,
            nonce:          nonce,
        };

        let payment_amount_u128: u128 = payment_amount as u128;

        return (commitment, receipt, final {
            f_credits.run();
            f_gate.run();
            f_proof.run();
            f_ref.run();

            assert(!fairdrop_config_v2.aleo::paused.get_or_use(0field, false) && !paused.get_or_use(0field, false));
            // ── shared commit validation ──────────────────────────────────────────
            let config: AuctionConfig = auction_configs.get(auction_id);
            let state:  AuctionState  = auction_states.get(auction_id);
            assert(!state.cleared);
            assert(!state.voided);
            assert(block.height >= config.start_block);
            assert(block.height <  config.commit_end_block);
            assert(!bid_committed.get_or_use(bidder_key, false));
            bid_committed.set(bidder_key, true);
            assert(payment_amount_u128 * config.sale_scale >= config.min_bid_amount * config.floor_price);
            pending_commits.set(bidder_key, CommitState {
                auction_id:      auction_id,
                commitment_hash: commitment_hash,
                payment_amount:  payment_amount_u128,
                revealed:        false,
                slashed:         false,
            });
            let escrow: u128 = escrow_payments.get_or_use(auction_id, 0u128);
            escrow_payments.set(auction_id, escrow + payment_amount_u128);
            let s: Stats = stats.get_or_use(0field, Stats {
                total_auctions: 0u64, total_bids: 0u64, total_payment_collected: 0u128
            });
            stats.set(0field, Stats {
                total_auctions:          s.total_auctions,
                total_bids:              s.total_bids + 1u64,
                total_payment_collected: s.total_payment_collected + payment_amount_u128,
            });
            // ─────────────────────────────────────────────────────────────────────
        });
    }

    // =========================================================================
    // 6. reveal_bid — consume Commitment record and register quantity on-chain
    // =========================================================================
    //
    // Bidder proves knowledge of (quantity, nonce) that hashes to their commitment.
    // Called during the reveal window [commit_end_block → end_block].
    //
    // max_bid_amount cap applied here (D11 param, checked in finalize).
    // Clearing price pre-computed from config to verify collateral sufficiency.
    //
    // Issues a Bid record (for uniform clearing claim) and consumes the Commitment.
    //
    // Collateral check: payment_amount * sale_scale >= effective_quantity * clearing_price
    //   where clearing_price = Dutch price at commit_end_block.
    //   Bids that undercollateralized for their revealed quantity are rejected —
    //   those bidders should not reveal and instead accept slashing.

    fn reveal_bid(
        commitment:            Commitment,
        private quantity:      u128,
        private nonce:         field,
        public max_bid_amount: u128,    // D11: config.max_bid_amount
    ) -> (Bid, Final) {
        // Re-derive commitment from private inputs and verify against record.
        let expected: field = BHP256::hash_to_field(CommitRevealKey {
            quantity: quantity,
            nonce:    nonce,
            bidder:   self.signer,
        });
        assert_eq(expected, commitment.commitment);

        // Apply max_bid_amount cap in transition body so Bid record has correct quantity.
        let capped: u128 = (max_bid_amount == 0u128 || quantity <= max_bid_amount)
            ? quantity : max_bid_amount;

        let bidder_key: field = BHP256::hash_to_field(BidderKey {
            bidder:     self.signer,
            auction_id: commitment.auction_id,
        });

        // Capture record fields before final {}.
        let c_auction_id:     field = commitment.auction_id;
        let c_payment_amount: u128  = commitment.payment_amount;

        let bid: Bid = Bid {
            owner:          self.signer,
            auction_id:     c_auction_id,
            quantity:       capped,
            payment_amount: c_payment_amount,
        };

        return (bid, final {
            assert(!fairdrop_config_v2.aleo::paused.get_or_use(0field, false) && !paused.get_or_use(0field, false));

            let config: AuctionConfig = auction_configs.get(c_auction_id);
            let state:  AuctionState  = auction_states.get(c_auction_id);

            assert(!state.cleared);
            assert(!state.voided);
            // Reveal window: commit_end_block ≤ block.height < end_block.
            assert(block.height >= config.commit_end_block);
            assert(block.height <  config.end_block);

            // D11: max_bid_amount must match config.
            assert_eq(max_bid_amount, config.max_bid_amount);

            // Verify capped_quantity ≤ max_bid_amount (or no cap).
            let cap_ok: bool = config.max_bid_amount == 0u128
                || capped <= config.max_bid_amount;
            assert(cap_ok);

            // Load commitment; must exist, not revealed, not slashed.
            let commit: CommitState = pending_commits.get(bidder_key);
            assert_eq(commit.auction_id, c_auction_id);
            assert(!commit.revealed);
            assert(!commit.slashed);

            // Recompute the deterministic clearing price (Dutch at commit_end_block).
            let blocks_elapsed: u32  = config.commit_end_block - config.start_block;
            let decay_steps: u128    = (blocks_elapsed / config.price_decay_blocks) as u128;
            let total_decay: u128    = decay_steps * config.price_decay_amount;
            let price_range: u128    = config.start_price - config.floor_price;
            let clearing_price: u128 = total_decay < price_range
                ? config.start_price - total_decay : config.floor_price;

            // Collateral check: payment must cover effective bid at clearing price.
            assert(c_payment_amount * config.sale_scale >= capped * clearing_price);

            // Enforce min_bid_amount.
            assert(capped >= config.min_bid_amount);

            // Supply cap: refuse bids that would overflow supply.
            let new_committed: u128 = state.total_committed + capped;
            assert(new_committed <= config.supply);

            // Mark commitment as revealed.
            pending_commits.set(bidder_key, CommitState {
                auction_id:      commit.auction_id,
                commitment_hash: commit.commitment_hash,
                payment_amount:  commit.payment_amount,
                revealed:        true,
                slashed:         false,
            });

            // Update auction state.
            let is_supply_met: bool = new_committed >= config.supply;
            auction_states.set(c_auction_id, AuctionState {
                total_committed: new_committed,
                total_payments:  state.total_payments + c_payment_amount,
                supply_met:      is_supply_met,
                ended_at_block:  is_supply_met ? block.height : state.ended_at_block,
                cleared:         false,
                clearing_price:  0u128,
                creator_revenue: 0u128,
                protocol_fee:    0u128,
                voided:          false,
                referral_budget: 0u128,
            });
        });
    }

    // =========================================================================
    // 7. slash_unrevealed — permissionless slash of expired unrevealed commitments
    // =========================================================================
    //
    // Anyone may call after end_block for commitments where revealed == false.
    // Slash reward = payment_amount * slash_reward_bps / 10000 → caller.
    // Remaining payment debited from escrow_payments → stays in treasury accounting.
    //
    // D11 params: commitment_key (BHP256(BidderKey)), auction_id, payment_amount,
    //             slash_reward_bps validated against pending_commits and config.
    //
    // Security: commitment_key is pseudonymous — the slasher only learns that
    // some bidder on auction_id did not reveal. Bidder identity remains hidden.

    fn slash_unrevealed(
        public commitment_key:  field,   // BHP256(BidderKey { bidder, auction_id })
        public auction_id:      field,
        public payment_amount:  u128,    // D11: pending_commits[commitment_key].payment_amount
        public slash_reward_bps: u16,    // D11: from fairdrop_config
    ) -> Final {
        let slash_reward: u128 = payment_amount * (slash_reward_bps as u128) / 10000u128;
        let signer: address = self.signer;
        // Pay caller their slash reward immediately.
        let f_slash: Final = credits.aleo::transfer_public(signer, slash_reward as u64);

        return final {
            f_slash.run();

            assert(!fairdrop_config_v2.aleo::paused.get_or_use(0field, false) && !paused.get_or_use(0field, false));

            let config: AuctionConfig = auction_configs.get(auction_id);
            let state:  AuctionState  = auction_states.get(auction_id);

            assert(!state.voided);
            // Slash window: reveal window must have closed.
            assert(block.height >= config.end_block);

            // Load and verify commitment state.
            let commit: CommitState = pending_commits.get(commitment_key);
            assert_eq(commit.auction_id,     auction_id);
            assert_eq(commit.payment_amount, payment_amount);
            assert(!commit.revealed);
            assert(!commit.slashed);

            // D11: slash_reward_bps must match the snapshotted config value.
            assert_eq(slash_reward_bps, config.slash_reward_bps);

            // Verify slash_reward computation matches what was transferred.
            let expected_reward: u128 = payment_amount * (slash_reward_bps as u128) / 10000u128;
            assert_eq(slash_reward, expected_reward);

            // Mark as slashed — prevents claim_commit_voided.
            pending_commits.set(commitment_key, CommitState {
                auction_id:      commit.auction_id,
                commitment_hash: commit.commitment_hash,
                payment_amount:  commit.payment_amount,
                revealed:        false,
                slashed:         true,
            });

            // Remove slashed payment from escrow_payments.
            let escrow: u128 = escrow_payments.get_or_use(auction_id, 0u128);
            assert(payment_amount <= escrow);
            escrow_payments.set(auction_id, escrow - payment_amount);

            // Credit protocol treasury with net slashed amount (payment - slash_reward).
            let treasury_gain: u128 = payment_amount - slash_reward;
            let treasury: u128      = protocol_treasury.get_or_use(0field, 0u128);
            protocol_treasury.set(0field, treasury + treasury_gain);
        };
    }

    // =========================================================================
    // 8. close_auction — permissionless; call after end_block
    // =========================================================================
    //
    // Clearing price = Dutch price at commit_end_block (same formula as place_bid).
    // Uniform clearing applies: all revealed bidders pay this price.
    // Refunds issued at claim (payment_amount - cost).
    //
    // Precondition: block.height >= config.end_block (slash window has elapsed).

    fn close_auction(
        public auction_id:    field,
        public creator:       address,
        public filled:        bool,
        public volume:        u128,
        public closer_reward: u128,
    ) -> Final {
        let signer: address = self.signer;
        let f_closer: Final =
            credits.aleo::transfer_public(signer, closer_reward as u64);

        let f_proof: Final =
            fairdrop_proof_v2.aleo::update_reputation(creator, filled, volume);

        return final {
            f_closer.run();
            f_proof.run();

            assert(!fairdrop_config_v2.aleo::paused.get_or_use(0field, false) && !paused.get_or_use(0field, false));

            let config: AuctionConfig = auction_configs.get(auction_id);
            let state:  AuctionState  = auction_states.get(auction_id);

            assert(!state.cleared);
            assert(!state.voided);
            // Close only after full reveal+slash window has passed.
            assert(block.height >= config.end_block);

            assert_eq(creator,       config.creator);
            assert_eq(filled,        state.supply_met);
            assert_eq(volume,        state.total_payments);
            assert_eq(closer_reward, config.closer_reward);

            let treasury: u128 = protocol_treasury.get_or_use(0field, 0u128);
            assert(treasury >= closer_reward);

            // Clearing price = Dutch price at commit_end_block (deterministic).
            let ended_block: u32     = state.supply_met ? state.ended_at_block : config.end_block;
            let blocks_elapsed: u32  = config.commit_end_block - config.start_block;
            let decay_steps: u128    = (blocks_elapsed / config.price_decay_blocks) as u128;
            let total_decay: u128    = decay_steps * config.price_decay_amount;
            let price_range: u128    = config.start_price - config.floor_price;
            let clearing_price: u128 = total_decay < price_range
                ? config.start_price - total_decay : config.floor_price;

            // Revenue accounting (same model as Dutch).
            let total_cost: u128      = state.total_committed * clearing_price / config.sale_scale;
            let protocol_fee: u128    = total_cost * (config.fee_bps as u128) / 10000u128;
            let creator_revenue: u128 = total_cost - protocol_fee;
            let referral_budget: u128 = protocol_fee * (config.referral_pool_bps as u128) / 10000u128;

            let net_fee: u128      = protocol_fee - referral_budget;
            let new_treasury: u128 = treasury + net_fee - closer_reward;
            protocol_treasury.set(0field, new_treasury);

            auction_states.set(auction_id, AuctionState {
                total_committed: state.total_committed,
                total_payments:  state.total_payments,
                supply_met:      state.supply_met,
                ended_at_block:  ended_block,
                cleared:         true,
                clearing_price:  clearing_price,
                creator_revenue: creator_revenue,
                protocol_fee:    protocol_fee,
                voided:          false,
                referral_budget: referral_budget,
            });
        };
    }

    // =========================================================================
    // 9. push_referral_budget — permissionless; call after close_auction
    // =========================================================================
    //
    // Accounting note — escrow_payments is NOT decremented here (by design):
    //   escrow_payments guards creator withdrawals (withdraw_payments / seed_liquidity)
    //   and bidder refunds (claim / claim_voided). Both are bounded by creator_revenue
    //   and bid amounts respectively, and those already exclude protocol_fee entirely.
    //   ref_budget = protocol_fee * referral_pool_bps / 10000 — carved from protocol_fee.
    //   creator_revenue = total_payments - protocol_fee, so the creator_revenue ceiling
    //   in withdraw_payments and seed_liquidity already prevents the creator from touching
    //   any part of protocol_fee, including ref_budget. Decrementing escrow_payments here
    //   would be incorrect — it would make the ceiling appear tighter than it really is.

    fn push_referral_budget(
        public auction_id: field,
        public budget:     u128,
    ) -> Final {
        let f_credits: Final =
            credits.aleo::transfer_public(fairdrop_ref_v2.aleo, budget as u64);
        let f_ref: Final = fairdrop_ref_v2.aleo::fund_reserve(auction_id, budget);

        return final {
            f_credits.run();
            f_ref.run();

            let state: AuctionState = auction_states.get(auction_id);
            assert(state.cleared);
            assert(!state.voided);
            assert(budget > 0u128);
            assert_eq(budget, state.referral_budget);

            auction_states.set(auction_id, AuctionState {
                total_committed: state.total_committed,
                total_payments:  state.total_payments,
                supply_met:      state.supply_met,
                ended_at_block:  state.ended_at_block,
                cleared:         state.cleared,
                clearing_price:  state.clearing_price,
                creator_revenue: state.creator_revenue,
                protocol_fee:    state.protocol_fee,
                voided:          state.voided,
                referral_budget: 0u128,
            });
        };
    }

    // =========================================================================
    // 10. claim — redeem Bid record (non-vesting sealed auctions)
    // =========================================================================
    //
    // Uniform clearing price applies. Overpayment refunded privately.
    // bid.owner is private — both token recipient and refund recipient hidden.

    fn claim(
        bid:                   Bid,
        public clearing_price: u128,
        public sale_token_id:  field,
        public sale_scale:     u128,
    ) -> (token_registry.aleo::Token, credits.aleo::credits, Final) {
        // Capture record fields before final {}.
        let bid_owner:          address = bid.owner;
        let bid_auction_id:     field   = bid.auction_id;
        let bid_quantity:       u128    = bid.quantity;
        let bid_payment_amount: u128    = bid.payment_amount;

        let sale_amount: u128  = bid_quantity;
        let cost: u128         = bid_quantity * clearing_price / sale_scale;
        let refund_amount: u64 = (bid_payment_amount - cost) as u64;

        let (sale_token, f_mint): (token_registry.aleo::Token, Final) =
            token_registry.aleo::mint_private(
                sale_token_id,
                bid_owner,
                sale_amount,
                false,
                4294967295u32,
            );

        let (refund, f_refund): (credits.aleo::credits, Final) =
            credits.aleo::transfer_public_to_private(bid_owner, refund_amount);

        let refund_amount_u128: u128 = refund_amount as u128;

        return (sale_token, refund, final {
            f_mint.run();
            f_refund.run();

            assert(!fairdrop_config_v2.aleo::paused.get_or_use(0field, false) && !paused.get_or_use(0field, false));

            let config: AuctionConfig = auction_configs.get(bid_auction_id);
            let state:  AuctionState  = auction_states.get(bid_auction_id);

            assert(state.cleared);
            assert(!state.voided);
            assert(!config.vest_enabled);
            assert_eq(clearing_price, state.clearing_price);
            assert_eq(sale_token_id,  config.sale_token_id);
            assert_eq(sale_scale,     config.sale_scale);

            let sale_remaining: u128 = escrow_sales.get(bid_auction_id);
            assert(sale_amount <= sale_remaining);
            escrow_sales.set(bid_auction_id, sale_remaining - sale_amount);

            let payment_remaining: u128 = escrow_payments.get(bid_auction_id);
            assert(refund_amount_u128 <= payment_remaining);
            escrow_payments.set(bid_auction_id, payment_remaining - refund_amount_u128);
        });
    }

    // =========================================================================
    // 11. claim_vested — redeem Bid record (vest_enabled sealed auctions)
    // =========================================================================

    fn claim_vested(
        bid:                    Bid,
        public clearing_price:  u128,
        public sale_token_id:   field,
        public sale_scale:      u128,
        public ended_at_block:  u32,
        public cliff_blocks:    u32,
        public vest_end_blocks: u32,
    ) -> (fairdrop_vest_v2.aleo::VestedAllocation, credits.aleo::credits, Final) {
        // Capture record fields before final {}.
        let bid_owner:          address = bid.owner;
        let bid_auction_id:     field   = bid.auction_id;
        let bid_quantity:       u128    = bid.quantity;
        let bid_payment_amount: u128    = bid.payment_amount;

        let sale_amount: u128  = bid_quantity;
        let cost: u128         = bid_quantity * clearing_price / sale_scale;
        let refund_amount: u64 = (bid_payment_amount - cost) as u64;

        let (vest, f_vest): (fairdrop_vest_v2.aleo::VestedAllocation, Final) =
            fairdrop_vest_v2.aleo::create_vest(
                bid_auction_id,
                bid_owner,
                sale_token_id,
                sale_amount,
                ended_at_block,
                cliff_blocks,
                vest_end_blocks,
            );

        let (refund, f_refund): (credits.aleo::credits, Final) =
            credits.aleo::transfer_public_to_private(bid_owner, refund_amount);

        let refund_amount_u128: u128 = refund_amount as u128;

        return (vest, refund, final {
            f_vest.run();
            f_refund.run();

            assert(!fairdrop_config_v2.aleo::paused.get_or_use(0field, false) && !paused.get_or_use(0field, false));

            let config: AuctionConfig = auction_configs.get(bid_auction_id);
            let state:  AuctionState  = auction_states.get(bid_auction_id);

            assert(state.cleared);
            assert(!state.voided);
            assert(config.vest_enabled);
            assert_eq(clearing_price, state.clearing_price);
            assert_eq(sale_token_id,  config.sale_token_id);
            assert_eq(sale_scale,     config.sale_scale);
            assert_eq(ended_at_block,  state.ended_at_block);
            assert_eq(cliff_blocks,    config.vest_cliff_blocks);
            assert_eq(vest_end_blocks, config.vest_end_blocks);

            let sale_remaining: u128 = escrow_sales.get(bid_auction_id);
            assert(sale_amount <= sale_remaining);
            escrow_sales.set(bid_auction_id, sale_remaining - sale_amount);

            let payment_remaining: u128 = escrow_payments.get(bid_auction_id);
            assert(refund_amount_u128 <= payment_remaining);
            escrow_payments.set(bid_auction_id, payment_remaining - refund_amount_u128);
        });
    }

    // =========================================================================
    // 12. withdraw_payments — creator withdraws clearing-price revenue
    // =========================================================================

    fn withdraw_payments(
        public auction_id: field,
        public amount:     u128,
        public recipient:  address,
    ) -> Final {
        assert(amount > 0u128);
        let caller: address = self.signer;
        let f0: Final = credits.aleo::transfer_public(recipient, amount as u64);

        return final {
            f0.run();

            assert(!fairdrop_config_v2.aleo::paused.get_or_use(0field, false) && !paused.get_or_use(0field, false));

            let config: AuctionConfig = auction_configs.get(auction_id);
            let state:  AuctionState  = auction_states.get(auction_id);

            assert(state.cleared);
            assert(!state.voided);
            assert_eq(caller, config.creator);

            let withdrawn: u128     = creator_withdrawn.get_or_use(auction_id, 0u128);
            let new_withdrawn: u128 = withdrawn + amount;
            assert(new_withdrawn <= state.creator_revenue);
            creator_withdrawn.set(auction_id, new_withdrawn);

            let escrow: u128 = escrow_payments.get(auction_id);
            assert(amount <= escrow);
            escrow_payments.set(auction_id, escrow - amount);
        };
    }

    // =========================================================================
    // 13. withdraw_unsold — creator mints back unsold supply after close
    // =========================================================================

    fn withdraw_unsold(
        public auction_id:    field,
        public amount:        u128,
        public sale_token_id: field,
        public recipient:     address,
    ) -> (token_registry.aleo::Token, Final) {
        assert(amount > 0u128);
        let caller: address = self.signer;

        let (token, f_mint): (token_registry.aleo::Token, Final) =
            token_registry.aleo::mint_private(
                sale_token_id,
                recipient,
                amount,
                false,
                4294967295u32,
            );

        return (token, final {
            f_mint.run();

            assert(!fairdrop_config_v2.aleo::paused.get_or_use(0field, false) && !paused.get_or_use(0field, false));

            let config: AuctionConfig = auction_configs.get(auction_id);
            let state:  AuctionState  = auction_states.get(auction_id);

            assert(state.cleared);
            assert(!state.voided);
            assert_eq(caller,        config.creator);
            assert_eq(sale_token_id, config.sale_token_id);

            let unsold: u128        = config.supply - state.total_committed;
            let withdrawn: u128     = unsold_withdrawn.get_or_use(auction_id, 0u128);
            let new_withdrawn: u128 = withdrawn + amount;
            assert(new_withdrawn <= unsold);
            unsold_withdrawn.set(auction_id, new_withdrawn);

            let escrow: u128 = escrow_sales.get(auction_id);
            assert(amount <= escrow);
            escrow_sales.set(auction_id, escrow - amount);
        });
    }

    // =========================================================================
    // 14. cancel_auction — creator escape hatch
    // =========================================================================
    //
    // Creator cancels any non-cleared, non-voided auction at any time.
    // Full supply minted back to creator. Bidder credits remain in escrow;
    // revealed bidders use claim_voided; unrevealed bidders use claim_commit_voided.

    fn cancel_auction(
        public auction_id:    field,
        public sale_token_id: field,
        public supply:        u128,
    ) -> (token_registry.aleo::Token, Final) {
        let creator: address = self.signer;
        let (token, f_mint): (token_registry.aleo::Token, Final) =
            token_registry.aleo::mint_private(
                sale_token_id,
                creator,
                supply,
                false,
                4294967295u32,
            );

        return (token, final {
            f_mint.run();

            assert(!fairdrop_config_v2.aleo::paused.get_or_use(0field, false) && !paused.get_or_use(0field, false));

            let config: AuctionConfig = auction_configs.get(auction_id);
            let state:  AuctionState  = auction_states.get(auction_id);

            assert_eq(creator,       config.creator);
            assert(!state.cleared);
            assert(!state.voided);
            assert_eq(sale_token_id, config.sale_token_id);
            assert_eq(supply,        config.supply);

            let remaining: u128 = escrow_sales.get(auction_id);
            assert(supply <= remaining);
            escrow_sales.set(auction_id, remaining - supply);

            auction_states.set(auction_id, AuctionState {
                total_committed: state.total_committed,
                total_payments:  state.total_payments,
                supply_met:      state.supply_met,
                ended_at_block:  state.ended_at_block,
                cleared:         false,
                clearing_price:  0u128,
                creator_revenue: 0u128,
                protocol_fee:    0u128,
                voided:          true,
                referral_budget: 0u128,
            });
        });
    }

    // =========================================================================
    // 15. claim_voided — bidder (revealed Bid record) recovers from voided auction
    // =========================================================================
    //
    // No paused check — bidder capital must always be recoverable.

    fn claim_voided(
        bid: Bid,
    ) -> (credits.aleo::credits, Final) {
        // Capture record fields before final {}.
        let bid_owner:          address = bid.owner;
        let bid_auction_id:     field   = bid.auction_id;
        let bid_payment_amount: u128    = bid.payment_amount;

        let (refund, f_refund): (credits.aleo::credits, Final) =
            credits.aleo::transfer_public_to_private(bid_owner, bid_payment_amount as u64);

        return (refund, final {
            f_refund.run();

            let state: AuctionState = auction_states.get(bid_auction_id);
            assert(state.voided);

            let remaining: u128 = escrow_payments.get_or_use(bid_auction_id, 0u128);
            assert(bid_payment_amount <= remaining);
            escrow_payments.set(bid_auction_id, remaining - bid_payment_amount);
        });
    }

    // =========================================================================
    // 16. claim_commit_voided — unrevealed committer recovers from voided auction
    // =========================================================================
    //
    // For bidders holding a Commitment record (commit phase, not yet revealed)
    // when the auction is cancelled. Refunds full payment_amount.
    //
    // Requires !slashed: slashed commitments have already had their payment removed
    // from escrow_payments and cannot be double-refunded.
    //
    // No paused check — recovery path must always work.

    fn claim_commit_voided(
        commitment: Commitment,
    ) -> (credits.aleo::credits, Final) {
        // Capture record fields before final {}.
        let c_owner:          address = commitment.owner;
        let c_auction_id:     field   = commitment.auction_id;
        let c_payment_amount: u128    = commitment.payment_amount;

        let (refund, f_refund): (credits.aleo::credits, Final) =
            credits.aleo::transfer_public_to_private(
                c_owner,
                c_payment_amount as u64,
            );

        // Compute pseudonymous key to verify non-slashed status in finalize.
        let bidder_key: field = BHP256::hash_to_field(BidderKey {
            bidder:     self.signer,
            auction_id: c_auction_id,
        });

        return (refund, final {
            f_refund.run();

            let state: AuctionState = auction_states.get(c_auction_id);
            assert(state.voided);

            // Reject if slashed — payment already removed from escrow.
            let commit: CommitState = pending_commits.get(bidder_key);
            assert_eq(commit.auction_id, c_auction_id);
            assert(!commit.revealed);
            assert(!commit.slashed);
            assert_eq(commit.payment_amount, c_payment_amount);

            let remaining: u128 = escrow_payments.get_or_use(c_auction_id, 0u128);
            assert(c_payment_amount <= remaining);
            escrow_payments.set(c_auction_id, remaining - c_payment_amount);

            // Mark commitment as voided-claimed to prevent double refund.
            // Use slashed=true as the "consumed" marker (no additional state field needed).
            pending_commits.set(bidder_key, CommitState {
                auction_id:      commit.auction_id,
                commitment_hash: commit.commitment_hash,
                payment_amount:  0u128,
                revealed:        false,
                slashed:         true,
            });
        });
    }

    // =========================================================================
    // 17. withdraw_treasury_fees — sweep protocol treasury to a private recipient
    // =========================================================================
    //
    // Transfers `amount` microcredits from the on-chain protocol_treasury balance
    // to `recipient` as a private credits record. Requires prior 3-of-5 multisig
    // approval via fairdrop_multisig_v1.aleo::approve_op.
    //
    // Op hash pre-image (must match off-chain computation):
    //   BHP256::hash_to_field(WithdrawalOp { amount, recipient, nonce: op_nonce })
    //
    // Leo 4.0: transfer_public_to_private returns (credits, Final).

    fn withdraw_treasury_fees(
        public amount:    u128,
        public recipient: address,
        public op_nonce:  u64,
    ) -> (credits.aleo::credits, Final) {
        let op_hash: field = BHP256::hash_to_field(WithdrawalOp {
            amount,
            recipient,
            nonce: op_nonce,
        });

        let (out, f_transfer): (credits.aleo::credits, Final) =
            credits.aleo::transfer_public_to_private(recipient, amount as u64);

        return (out, final {
            assert(fairdrop_multisig_v1.aleo::approved_ops.get_or_use(op_hash, false));
            assert(!consumed_ops.get_or_use(op_hash, false));
            consumed_ops.set(op_hash, true);

            f_transfer.run();

            let treasury: u128 = protocol_treasury.get_or_use(0field, 0u128);
            assert(amount <= treasury);
            protocol_treasury.set(0field, treasury - amount);
        });
    }

    // =========================================================================
    // toggle_paused — local auction pause (multisig governance)
    // =========================================================================
    //
    // Pauses or unpauses this auction independently of fairdrop_config_v2::paused.
    // Either being true blocks create_auction, place_bid, reveal_bid, close_auction,
    // claim, etc. claim_voided and claim_commit_voided remain exempt from both
    // checks — bidder capital must always be recoverable regardless of pause state.
    //
    // Caller must first call fairdrop_multisig_v1.aleo::approve_op with:
    //   op_hash = BHP256::hash_to_field(PauseToggleOp { paused: is_paused, nonce: op_nonce })

    fn toggle_paused(
        public is_paused: bool,
        public op_nonce:  u64,
    ) -> Final {
        let op_hash: field = BHP256::hash_to_field(PauseToggleOp {
            paused: is_paused,
            nonce:  op_nonce,
        });
        return final {
            assert(fairdrop_multisig_v1.aleo::approved_ops.get_or_use(op_hash, false));
            assert(!consumed_ops.get_or_use(op_hash, false));
            consumed_ops.set(op_hash, true);
            paused.set(0field, is_paused);
        };
    }

    // =========================================================================
    // seed_liquidity — post-auction DEX pool seeding (creator only)
    // =========================================================================
    //
    // After close_auction (cleared), creator seeds fairswap_dex_v3.aleo with
    // liquidity in a single atomic transaction. No intermediate withdrawals.
    //
    // Token flow (all within one final {} — fully atomic):
    //   f_refund : auction credits.aleo → creator          (mirrors withdraw_payments)
    //   f_cred   : creator CREDITS_RESERVED_TOKEN_ID → DEX (via transfer_public_as_signer)
    //   f_sale   : mint unsold sale tokens → DEX            (via mint_public)
    //   f_cpi    : DEX add_liquidity_cpi — pool create (if new) + reserves + LP mint
    //
    // Credits bridge: auction holds credits.aleo; DEX needs CREDITS_RESERVED_TOKEN_ID.
    // Two simultaneous movements (refund + signer transfer) bridge atomically.
    // Creator must pre-hold amount_credits of CREDITS_RESERVED_TOKEN_ID.
    //
    // Accounting mirrors existing transitions exactly:
    //   credits    — same checks as withdraw_payments (creator_withdrawn + escrow_payments)
    //   sale tokens — same checks as withdraw_unsold   (unsold_withdrawn + escrow_sales)
    //
    // Pause: NOT exempt — protected by both global and local pause.
    // D11 param: sale_token_id (caller reads config.sale_token_id off-chain).

    fn seed_liquidity(
        public auction_id:        field,
        public sale_token_id:     field,    // D11: config.sale_token_id
        public amount_sale_token: u128,
        public amount_credits:    u128,
        public fee_bps:           u16,
        public min_lp:            u128,
        public lp_recipient:      address,
    ) -> Final {
        assert(amount_sale_token > 0u128 && amount_credits > 0u128);
        assert_neq(lp_recipient, ZERO_ADDRESS);
        let creator: address = self.signer;

        let f_refund: Final =
            credits.aleo::transfer_public(creator, amount_credits as u64);

        // Two-step: pull signer's CREDITS_RESERVED into this contract's public balance,
        // then convert to a private record owned by the DEX. transfer_public_to_private
        // uses self.caller (this contract) as sender, so f_signer_to_auction must run
        // before f_to_private in final {}.
        let f_signer_to_auction: Final =
            token_registry.aleo::transfer_public_as_signer(CREDITS_RESERVED_TOKEN_ID, self.address, amount_credits);
        let (record_credits, f_to_private): (token_registry.aleo::Token, Final) =
            token_registry.aleo::transfer_public_to_private(CREDITS_RESERVED_TOKEN_ID, fairswap_dex_v3.aleo, amount_credits, false);

        // Mint unsold sale tokens as a private record owned by the DEX.
        let (record_sale, f_sale): (token_registry.aleo::Token, Final) =
            token_registry.aleo::mint_private(sale_token_id, fairswap_dex_v3.aleo, amount_sale_token, false, 4294967295u32);

        let f_cpi: Final = fairswap_dex_v3.aleo::add_liquidity_cpi_private_in(
            record_credits,
            record_sale,
            fee_bps,
            min_lp,
            lp_recipient,
        );

        return final {
            assert(!fairdrop_config_v2.aleo::paused.get_or_use(0field, false) && !paused.get_or_use(0field, false));

            let config: AuctionConfig = auction_configs.get(auction_id);
            let state:  AuctionState  = auction_states.get(auction_id);

            assert(state.cleared);
            assert(!state.voided);
            assert_eq(creator,       config.creator);
            assert_eq(sale_token_id, config.sale_token_id);

            let withdrawn: u128     = creator_withdrawn.get_or_use(auction_id, 0u128);
            let new_withdrawn: u128 = withdrawn + amount_credits;
            assert(new_withdrawn <= state.creator_revenue);
            creator_withdrawn.set(auction_id, new_withdrawn);
            let escrow: u128 = escrow_payments.get(auction_id);
            assert(amount_credits <= escrow);
            escrow_payments.set(auction_id, escrow - amount_credits);

            let unsold: u128       = config.supply - state.total_committed;
            let unsold_drawn: u128 = unsold_withdrawn.get_or_use(auction_id, 0u128);
            let new_unsold: u128   = unsold_drawn + amount_sale_token;
            assert(new_unsold <= unsold);
            unsold_withdrawn.set(auction_id, new_unsold);
            let escrow_s: u128 = escrow_sales.get(auction_id);
            assert(amount_sale_token <= escrow_s);
            escrow_sales.set(auction_id, escrow_s - amount_sale_token);

            f_refund.run();
            f_signer_to_auction.run();
            f_to_private.run();
            f_sale.run();
            f_cpi.run();
        };
    }
}
