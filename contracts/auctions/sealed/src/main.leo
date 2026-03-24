// fairdrop_sealed_v1.aleo — Privacy-preserving sealed-bid commit-reveal auction.
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

import credits.aleo;
import token_registry.aleo;
import fairdrop_config_v1.aleo;
import fairdrop_gate_v1.aleo;
import fairdrop_proof_v1.aleo;
import fairdrop_ref_v1.aleo;
import fairdrop_vest_v1.aleo;

program fairdrop_sealed_v1.aleo {
    @admin(address="aleo128wz89c78ur4mx378056yd9q7kqmphr07k0kfsmnwvqnv7g9syyqkg263r")
    async constructor() {}

    // =========================================================================
    // Constants
    // =========================================================================

    const CREDITS_RESERVED_TOKEN_ID: field =
        3443843282313283355522573239085696902919850365217539366784739393210722344986field;

    const SUPPLY_MANAGER_ROLE: u8 = 3u8;

    // Distinguishes sealed auction_ids from other program types.
    // MUST differ from fairdrop_dutch (1field) and fairdrop_ascending (2field).
    const PROGRAM_SALT: field = 3field;

    // =========================================================================
    // Structs
    // =========================================================================

    struct TokenOwner { account: address, token_id: field }

    struct AuctionKey { creator: address, nonce: u64, program_salt: field }

    // Pseudonymous bidder key (raw address never on-chain).
    struct BidderKey { bidder: address, auction_id: field }

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

    // =========================================================================
    // 1. create_auction
    // =========================================================================
    //
    // `end_block` = reveal_end_block (the final auction deadline).
    // `sealed.commit_end_block` must satisfy: start_block < commit_end_block < end_block.
    // Clearing price = Dutch price at commit_end_block (validated in finalize).

    async transition create_auction(
        token:                 token_registry.aleo/Token,
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
    ) -> (token_registry.aleo/Token, Future) {
        assert(supply > 0u128);
        assert_eq(token.token_id, sale_token_id);
        assert_eq(token.amount, supply);

        let auction_id: field = BHP256::hash_to_field(AuctionKey {
            creator:      self.signer,
            nonce:        nonce,
            program_salt: PROGRAM_SALT,
        });

        let (remainder, f_burn): (token_registry.aleo/Token, Future) =
            token_registry.aleo/burn_private(token, supply);

        let f_creation: Future =
            credits.aleo/transfer_public_as_signer(self.address, snapshot.creation_fee as u64);

        // assert_config validates fee params and end_block > start_block.
        let f_cfg: Future = fairdrop_config_v1.aleo/assert_config(
            snapshot.fee_bps,
            snapshot.creation_fee,
            snapshot.closer_reward,
            snapshot.slash_reward_bps,
            snapshot.referral_pool_bps,
            start_block,
            end_block,
        );

        let f_gate: Future = fairdrop_gate_v1.aleo/register_gate(
            auction_id,
            gate.gate_mode,
            gate.merkle_root,
            gate.issuer,
        );

        let config: AuctionConfig = AuctionConfig {
            auction_id:         auction_id,
            creator:            self.signer,
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

        return (remainder, finalize_create_auction(
            f_burn, f_creation, f_cfg, f_gate,
            self.signer, auction_id, nonce, config, snapshot.creation_fee,
        ));
    }

    async function finalize_create_auction(
        f_burn:       Future,
        f_creation:   Future,
        f_cfg:        Future,
        f_gate:       Future,
        creator:      address,
        auction_id:   field,
        nonce:        u64,
        config:       AuctionConfig,
        creation_fee: u128,
    ) {
        assert(!fairdrop_config_v1.aleo/paused.get_or_use(0field, false));
        f_burn.await();
        f_creation.await();
        f_cfg.await();
        f_gate.await();

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
        assert_eq(nonce, creator_nonces.get_or_use(creator, 0u64));

        let expected_id: field = BHP256::hash_to_field(AuctionKey {
            creator:      creator,
            nonce:        nonce,
            program_salt: PROGRAM_SALT,
        });
        assert_eq(auction_id, expected_id);
        assert_eq(config.auction_id, auction_id);

        // Verify fairdrop_sealed_v1.aleo has SUPPLY_MANAGER_ROLE on the sale token.
        let sealed_role_key: field = BHP256::hash_to_field(TokenOwner {
            account:  fairdrop_sealed_v1.aleo,
            token_id: config.sale_token_id,
        });
        assert_eq(
            token_registry.aleo/roles.get_or_use(sealed_role_key, 0u8),
            SUPPLY_MANAGER_ROLE
        );

        let vest_duration_ok: bool =
            !config.vest_enabled || config.vest_end_blocks > config.vest_cliff_blocks;
        assert(vest_duration_ok);

        let vest_role_key: field = BHP256::hash_to_field(TokenOwner {
            account:  fairdrop_vest_v1.aleo,
            token_id: config.sale_token_id,
        });
        let vest_role_ok: bool =
            !config.vest_enabled ||
            token_registry.aleo/roles.get_or_use(vest_role_key, 0u8) == SUPPLY_MANAGER_ROLE;
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

        let count: u64 = creator_auction_count.get_or_use(creator, 0u64);
        creator_auction_count.set(creator, count + 1u64);
        let prev: field = creator_latest_auction.get_or_use(creator, 0field);
        auction_prev_by_creator.set(auction_id, prev);
        creator_latest_auction.set(creator, auction_id);

        creator_nonces.set(creator, nonce + 1u64);

        let treasury: u128 = protocol_treasury.get_or_use(0field, 0u128);
        protocol_treasury.set(0field, treasury + creation_fee);

        stats.set(0field, Stats {
            total_auctions:          s.total_auctions + 1u64,
            total_bids:              s.total_bids,
            total_payment_collected: s.total_payment_collected,
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

    async transition commit_bid_private(
        payment:               credits.aleo/credits,
        public auction_id:     field,
        private quantity:      u128,
        private nonce:         field,
        public payment_amount: u64,
    ) -> (credits.aleo/credits, Commitment, fairdrop_proof_v1.aleo/ParticipationReceipt, Future) {
        assert(quantity > 0u128);
        assert(payment_amount > 0u64);

        // Pseudonymous key — bidder identity hidden.
        let bidder_key: field = BHP256::hash_to_field(BidderKey {
            bidder:     self.signer,
            auction_id: auction_id,
        });

        // Commitment hides quantity until reveal.
        let commitment_hash: field = BHP256::hash_to_field(CommitRevealKey {
            quantity: quantity,
            nonce:    nonce,
            bidder:   self.signer,
        });

        let (change, f_credits): (credits.aleo/credits, Future) =
            credits.aleo/transfer_private_to_public(payment, self.address, payment_amount);

        let f_gate: Future = fairdrop_gate_v1.aleo/check_admission(auction_id);

        let (receipt, f_proof): (fairdrop_proof_v1.aleo/ParticipationReceipt, Future) =
            fairdrop_proof_v1.aleo/issue_receipt(auction_id, 0field, bidder_key);

        let commitment: Commitment = Commitment {
            owner:          self.signer,
            auction_id:     auction_id,
            commitment:     commitment_hash,
            payment_amount: payment_amount as u128,
            quantity:       quantity,
            nonce:          nonce,
        };

        return (change, commitment, receipt, finalize_commit_bid_private(
            f_credits, f_gate, f_proof,
            auction_id, bidder_key, commitment_hash, payment_amount as u128,
        ));
    }

    async function finalize_commit_bid_private(
        f_credits:       Future,
        f_gate:          Future,
        f_proof:         Future,
        auction_id:      field,
        bidder_key:      field,
        commitment_hash: field,
        payment_amount:  u128,
    ) {
        assert(!fairdrop_config_v1.aleo/paused.get_or_use(0field, false));
        f_credits.await();
        f_gate.await();
        f_proof.await();
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
        assert(payment_amount * config.sale_scale >= config.min_bid_amount * config.floor_price);
        // Store commitment for verification at reveal.
        pending_commits.set(bidder_key, CommitState {
            auction_id:      auction_id,
            commitment_hash: commitment_hash,
            payment_amount:  payment_amount,
            revealed:        false,
            slashed:         false,
        });
        let escrow: u128 = escrow_payments.get_or_use(auction_id, 0u128);
        escrow_payments.set(auction_id, escrow + payment_amount);
        let s: Stats = stats.get_or_use(0field, Stats {
            total_auctions: 0u64, total_bids: 0u64, total_payment_collected: 0u128
        });
        stats.set(0field, Stats {
            total_auctions:          s.total_auctions,
            total_bids:              s.total_bids + 1u64,
            total_payment_collected: s.total_payment_collected + payment_amount,
        });
        // ─────────────────────────────────────────────────────────────────────
    }

    // =========================================================================
    // 3. commit_bid_public — public credits balance
    // =========================================================================

    async transition commit_bid_public(
        public auction_id:     field,
        private quantity:      u128,
        private nonce:         field,
        public payment_amount: u64,
    ) -> (Commitment, fairdrop_proof_v1.aleo/ParticipationReceipt, Future) {
        assert(quantity > 0u128);
        assert(payment_amount > 0u64);

        let bidder_key: field = BHP256::hash_to_field(BidderKey {
            bidder:     self.signer,
            auction_id: auction_id,
        });

        let commitment_hash: field = BHP256::hash_to_field(CommitRevealKey {
            quantity: quantity,
            nonce:    nonce,
            bidder:   self.signer,
        });

        let f_credits: Future =
            credits.aleo/transfer_public_as_signer(self.address, payment_amount);

        let f_gate: Future = fairdrop_gate_v1.aleo/check_admission(auction_id);

        let (receipt, f_proof): (fairdrop_proof_v1.aleo/ParticipationReceipt, Future) =
            fairdrop_proof_v1.aleo/issue_receipt(auction_id, 0field, bidder_key);

        let commitment: Commitment = Commitment {
            owner:          self.signer,
            auction_id:     auction_id,
            commitment:     commitment_hash,
            payment_amount: payment_amount as u128,
            quantity:       quantity,
            nonce:          nonce,
        };

        return (commitment, receipt, finalize_commit_bid_public(
            f_credits, f_gate, f_proof,
            auction_id, bidder_key, commitment_hash, payment_amount as u128,
        ));
    }

    async function finalize_commit_bid_public(
        f_credits:       Future,
        f_gate:          Future,
        f_proof:         Future,
        auction_id:      field,
        bidder_key:      field,
        commitment_hash: field,
        payment_amount:  u128,
    ) {
        assert(!fairdrop_config_v1.aleo/paused.get_or_use(0field, false));
        f_credits.await();
        f_gate.await();
        f_proof.await();
        // ── shared commit validation ──────────────────────────────────────────
        let config: AuctionConfig = auction_configs.get(auction_id);
        let state:  AuctionState  = auction_states.get(auction_id);
        assert(!state.cleared);
        assert(!state.voided);
        assert(block.height >= config.start_block);
        assert(block.height <  config.commit_end_block);
        assert(!bid_committed.get_or_use(bidder_key, false));
        bid_committed.set(bidder_key, true);
        assert(payment_amount * config.sale_scale >= config.min_bid_amount * config.floor_price);
        pending_commits.set(bidder_key, CommitState {
            auction_id:      auction_id,
            commitment_hash: commitment_hash,
            payment_amount:  payment_amount,
            revealed:        false,
            slashed:         false,
        });
        let escrow: u128 = escrow_payments.get_or_use(auction_id, 0u128);
        escrow_payments.set(auction_id, escrow + payment_amount);
        let s: Stats = stats.get_or_use(0field, Stats {
            total_auctions: 0u64, total_bids: 0u64, total_payment_collected: 0u128
        });
        stats.set(0field, Stats {
            total_auctions:          s.total_auctions,
            total_bids:              s.total_bids + 1u64,
            total_payment_collected: s.total_payment_collected + payment_amount,
        });
        // ─────────────────────────────────────────────────────────────────────
    }

    // =========================================================================
    // 4. commit_bid_private_ref — private credits + referral attribution
    // =========================================================================

    async transition commit_bid_private_ref(
        payment:               credits.aleo/credits,
        public auction_id:     field,
        private quantity:      u128,
        private nonce:         field,
        public payment_amount: u64,
        public code_id:        field,
    ) -> (credits.aleo/credits, Commitment, fairdrop_proof_v1.aleo/ParticipationReceipt, Future) {
        assert(quantity > 0u128);
        assert(payment_amount > 0u64);

        let bidder_key: field = BHP256::hash_to_field(BidderKey {
            bidder:     self.signer,
            auction_id: auction_id,
        });

        let commitment_hash: field = BHP256::hash_to_field(CommitRevealKey {
            quantity: quantity,
            nonce:    nonce,
            bidder:   self.signer,
        });

        let (change, f_credits): (credits.aleo/credits, Future) =
            credits.aleo/transfer_private_to_public(payment, self.address, payment_amount);

        let f_gate: Future = fairdrop_gate_v1.aleo/check_admission(auction_id);

        let (receipt, f_proof): (fairdrop_proof_v1.aleo/ParticipationReceipt, Future) =
            fairdrop_proof_v1.aleo/issue_receipt(auction_id, 0field, bidder_key);

        let f_ref: Future = fairdrop_ref_v1.aleo/record_referral(
            code_id,
            auction_id,
            bidder_key,
            payment_amount as u128,
        );

        let commitment: Commitment = Commitment {
            owner:          self.signer,
            auction_id:     auction_id,
            commitment:     commitment_hash,
            payment_amount: payment_amount as u128,
            quantity:       quantity,
            nonce:          nonce,
        };

        return (change, commitment, receipt, finalize_commit_bid_priv_ref(
            f_credits, f_gate, f_proof, f_ref,
            auction_id, bidder_key, commitment_hash, payment_amount as u128,
        ));
    }

    async function finalize_commit_bid_priv_ref(
        f_credits:       Future,
        f_gate:          Future,
        f_proof:         Future,
        f_ref:           Future,
        auction_id:      field,
        bidder_key:      field,
        commitment_hash: field,
        payment_amount:  u128,
    ) {
        assert(!fairdrop_config_v1.aleo/paused.get_or_use(0field, false));
        f_credits.await();
        f_gate.await();
        f_proof.await();
        f_ref.await();
        // ── shared commit validation ──────────────────────────────────────────
        let config: AuctionConfig = auction_configs.get(auction_id);
        let state:  AuctionState  = auction_states.get(auction_id);
        assert(!state.cleared);
        assert(!state.voided);
        assert(block.height >= config.start_block);
        assert(block.height <  config.commit_end_block);
        assert(!bid_committed.get_or_use(bidder_key, false));
        bid_committed.set(bidder_key, true);
        assert(payment_amount * config.sale_scale >= config.min_bid_amount * config.floor_price);
        pending_commits.set(bidder_key, CommitState {
            auction_id:      auction_id,
            commitment_hash: commitment_hash,
            payment_amount:  payment_amount,
            revealed:        false,
            slashed:         false,
        });
        let escrow: u128 = escrow_payments.get_or_use(auction_id, 0u128);
        escrow_payments.set(auction_id, escrow + payment_amount);
        let s: Stats = stats.get_or_use(0field, Stats {
            total_auctions: 0u64, total_bids: 0u64, total_payment_collected: 0u128
        });
        stats.set(0field, Stats {
            total_auctions:          s.total_auctions,
            total_bids:              s.total_bids + 1u64,
            total_payment_collected: s.total_payment_collected + payment_amount,
        });
        // ─────────────────────────────────────────────────────────────────────
    }

    // =========================================================================
    // 5. commit_bid_public_ref — public credits + referral attribution
    // =========================================================================

    async transition commit_bid_public_ref(
        public auction_id:     field,
        private quantity:      u128,
        private nonce:         field,
        public payment_amount: u64,
        public code_id:        field,
    ) -> (Commitment, fairdrop_proof_v1.aleo/ParticipationReceipt, Future) {
        assert(quantity > 0u128);
        assert(payment_amount > 0u64);

        let bidder_key: field = BHP256::hash_to_field(BidderKey {
            bidder:     self.signer,
            auction_id: auction_id,
        });

        let commitment_hash: field = BHP256::hash_to_field(CommitRevealKey {
            quantity: quantity,
            nonce:    nonce,
            bidder:   self.signer,
        });

        let f_credits: Future =
            credits.aleo/transfer_public_as_signer(self.address, payment_amount);

        let f_gate: Future = fairdrop_gate_v1.aleo/check_admission(auction_id);

        let (receipt, f_proof): (fairdrop_proof_v1.aleo/ParticipationReceipt, Future) =
            fairdrop_proof_v1.aleo/issue_receipt(auction_id, 0field, bidder_key);

        let f_ref: Future = fairdrop_ref_v1.aleo/record_referral(
            code_id,
            auction_id,
            bidder_key,
            payment_amount as u128,
        );

        let commitment: Commitment = Commitment {
            owner:          self.signer,
            auction_id:     auction_id,
            commitment:     commitment_hash,
            payment_amount: payment_amount as u128,
            quantity:       quantity,
            nonce:          nonce,
        };

        return (commitment, receipt, finalize_commit_bid_pub_ref(
            f_credits, f_gate, f_proof, f_ref,
            auction_id, bidder_key, commitment_hash, payment_amount as u128,
        ));
    }

    async function finalize_commit_bid_pub_ref(
        f_credits:       Future,
        f_gate:          Future,
        f_proof:         Future,
        f_ref:           Future,
        auction_id:      field,
        bidder_key:      field,
        commitment_hash: field,
        payment_amount:  u128,
    ) {
        assert(!fairdrop_config_v1.aleo/paused.get_or_use(0field, false));
        f_credits.await();
        f_gate.await();
        f_proof.await();
        f_ref.await();
        // ── shared commit validation ──────────────────────────────────────────
        let config: AuctionConfig = auction_configs.get(auction_id);
        let state:  AuctionState  = auction_states.get(auction_id);
        assert(!state.cleared);
        assert(!state.voided);
        assert(block.height >= config.start_block);
        assert(block.height <  config.commit_end_block);
        assert(!bid_committed.get_or_use(bidder_key, false));
        bid_committed.set(bidder_key, true);
        assert(payment_amount * config.sale_scale >= config.min_bid_amount * config.floor_price);
        pending_commits.set(bidder_key, CommitState {
            auction_id:      auction_id,
            commitment_hash: commitment_hash,
            payment_amount:  payment_amount,
            revealed:        false,
            slashed:         false,
        });
        let escrow: u128 = escrow_payments.get_or_use(auction_id, 0u128);
        escrow_payments.set(auction_id, escrow + payment_amount);
        let s: Stats = stats.get_or_use(0field, Stats {
            total_auctions: 0u64, total_bids: 0u64, total_payment_collected: 0u128
        });
        stats.set(0field, Stats {
            total_auctions:          s.total_auctions,
            total_bids:              s.total_bids + 1u64,
            total_payment_collected: s.total_payment_collected + payment_amount,
        });
        // ─────────────────────────────────────────────────────────────────────
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

    async transition reveal_bid(
        commitment:            Commitment,
        private quantity:      u128,
        private nonce:         field,
        public max_bid_amount: u128,    // D11: config.max_bid_amount
    ) -> (Bid, Future) {
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

        let bid: Bid = Bid {
            owner:          self.signer,
            auction_id:     commitment.auction_id,
            quantity:       capped,
            payment_amount: commitment.payment_amount,
        };

        return (bid, finalize_reveal_bid(
            commitment.auction_id,
            bidder_key,
            capped,
            commitment.payment_amount,
            max_bid_amount,
        ));
    }

    async function finalize_reveal_bid(
        auction_id:      field,
        bidder_key:      field,
        capped_quantity: u128,
        payment_amount:  u128,
        max_bid_amount:  u128,
    ) {
        assert(!fairdrop_config_v1.aleo/paused.get_or_use(0field, false));

        let config: AuctionConfig = auction_configs.get(auction_id);
        let state:  AuctionState  = auction_states.get(auction_id);

        assert(!state.cleared);
        assert(!state.voided);
        // Reveal window: commit_end_block ≤ block.height < end_block.
        assert(block.height >= config.commit_end_block);
        assert(block.height <  config.end_block);

        // D11: max_bid_amount must match config.
        assert_eq(max_bid_amount, config.max_bid_amount);

        // Verify capped_quantity ≤ max_bid_amount (or no cap).
        let cap_ok: bool = config.max_bid_amount == 0u128
            || capped_quantity <= config.max_bid_amount;
        assert(cap_ok);

        // Load commitment; must exist, not revealed, not slashed.
        let commit: CommitState = pending_commits.get(bidder_key);
        assert_eq(commit.auction_id, auction_id);
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
        assert(payment_amount * config.sale_scale >= capped_quantity * clearing_price);

        // Enforce min_bid_amount.
        assert(capped_quantity >= config.min_bid_amount);

        // Supply cap: refuse bids that would overflow supply.
        let new_committed: u128 = state.total_committed + capped_quantity;
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
        auction_states.set(auction_id, AuctionState {
            total_committed: new_committed,
            total_payments:  state.total_payments + payment_amount,
            supply_met:      is_supply_met,
            ended_at_block:  is_supply_met ? block.height : state.ended_at_block,
            cleared:         false,
            clearing_price:  0u128,
            creator_revenue: 0u128,
            protocol_fee:    0u128,
            voided:          false,
            referral_budget: 0u128,
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

    async transition slash_unrevealed(
        public commitment_key:  field,   // BHP256(BidderKey { bidder, auction_id })
        public auction_id:      field,
        public payment_amount:  u128,    // D11: pending_commits[commitment_key].payment_amount
        public slash_reward_bps: u16,    // D11: from fairdrop_config
    ) -> Future {
        let slash_reward: u128 = payment_amount * (slash_reward_bps as u128) / 10000u128;
        // Pay caller their slash reward immediately.
        let f_slash: Future = credits.aleo/transfer_public(self.signer, slash_reward as u64);

        return finalize_slash_unrevealed(
            f_slash,
            commitment_key,
            auction_id,
            payment_amount,
            slash_reward,
            slash_reward_bps,
        );
    }

    async function finalize_slash_unrevealed(
        f_slash:         Future,
        commitment_key:  field,
        auction_id:      field,
        payment_amount:  u128,
        slash_reward:    u128,
        slash_reward_bps: u16,
    ) {
        assert(!fairdrop_config_v1.aleo/paused.get_or_use(0field, false));
        f_slash.await();

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

    async transition close_auction(
        public auction_id:    field,
        public creator:       address,
        public filled:        bool,
        public volume:        u128,
        public closer_reward: u128,
    ) -> Future {
        let f_closer: Future =
            credits.aleo/transfer_public(self.signer, closer_reward as u64);

        let f_proof: Future =
            fairdrop_proof_v1.aleo/update_reputation(creator, filled, volume);

        return finalize_close_auction(
            f_closer, f_proof,
            auction_id, creator, filled, volume, closer_reward,
        );
    }

    async function finalize_close_auction(
        f_closer:      Future,
        f_proof:       Future,
        auction_id:    field,
        creator:       address,
        filled:        bool,
        volume:        u128,
        closer_reward: u128,
    ) {
        assert(!fairdrop_config_v1.aleo/paused.get_or_use(0field, false));
        f_closer.await();
        f_proof.await();

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
    }

    // =========================================================================
    // 9. push_referral_budget — permissionless; call after close_auction
    // =========================================================================

    async transition push_referral_budget(
        public auction_id: field,
        public budget:     u128,
    ) -> Future {
        let f_credits: Future =
            credits.aleo/transfer_public(fairdrop_ref_v1.aleo, budget as u64);
        let f_ref: Future = fairdrop_ref_v1.aleo/fund_reserve(auction_id, budget);
        return finalize_push_ref_budget(f_credits, f_ref, auction_id, budget);
    }

    async function finalize_push_ref_budget(
        f_credits:  Future,
        f_ref:      Future,
        auction_id: field,
        budget:     u128,
    ) {
        f_credits.await();
        f_ref.await();

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
    }

    // =========================================================================
    // 10. claim — redeem Bid record (non-vesting sealed auctions)
    // =========================================================================
    //
    // Uniform clearing price applies. Overpayment refunded privately.
    // bid.owner is private — both token recipient and refund recipient hidden.

    async transition claim(
        bid:                   Bid,
        public clearing_price: u128,
        public sale_token_id:  field,
        public sale_scale:     u128,
    ) -> (token_registry.aleo/Token, credits.aleo/credits, Future) {
        let sale_amount: u128  = bid.quantity;
        let cost: u128         = bid.quantity * clearing_price / sale_scale;
        let refund_amount: u64 = (bid.payment_amount - cost) as u64;

        let (sale_token, f_mint): (token_registry.aleo/Token, Future) =
            token_registry.aleo/mint_private(
                sale_token_id,
                bid.owner,
                sale_amount,
                false,
                4294967295u32,
            );

        let (refund, f_refund): (credits.aleo/credits, Future) =
            credits.aleo/transfer_public_to_private(bid.owner, refund_amount);

        return (sale_token, refund, finalize_claim(
            f_mint, f_refund,
            bid.auction_id, clearing_price, sale_token_id, sale_scale,
            sale_amount, refund_amount as u128,
        ));
    }

    async function finalize_claim(
        f_mint:         Future,
        f_refund:       Future,
        auction_id:     field,
        clearing_price: u128,
        sale_token_id:  field,
        sale_scale:     u128,
        sale_amount:    u128,
        refund_amount:  u128,
    ) {
        assert(!fairdrop_config_v1.aleo/paused.get_or_use(0field, false));
        f_mint.await();
        f_refund.await();

        let config: AuctionConfig = auction_configs.get(auction_id);
        let state:  AuctionState  = auction_states.get(auction_id);

        assert(state.cleared);
        assert(!state.voided);
        assert(!config.vest_enabled);
        assert_eq(clearing_price, state.clearing_price);
        assert_eq(sale_token_id,  config.sale_token_id);
        assert_eq(sale_scale,     config.sale_scale);

        let sale_remaining: u128 = escrow_sales.get(auction_id);
        assert(sale_amount <= sale_remaining);
        escrow_sales.set(auction_id, sale_remaining - sale_amount);

        let payment_remaining: u128 = escrow_payments.get(auction_id);
        assert(refund_amount <= payment_remaining);
        escrow_payments.set(auction_id, payment_remaining - refund_amount);
    }

    // =========================================================================
    // 11. claim_vested — redeem Bid record (vest_enabled sealed auctions)
    // =========================================================================

    async transition claim_vested(
        bid:                    Bid,
        public clearing_price:  u128,
        public sale_token_id:   field,
        public sale_scale:      u128,
        public ended_at_block:  u32,
        public cliff_blocks:    u32,
        public vest_end_blocks: u32,
    ) -> (fairdrop_vest_v1.aleo/VestedAllocation, credits.aleo/credits, Future) {
        let sale_amount: u128  = bid.quantity;
        let cost: u128         = bid.quantity * clearing_price / sale_scale;
        let refund_amount: u64 = (bid.payment_amount - cost) as u64;

        let (vest, f_vest): (fairdrop_vest_v1.aleo/VestedAllocation, Future) =
            fairdrop_vest_v1.aleo/create_vest(
                bid.auction_id,
                bid.owner,
                sale_token_id,
                sale_amount,
                ended_at_block,
                cliff_blocks,
                vest_end_blocks,
            );

        let (refund, f_refund): (credits.aleo/credits, Future) =
            credits.aleo/transfer_public_to_private(bid.owner, refund_amount);

        return (vest, refund, finalize_claim_vested(
            f_vest, f_refund,
            bid.auction_id, clearing_price, sale_token_id, sale_scale,
            sale_amount, refund_amount as u128,
            ended_at_block, cliff_blocks, vest_end_blocks,
        ));
    }

    async function finalize_claim_vested(
        f_vest:          Future,
        f_refund:        Future,
        auction_id:      field,
        clearing_price:  u128,
        sale_token_id:   field,
        sale_scale:      u128,
        sale_amount:     u128,
        refund_amount:   u128,
        ended_at_block:  u32,
        cliff_blocks:    u32,
        vest_end_blocks: u32,
    ) {
        assert(!fairdrop_config_v1.aleo/paused.get_or_use(0field, false));
        f_vest.await();
        f_refund.await();

        let config: AuctionConfig = auction_configs.get(auction_id);
        let state:  AuctionState  = auction_states.get(auction_id);

        assert(state.cleared);
        assert(!state.voided);
        assert(config.vest_enabled);
        assert_eq(clearing_price, state.clearing_price);
        assert_eq(sale_token_id,  config.sale_token_id);
        assert_eq(sale_scale,     config.sale_scale);
        assert_eq(ended_at_block,  state.ended_at_block);
        assert_eq(cliff_blocks,    config.vest_cliff_blocks);
        assert_eq(vest_end_blocks, config.vest_end_blocks);

        let sale_remaining: u128 = escrow_sales.get(auction_id);
        assert(sale_amount <= sale_remaining);
        escrow_sales.set(auction_id, sale_remaining - sale_amount);

        let payment_remaining: u128 = escrow_payments.get(auction_id);
        assert(refund_amount <= payment_remaining);
        escrow_payments.set(auction_id, payment_remaining - refund_amount);
    }

    // =========================================================================
    // 12. withdraw_payments — creator withdraws clearing-price revenue
    // =========================================================================

    async transition withdraw_payments(
        public auction_id: field,
        public amount:     u128,
    ) -> Future {
        assert(amount > 0u128);
        let f0: Future = credits.aleo/transfer_public(self.signer, amount as u64);
        return finalize_withdraw_payments(f0, auction_id, self.signer, amount);
    }

    async function finalize_withdraw_payments(
        f0:         Future,
        auction_id: field,
        caller:     address,
        amount:     u128,
    ) {
        assert(!fairdrop_config_v1.aleo/paused.get_or_use(0field, false));
        f0.await();

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
    }

    // =========================================================================
    // 13. withdraw_unsold — creator mints back unsold supply after close
    // =========================================================================

    async transition withdraw_unsold(
        public auction_id:    field,
        public amount:        u128,
        public sale_token_id: field,
    ) -> (token_registry.aleo/Token, Future) {
        assert(amount > 0u128);

        let (token, f_mint): (token_registry.aleo/Token, Future) =
            token_registry.aleo/mint_private(
                sale_token_id,
                self.signer,
                amount,
                false,
                4294967295u32,
            );

        return (token, finalize_withdraw_unsold(
            f_mint, auction_id, self.signer, amount, sale_token_id,
        ));
    }

    async function finalize_withdraw_unsold(
        f_mint:        Future,
        auction_id:    field,
        caller:        address,
        amount:        u128,
        sale_token_id: field,
    ) {
        assert(!fairdrop_config_v1.aleo/paused.get_or_use(0field, false));
        f_mint.await();

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
    }

    // =========================================================================
    // 14. cancel_auction — creator escape hatch
    // =========================================================================
    //
    // Creator cancels any non-cleared, non-voided auction at any time.
    // Full supply minted back to creator. Bidder credits remain in escrow;
    // revealed bidders use claim_voided; unrevealed bidders use claim_commit_voided.

    async transition cancel_auction(
        public auction_id:    field,
        public sale_token_id: field,
        public supply:        u128,
    ) -> (token_registry.aleo/Token, Future) {
        let (token, f_mint): (token_registry.aleo/Token, Future) =
            token_registry.aleo/mint_private(
                sale_token_id,
                self.signer,
                supply,
                false,
                4294967295u32,
            );

        return (token, finalize_cancel_auction(
            f_mint, self.signer, auction_id, sale_token_id, supply,
        ));
    }

    async function finalize_cancel_auction(
        f_mint:        Future,
        creator:       address,
        auction_id:    field,
        sale_token_id: field,
        supply:        u128,
    ) {
        assert(!fairdrop_config_v1.aleo/paused.get_or_use(0field, false));
        f_mint.await();

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
    }

    // =========================================================================
    // 15. claim_voided — bidder (revealed Bid record) recovers from voided auction
    // =========================================================================
    //
    // No paused check — bidder capital must always be recoverable.

    async transition claim_voided(
        bid: Bid,
    ) -> (credits.aleo/credits, Future) {
        let (refund, f_refund): (credits.aleo/credits, Future) =
            credits.aleo/transfer_public_to_private(bid.owner, bid.payment_amount as u64);

        return (refund, finalize_claim_voided(
            f_refund, bid.auction_id, bid.payment_amount,
        ));
    }

    async function finalize_claim_voided(
        f_refund:       Future,
        auction_id:     field,
        payment_amount: u128,
    ) {
        f_refund.await();

        let state: AuctionState = auction_states.get(auction_id);
        assert(state.voided);

        let remaining: u128 = escrow_payments.get_or_use(auction_id, 0u128);
        assert(payment_amount <= remaining);
        escrow_payments.set(auction_id, remaining - payment_amount);
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

    async transition claim_commit_voided(
        commitment: Commitment,
    ) -> (credits.aleo/credits, Future) {
        let (refund, f_refund): (credits.aleo/credits, Future) =
            credits.aleo/transfer_public_to_private(
                commitment.owner,
                commitment.payment_amount as u64,
            );

        // Compute pseudonymous key to verify non-slashed status in finalize.
        let bidder_key: field = BHP256::hash_to_field(BidderKey {
            bidder:     self.signer,
            auction_id: commitment.auction_id,
        });

        return (refund, finalize_claim_commit_voided(
            f_refund,
            commitment.auction_id,
            bidder_key,
            commitment.payment_amount,
        ));
    }

    async function finalize_claim_commit_voided(
        f_refund:       Future,
        auction_id:     field,
        bidder_key:     field,
        payment_amount: u128,
    ) {
        f_refund.await();

        let state: AuctionState = auction_states.get(auction_id);
        assert(state.voided);

        // Reject if slashed — payment already removed from escrow.
        let commit: CommitState = pending_commits.get(bidder_key);
        assert_eq(commit.auction_id, auction_id);
        assert(!commit.revealed);
        assert(!commit.slashed);
        assert_eq(commit.payment_amount, payment_amount);

        let remaining: u128 = escrow_payments.get_or_use(auction_id, 0u128);
        assert(payment_amount <= remaining);
        escrow_payments.set(auction_id, remaining - payment_amount);

        // Mark commitment as voided-claimed to prevent double refund.
        // Use slashed=true as the "consumed" marker (no additional state field needed).
        pending_commits.set(bidder_key, CommitState {
            auction_id:      commit.auction_id,
            commitment_hash: commit.commitment_hash,
            payment_amount:  0u128,
            revealed:        false,
            slashed:         true,
        });
    }
}
