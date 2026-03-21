// fairdrop_dutch.aleo — Privacy-preserving descending-price Dutch auction.
//
// Mechanism: price descends from start_price toward floor_price in discrete steps.
// All winners pay the same clearing price set at close_auction.
//
// Payment token : credits.aleo — private record OR public balance.
// Sale tokens   : token_registry.aleo/Token. Burned at create (freeing max_supply),
//                 re-minted at claim/claim_vested. Net supply change = 0.
//
// Roles required:
//   fairdrop_dutch.aleo — SUPPLY_MANAGER_ROLE on sale token (burn + mint).
//   fairdrop_vest.aleo  — SUPPLY_MANAGER_ROLE on sale token (mint at release),
//                         required only when vest_enabled = true.
//
// Revenue accounting (set at close_auction):
//   total_cost      = total_committed * clearing_price / sale_scale
//   protocol_fee    = total_cost * fee_bps / 10000
//   creator_revenue = total_cost - protocol_fee
//   referral_budget = protocol_fee * REFERRAL_SHARE_BPS / 10000
//   treasury credit = protocol_fee - referral_budget - closer_reward
//
//   Invariant: creator_revenue + sum(bidder_refunds) + protocol_fee = total_payments ✓
//   (bidder_refunds = total_payments − total_cost, fee comes from creator's clearing revenue)
//
// Auction ID derivation:
//   auction_id = BHP256(AuctionKey { creator, nonce, PROGRAM_SALT = 1field })
//   Creator supplies `nonce` (= creator_nonces[creator]); finalize D11-validates it.
//   Per-creator nonces prevent ID collision between concurrent creators.
//   PROGRAM_SALT prevents cross-auction-type collisions (e.g. dutch vs sealed).
//
// Privacy model:
//   - Bid payment amount : public (unavoidable — on-chain escrow accounting).
//   - Bid source         : hidden for place_bid_private (private UTXO consumed).
//   - Bidder identity    : pseudonymous — only BHP256(bidder, auction_id) on-chain.
//   - Token recipients   : private (mint_private / transfer_public_to_private).
//   - Vest owner         : private (passed as private param to create_vest CPI).
//
// Pause model:
//   All finalizes except claim_voided assert !fairdrop_config.paused (direct read).
//   claim_voided is pause-exempt — bidders must always be able to recover funds.
//
// Lifecycle:
//   create_auction → place_bid_* → close_auction → [push_referral_budget] →
//   claim / claim_vested → withdraw_payments + withdraw_unsold
//   OR: cancel_auction → claim_voided (escape hatch)

import credits.aleo;
import token_registry.aleo;
import fairdrop_config.aleo;
import fairdrop_gate.aleo;
import fairdrop_proof.aleo;
import fairdrop_ref.aleo;
import fairdrop_vest.aleo;

program fairdrop_dutch.aleo {
    @admin(address="aleo128wz89c78ur4mx378056yd9q7kqmphr07k0kfsmnwvqnv7g9syyqkg263r")
    async constructor() {}

    // =========================================================================
    // Constants
    // =========================================================================

    // ALEO credits registered in token_registry.aleo.
    const CREDITS_RESERVED_TOKEN_ID: field =
        3443843282313283355522573239085696902919850365217539366784739393210722344986field;

    // Required role for burn_private (create) and mint_private (claim/withdraw_unsold).
    const SUPPLY_MANAGER_ROLE: u8 = 3u8;

    // Distinguishes auction_ids from fairdrop_dutch vs other auction programs.
    // All auction types must use distinct PROGRAM_SALT values.
    const PROGRAM_SALT: field = 1field;

    // Share of protocol_fee allocated to the referral reserve. 20% of fee.
    const REFERRAL_SHARE_BPS: u16 = 2000u16;

    // =========================================================================
    // Structs
    // =========================================================================

    // From token_registry.aleo — field order must match exactly for correct hashing.
    struct TokenOwner { account: address, token_id: field }

    // BHP256 input for auction_id. PROGRAM_SALT prevents cross-type ID collision.
    struct AuctionKey { creator: address, nonce: u64, program_salt: field }

    // BHP256 input for pseudonymous per-bidder key. Raw bidder address never on-chain.
    struct BidderKey { bidder: address, auction_id: field }

    // Immutable auction parameters. Written once at create_auction; never modified.
    struct AuctionConfig {
        auction_id:         field,
        creator:            address,
        sale_token_id:      field,
        payment_token_id:   field,    // always CREDITS_RESERVED_TOKEN_ID (v2)
        supply:             u128,     // raw token units available
        start_price:        u128,     // microcredits per sale_scale units
        floor_price:        u128,     // minimum clearing price
        start_block:        u32,
        end_block:          u32,
        price_decay_blocks: u32,      // blocks per price step
        price_decay_amount: u128,     // microcredits drop per step
        max_bid_amount:     u128,     // 0 = no per-bidder cap
        min_bid_amount:     u128,
        sale_scale:         u128,     // 10^sale_token_decimals
        gate_mode:          u8,       // 0=open 1=merkle 2=credential
        vest_enabled:       bool,     // true → claim_vested required; claim blocked
        vest_cliff_blocks:  u32,      // blocks after ended_at_block before release
        vest_end_blocks:    u32,      // blocks after ended_at_block for full vest
        fee_bps:            u16,      // D16: snapshotted from fairdrop_config at create
        closer_reward:      u128,     // D16: snapshotted from fairdrop_config at create
    }

    // Mutable auction lifecycle state.
    struct AuctionState {
        total_committed: u128,  // cumulative bid quantity
        total_payments:  u128,  // cumulative bidder credits locked
        supply_met:      bool,  // true when total_committed >= supply
        ended_at_block:  u32,   // block supply was exhausted OR config.end_block at close
        cleared:         bool,  // true after close_auction
        clearing_price:  u128,  // uniform price; set at close
        creator_revenue: u128,  // total_cost - protocol_fee; set at close
        protocol_fee:    u128,  // total_cost * fee_bps / 10000; set at close
        voided:          bool,  // true after cancel_auction
        referral_budget: u128,  // portion of protocol_fee for referrals; set at close
    }

    // Global stats for enumeration and volume tracking.
    struct Stats {
        total_auctions:          u64,
        total_bids:              u64,
        total_payment_collected: u128,
    }

    // Input struct: Dutch-specific price parameters.
    // Grouped to keep create_auction under Leo's 16-parameter limit.
    struct DutchParams {
        start_price:        u128,
        floor_price:        u128,
        price_decay_blocks: u32,
        price_decay_amount: u128,
    }

    // Input struct: gate registration parameters.
    struct GateParams {
        gate_mode:   u8,
        merkle_root: field,
        issuer:      address,
    }

    // Input struct: vesting schedule parameters.
    struct VestParams {
        vest_enabled:      bool,
        vest_cliff_blocks: u32,
        vest_end_blocks:   u32,
    }

    // D16 snapshot of protocol-level configuration parameters.
    // Validated by assert_config CPI; fee_bps and closer_reward stored in AuctionConfig.
    struct ConfigSnapshot {
        fee_bps:          u16,
        creation_fee:     u128,
        closer_reward:    u128,
        slash_reward_bps: u16,
    }

    // =========================================================================
    // Records
    // =========================================================================

    // Private bid receipt. Single-spend UTXO: consumed once at claim or claim_vested.
    record Bid {
        owner:          address,  // private — never in finalize
        auction_id:     field,
        quantity:       u128,
        payment_amount: u128,     // microcredits deposited (fits u64; stored as u128)
    }

    // =========================================================================
    // Mappings
    // =========================================================================

    mapping auction_configs:  field => AuctionConfig;
    mapping auction_states:   field => AuctionState;

    // BHP256(BidderKey) → cumulative quantity. Enforces max_bid_amount per bidder.
    // Pseudonymous: raw bidder address never stored.
    mapping bid_totals: field => u128;

    // Burn-backed mint budget (= supply at creation; decremented at claim/withdraw_unsold).
    // Actual tokens are NOT held — budget tracks how many can still be minted.
    mapping escrow_sales: field => u128;

    // Bidder credits locked in this program's public credits.aleo balance.
    // Decremented by claim refunds, withdraw_payments, claim_voided.
    mapping escrow_payments: field => u128;

    mapping creator_withdrawn: field => u128;
    mapping unsold_withdrawn:  field => u128;

    mapping stats: field => Stats;

    // Global sequential index: n-th auction created → auction_id.
    mapping auction_index: u64 => field;

    // Per-creator discovery (linked list, O(K) enumeration).
    mapping creator_auction_count:   address => u64;
    mapping creator_latest_auction:  address => field;
    mapping auction_prev_by_creator: field   => field;

    // Per-creator nonce for auction_id derivation. Prevents ID collision between
    // simultaneous same-creator creates and cross-creator collisions.
    mapping creator_nonces: address => u64;

    // Protocol-owned credits accounting (creation_fees + protocol_fees − closer_rewards).
    // Actual credits sit in this program's credits.aleo public balance.
    // Keyed by 0field (single global value).
    mapping protocol_treasury: field => u128;

    // =========================================================================
    // 1. create_auction
    // =========================================================================
    //
    // Burns `supply` tokens from creator's private Token record (frees max_supply
    // headroom so mint_private at claim is always guaranteed to succeed).
    // Remainder (token.amount - supply) returned as a private Token record.
    //
    // CPIs (all atomic — any failure reverts the entire tx):
    //   burn_private         — consume deposit, return change
    //   transfer_public_as_signer — creator pays creation_fee anti-spam deposit
    //   assert_config        — D16: validate snapshotted protocol params + duration
    //   register_gate        — set gate mode for this auction in fairdrop_gate.aleo
    //
    // D11 nonce pattern: creator reads creator_nonces[creator] off-chain and passes
    // as `nonce`. Transition body computes auction_id so register_gate CPI can use it.
    // Finalize re-derives auction_id and validates nonce == creator_nonces[creator].
    // Concurrent same-creator creates with the same nonce: second finalize fails.
    //
    // Parameters are grouped into DutchParams / GateParams / VestParams / ConfigSnapshot
    // structs to stay within Leo's 16-parameter limit on async transitions.
    //
    // token.amount must equal supply exactly — no useful remainder returned.
    // The zero-amount remainder from burn_private is harmless dust (wallets filter it).

    async transition create_auction(
        token:                token_registry.aleo/Token,
        public sale_token_id: field,
        public supply:        u128,
        public start_block:   u32,
        public end_block:     u32,
        public max_bid_amount: u128,   // 0 = unlimited per bidder
        public min_bid_amount: u128,
        public sale_scale:    u128,
        public nonce:         u64,     // D11: creator_nonces[creator]
        public dutch:         DutchParams,
        public gate:          GateParams,
        public vest:          VestParams,
        public snapshot:      ConfigSnapshot,
    ) -> (token_registry.aleo/Token, Future) {
        assert(supply > 0u128);
        assert_eq(token.token_id, sale_token_id);
        assert_eq(token.amount, supply);  // exact deposit — remainder is always zero-amount dust

        // Compute auction_id in transition body so CPIs can reference it.
        let auction_id: field = BHP256::hash_to_field(AuctionKey {
            creator:      self.signer,
            nonce:        nonce,
            program_salt: PROGRAM_SALT,
        });

        // CPI 1: burn supply from deposit; return zero-amount remainder (harmless dust).
        let (remainder, f_burn): (token_registry.aleo/Token, Future) =
            token_registry.aleo/burn_private(token, supply);

        // CPI 2: deduct creation_fee anti-spam deposit from creator's public balance.
        let f_creation: Future =
            credits.aleo/transfer_public_as_signer(self.address, snapshot.creation_fee as u64);

        // CPI 3: validate all snapshotted config params AND auction duration.
        //   Reverts if any param drifted since frontend read (race window protection).
        let f_cfg: Future = fairdrop_config.aleo/assert_config(
            snapshot.fee_bps,
            snapshot.creation_fee,
            snapshot.closer_reward,
            snapshot.slash_reward_bps,
            start_block,
            end_block,
        );

        // CPI 4: register gate mode. GATE_OPEN (0) still registers — explicit is safer.
        let f_gate: Future = fairdrop_gate.aleo/register_gate(
            auction_id,
            gate.gate_mode,
            gate.merkle_root,
            gate.issuer,
        );

        // Build AuctionConfig in transition body and pass as one struct to finalize,
        // keeping finalize under the 16-parameter limit.
        let config: AuctionConfig = AuctionConfig {
            auction_id:         auction_id,
            creator:            self.signer,
            sale_token_id:      sale_token_id,
            payment_token_id:   CREDITS_RESERVED_TOKEN_ID,  // hardcoded; only credits accepted
            supply:             supply,
            start_price:        dutch.start_price,
            floor_price:        dutch.floor_price,
            start_block:        start_block,
            end_block:          end_block,
            price_decay_blocks: dutch.price_decay_blocks,
            price_decay_amount: dutch.price_decay_amount,
            max_bid_amount:     max_bid_amount,
            min_bid_amount:     min_bid_amount,
            sale_scale:         sale_scale,
            gate_mode:          gate.gate_mode,
            vest_enabled:       vest.vest_enabled,
            vest_cliff_blocks:  vest.vest_cliff_blocks,
            vest_end_blocks:    vest.vest_end_blocks,
            fee_bps:            snapshot.fee_bps,
            closer_reward:      snapshot.closer_reward,
        };

        return (remainder, finalize_create_auction(
            f_burn,
            f_creation,
            f_cfg,
            f_gate,
            self.signer,
            auction_id,
            nonce,
            config,
            snapshot.creation_fee,
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
        assert(!fairdrop_config.aleo/paused.get_or_use(0field, false));
        f_burn.await();
        f_creation.await();
        f_cfg.await();    // validates params, duration, and asserts end_block > start_block
        f_gate.await();

        // payment_token_id was hardcoded to CREDITS_RESERVED_TOKEN_ID in transition body;
        // assert here for defence in depth (catches any constant mismatch on upgrade).
        assert_eq(config.payment_token_id, CREDITS_RESERVED_TOKEN_ID);
        assert(config.sale_token_id != CREDITS_RESERVED_TOKEN_ID);

        // Additional param validation (duration already checked by assert_config CPI).
        assert(config.start_block >= block.height);
        assert(config.floor_price > 0u128);
        assert(config.start_price > config.floor_price);
        assert(config.price_decay_blocks > 0u32);
        assert(config.price_decay_amount > 0u128);
        assert(config.min_bid_amount > 0u128);
        assert(config.max_bid_amount == 0u128 || config.max_bid_amount >= config.min_bid_amount);

        // D11: nonce must equal the current per-creator counter.
        assert_eq(nonce, creator_nonces.get_or_use(creator, 0u64));

        // Re-derive auction_id in finalize and verify it matches transition body's value.
        let expected_id: field = BHP256::hash_to_field(AuctionKey {
            creator:      creator,
            nonce:        nonce,
            program_salt: PROGRAM_SALT,
        });
        assert_eq(auction_id, expected_id);
        assert_eq(config.auction_id, auction_id);

        // Verify fairdrop_dutch.aleo has SUPPLY_MANAGER_ROLE on the sale token.
        let dutch_role_key: field = BHP256::hash_to_field(TokenOwner {
            account:  fairdrop_dutch.aleo,
            token_id: config.sale_token_id,
        });
        assert_eq(
            token_registry.aleo/roles.get_or_use(dutch_role_key, 0u8),
            SUPPLY_MANAGER_ROLE
        );

        // If vest_enabled: validate duration and check fairdrop_vest.aleo has role.
        // Boolean trick avoids conditional assertion (Leo finalize has no branching asserts).
        let vest_duration_ok: bool =
            !config.vest_enabled || config.vest_end_blocks > config.vest_cliff_blocks;
        assert(vest_duration_ok);

        let vest_role_key: field = BHP256::hash_to_field(TokenOwner {
            account:  fairdrop_vest.aleo,
            token_id: config.sale_token_id,
        });
        let vest_role_ok: bool =
            !config.vest_enabled ||
            token_registry.aleo/roles.get_or_use(vest_role_key, 0u8) == SUPPLY_MANAGER_ROLE;
        assert(vest_role_ok);

        // Write immutable config (built in transition body, validated above).
        auction_configs.set(auction_id, config);

        // Write zero-value initial state.
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

        // Set burn-backed mint budget.
        escrow_sales.set(auction_id, config.supply);

        // Register in global sequential index.
        let s: Stats = stats.get_or_use(0field, Stats {
            total_auctions: 0u64, total_bids: 0u64, total_payment_collected: 0u128
        });
        auction_index.set(s.total_auctions, auction_id);

        // Update per-creator linked list.
        let count: u64 = creator_auction_count.get_or_use(creator, 0u64);
        creator_auction_count.set(creator, count + 1u64);
        let prev: field = creator_latest_auction.get_or_use(creator, 0field);
        auction_prev_by_creator.set(auction_id, prev);
        creator_latest_auction.set(creator, auction_id);

        // Advance per-creator nonce.
        creator_nonces.set(creator, nonce + 1u64);

        // Credit creation_fee to protocol treasury.
        let treasury: u128 = protocol_treasury.get_or_use(0field, 0u128);
        protocol_treasury.set(0field, treasury + creation_fee);

        stats.set(0field, Stats {
            total_auctions:          s.total_auctions + 1u64,
            total_bids:              s.total_bids,
            total_payment_collected: s.total_payment_collected,
        });
    }

    // =========================================================================
    // 2. place_bid_private — private credits UTXO
    // =========================================================================
    //
    // Consumes a private credits record; deposits payment_amount to this program's
    // public credits balance; returns change record. Bidder's UTXO source is hidden.
    //
    // CPIs: transfer_private_to_public, check_admission, issue_receipt.
    // check_admission ALWAYS called — gate contract handles GATE_OPEN internally
    //   (no conditional CPI in auction contracts needed).

    async transition place_bid_private(
        payment:               credits.aleo/credits,
        public auction_id:     field,
        public quantity:       u128,
        public payment_amount: u64,
    ) -> (credits.aleo/credits, Bid, fairdrop_proof.aleo/ParticipationReceipt, Future) {
        assert(quantity > 0u128);
        assert(payment_amount > 0u64);

        // Pre-compute pseudonymous bidder key in transition body (self.signer is private here).
        let bidder_key: field = BHP256::hash_to_field(BidderKey {
            bidder:     self.signer,
            auction_id: auction_id,
        });

        let (change, f_credits): (credits.aleo/credits, Future) =
            credits.aleo/transfer_private_to_public(payment, self.address, payment_amount);

        let f_gate: Future = fairdrop_gate.aleo/check_admission(auction_id);

        let (receipt, f_proof): (fairdrop_proof.aleo/ParticipationReceipt, Future) =
            fairdrop_proof.aleo/issue_receipt(auction_id, 0field, bidder_key);

        let bid: Bid = Bid {
            owner:          self.signer,
            auction_id:     auction_id,
            quantity:       quantity,
            payment_amount: payment_amount as u128,
        };

        return (change, bid, receipt, finalize_place_bid_private(
            f_credits,
            f_gate,
            f_proof,
            auction_id,
            bidder_key,
            quantity,
            payment_amount as u128,
        ));
    }

    async function finalize_place_bid_private(
        f_credits:      Future,
        f_gate:         Future,
        f_proof:        Future,
        auction_id:     field,
        bid_total_key:  field,
        quantity:       u128,
        payment_amount: u128,
    ) {
        assert(!fairdrop_config.aleo/paused.get_or_use(0field, false));
        f_credits.await();
        f_gate.await();
        f_proof.await();
        // ── shared bid validation and state updates ──────────────────────────
        let config: AuctionConfig = auction_configs.get(auction_id);
        let state:  AuctionState  = auction_states.get(auction_id);
        assert(!state.supply_met);
        assert(!state.cleared);
        assert(!state.voided);
        assert(block.height >= config.start_block);
        assert(block.height <  config.end_block);
        let blocks_elapsed: u32 = block.height - config.start_block;
        let decay_steps: u128   = (blocks_elapsed / config.price_decay_blocks) as u128;
        let total_decay: u128   = decay_steps * config.price_decay_amount;
        let price_range: u128   = config.start_price - config.floor_price;
        let current_price: u128 = total_decay < price_range
            ? config.start_price - total_decay : config.floor_price;
        assert(payment_amount * config.sale_scale >= quantity * current_price);
        assert(quantity >= config.min_bid_amount);
        let new_committed: u128 = state.total_committed + quantity;
        assert(new_committed <= config.supply);
        let current_total: u128   = bid_totals.get_or_use(bid_total_key, 0u128);
        let new_bidder_total: u128 = current_total + quantity;
        let within_limit: bool = config.max_bid_amount == 0u128
            || new_bidder_total <= config.max_bid_amount;
        assert(within_limit);
        bid_totals.set(bid_total_key, new_bidder_total);
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
    // 3. place_bid_public — public credits balance
    // =========================================================================
    //
    // Deducts payment_amount from self.signer's public credits.aleo balance.
    // transfer_public_as_signer pulls from the original tx signer — no pre-approval.

    async transition place_bid_public(
        public auction_id:     field,
        public quantity:       u128,
        public payment_amount: u64,
    ) -> (Bid, fairdrop_proof.aleo/ParticipationReceipt, Future) {
        assert(quantity > 0u128);
        assert(payment_amount > 0u64);

        let bidder_key: field = BHP256::hash_to_field(BidderKey {
            bidder:     self.signer,
            auction_id: auction_id,
        });

        let f_credits: Future =
            credits.aleo/transfer_public_as_signer(self.address, payment_amount);

        let f_gate: Future = fairdrop_gate.aleo/check_admission(auction_id);

        let (receipt, f_proof): (fairdrop_proof.aleo/ParticipationReceipt, Future) =
            fairdrop_proof.aleo/issue_receipt(auction_id, 0field, bidder_key);

        let bid: Bid = Bid {
            owner:          self.signer,
            auction_id:     auction_id,
            quantity:       quantity,
            payment_amount: payment_amount as u128,
        };

        return (bid, receipt, finalize_place_bid_public(
            f_credits,
            f_gate,
            f_proof,
            auction_id,
            bidder_key,
            quantity,
            payment_amount as u128,
        ));
    }

    async function finalize_place_bid_public(
        f_credits:      Future,
        f_gate:         Future,
        f_proof:        Future,
        auction_id:     field,
        bid_total_key:  field,
        quantity:       u128,
        payment_amount: u128,
    ) {
        assert(!fairdrop_config.aleo/paused.get_or_use(0field, false));
        f_credits.await();
        f_gate.await();
        f_proof.await();
        // ── shared bid validation and state updates ──────────────────────────
        let config: AuctionConfig = auction_configs.get(auction_id);
        let state:  AuctionState  = auction_states.get(auction_id);
        assert(!state.supply_met);
        assert(!state.cleared);
        assert(!state.voided);
        assert(block.height >= config.start_block);
        assert(block.height <  config.end_block);
        let blocks_elapsed: u32 = block.height - config.start_block;
        let decay_steps: u128   = (blocks_elapsed / config.price_decay_blocks) as u128;
        let total_decay: u128   = decay_steps * config.price_decay_amount;
        let price_range: u128   = config.start_price - config.floor_price;
        let current_price: u128 = total_decay < price_range
            ? config.start_price - total_decay : config.floor_price;
        assert(payment_amount * config.sale_scale >= quantity * current_price);
        assert(quantity >= config.min_bid_amount);
        let new_committed: u128 = state.total_committed + quantity;
        assert(new_committed <= config.supply);
        let current_total: u128    = bid_totals.get_or_use(bid_total_key, 0u128);
        let new_bidder_total: u128 = current_total + quantity;
        let within_limit: bool = config.max_bid_amount == 0u128
            || new_bidder_total <= config.max_bid_amount;
        assert(within_limit);
        bid_totals.set(bid_total_key, new_bidder_total);
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
    // 4. place_bid_private_ref — private credits + referral attribution
    // =========================================================================
    //
    // Same as place_bid_private, plus record_referral CPI to fairdrop_ref.aleo.
    // Separate transition required — Leo cannot conditionally await a CPI Future.
    // Bidder chooses this variant only if they have a referral code to apply.

    async transition place_bid_private_ref(
        payment:               credits.aleo/credits,
        public auction_id:     field,
        public quantity:       u128,
        public payment_amount: u64,
        public code_id:        field,   // referral code from referrer
    ) -> (credits.aleo/credits, Bid, fairdrop_proof.aleo/ParticipationReceipt, Future) {
        assert(quantity > 0u128);
        assert(payment_amount > 0u64);

        let bidder_key: field = BHP256::hash_to_field(BidderKey {
            bidder:     self.signer,
            auction_id: auction_id,
        });

        let (change, f_credits): (credits.aleo/credits, Future) =
            credits.aleo/transfer_private_to_public(payment, self.address, payment_amount);

        let f_gate: Future = fairdrop_gate.aleo/check_admission(auction_id);

        let (receipt, f_proof): (fairdrop_proof.aleo/ParticipationReceipt, Future) =
            fairdrop_proof.aleo/issue_receipt(auction_id, 0field, bidder_key);

        // Attribute this bid to the referral code. payment_amount stored in ref for 
        // commission calculation (bid-time payment — see fairdrop_ref.aleo header).
        let f_ref: Future = fairdrop_ref.aleo/record_referral(
            code_id,
            auction_id,
            bidder_key,
            payment_amount as u128,
        );

        let bid: Bid = Bid {
            owner:          self.signer,
            auction_id:     auction_id,
            quantity:       quantity,
            payment_amount: payment_amount as u128,
        };

        return (change, bid, receipt, finalize_place_bid_priv_ref(
            f_credits,
            f_gate,
            f_proof,
            f_ref,
            auction_id,
            bidder_key,
            quantity,
            payment_amount as u128,
        ));
    }

    async function finalize_place_bid_priv_ref(
        f_credits:      Future,
        f_gate:         Future,
        f_proof:        Future,
        f_ref:          Future,
        auction_id:     field,
        bid_total_key:  field,
        quantity:       u128,
        payment_amount: u128,
    ) {
        assert(!fairdrop_config.aleo/paused.get_or_use(0field, false));
        f_credits.await();
        f_gate.await();
        f_proof.await();
        f_ref.await();
        // ── shared bid validation and state updates ──────────────────────────
        let config: AuctionConfig = auction_configs.get(auction_id);
        let state:  AuctionState  = auction_states.get(auction_id);
        assert(!state.supply_met);
        assert(!state.cleared);
        assert(!state.voided);
        assert(block.height >= config.start_block);
        assert(block.height <  config.end_block);
        let blocks_elapsed: u32 = block.height - config.start_block;
        let decay_steps: u128   = (blocks_elapsed / config.price_decay_blocks) as u128;
        let total_decay: u128   = decay_steps * config.price_decay_amount;
        let price_range: u128   = config.start_price - config.floor_price;
        let current_price: u128 = total_decay < price_range
            ? config.start_price - total_decay : config.floor_price;
        assert(payment_amount * config.sale_scale >= quantity * current_price);
        assert(quantity >= config.min_bid_amount);
        let new_committed: u128 = state.total_committed + quantity;
        assert(new_committed <= config.supply);
        let current_total: u128    = bid_totals.get_or_use(bid_total_key, 0u128);
        let new_bidder_total: u128 = current_total + quantity;
        let within_limit: bool = config.max_bid_amount == 0u128
            || new_bidder_total <= config.max_bid_amount;
        assert(within_limit);
        bid_totals.set(bid_total_key, new_bidder_total);
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
    // 5. place_bid_public_ref — public credits + referral attribution
    // =========================================================================

    async transition place_bid_public_ref(
        public auction_id:     field,
        public quantity:       u128,
        public payment_amount: u64,
        public code_id:        field,
    ) -> (Bid, fairdrop_proof.aleo/ParticipationReceipt, Future) {
        assert(quantity > 0u128);
        assert(payment_amount > 0u64);

        let bidder_key: field = BHP256::hash_to_field(BidderKey {
            bidder:     self.signer,
            auction_id: auction_id,
        });

        let f_credits: Future =
            credits.aleo/transfer_public_as_signer(self.address, payment_amount);

        let f_gate: Future = fairdrop_gate.aleo/check_admission(auction_id);

        let (receipt, f_proof): (fairdrop_proof.aleo/ParticipationReceipt, Future) =
            fairdrop_proof.aleo/issue_receipt(auction_id, 0field, bidder_key);

        let f_ref: Future = fairdrop_ref.aleo/record_referral(
            code_id,
            auction_id,
            bidder_key,
            payment_amount as u128,
        );

        let bid: Bid = Bid {
            owner:          self.signer,
            auction_id:     auction_id,
            quantity:       quantity,
            payment_amount: payment_amount as u128,
        };

        return (bid, receipt, finalize_place_bid_pub_ref(
            f_credits,
            f_gate,
            f_proof,
            f_ref,
            auction_id,
            bidder_key,
            quantity,
            payment_amount as u128,
        ));
    }

    async function finalize_place_bid_pub_ref(
        f_credits:      Future,
        f_gate:         Future,
        f_proof:        Future,
        f_ref:          Future,
        auction_id:     field,
        bid_total_key:  field,
        quantity:       u128,
        payment_amount: u128,
    ) {
        assert(!fairdrop_config.aleo/paused.get_or_use(0field, false));
        f_credits.await();
        f_gate.await();
        f_proof.await();
        f_ref.await();
        // ── shared bid validation and state updates ──────────────────────────
        let config: AuctionConfig = auction_configs.get(auction_id);
        let state:  AuctionState  = auction_states.get(auction_id);
        assert(!state.supply_met);
        assert(!state.cleared);
        assert(!state.voided);
        assert(block.height >= config.start_block);
        assert(block.height <  config.end_block);
        let blocks_elapsed: u32 = block.height - config.start_block;
        let decay_steps: u128   = (blocks_elapsed / config.price_decay_blocks) as u128;
        let total_decay: u128   = decay_steps * config.price_decay_amount;
        let price_range: u128   = config.start_price - config.floor_price;
        let current_price: u128 = total_decay < price_range
            ? config.start_price - total_decay : config.floor_price;
        assert(payment_amount * config.sale_scale >= quantity * current_price);
        assert(quantity >= config.min_bid_amount);
        let new_committed: u128 = state.total_committed + quantity;
        assert(new_committed <= config.supply);
        let current_total: u128    = bid_totals.get_or_use(bid_total_key, 0u128);
        let new_bidder_total: u128 = current_total + quantity;
        let within_limit: bool = config.max_bid_amount == 0u128
            || new_bidder_total <= config.max_bid_amount;
        assert(within_limit);
        bid_totals.set(bid_total_key, new_bidder_total);
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
    // 6. close_auction — permissionless
    // =========================================================================
    //
    // Anyone may call once auction ends (supply_met OR block.height >= end_block).
    // Caller receives closer_reward from protocol_treasury.
    //
    // D11 params (caller reads from chain, finalize validates):
    //   creator:       config.creator          — needed for update_reputation CPI
    //   filled:        state.supply_met         — needed for update_reputation CPI
    //   volume:        state.total_payments     — needed for update_reputation CPI
    //   closer_reward: config.closer_reward     — needed for credits.transfer_public CPI
    //
    // Revenue accounting (fee on clearing-price revenue, not total_payments):
    //   total_cost      = total_committed * clearing_price / sale_scale
    //   protocol_fee    = total_cost * fee_bps / 10000
    //   creator_revenue = total_cost - protocol_fee
    //   referral_budget = protocol_fee * REFERRAL_SHARE_BPS / 10000
    //   treasury_credit = protocol_fee - referral_budget - closer_reward
    //     (safe: treasury >= closer_reward asserted; referral_budget <= protocol_fee always)
    //
    // referral_budget is stored in AuctionState for later push_referral_budget call.
    // ended_at_block: set to config.end_block when supply was not met (for vesting base).

    async transition close_auction(
        public auction_id:    field,
        public creator:       address,  // D11: config.creator
        public filled:        bool,     // D11: state.supply_met
        public volume:        u128,     // D11: state.total_payments
        public closer_reward: u128,     // D11: config.closer_reward
    ) -> Future {
        // Pay closer reward from this program's public credits balance.
        let f_closer: Future =
            credits.aleo/transfer_public(self.signer, closer_reward as u64);

        // Update creator's on-chain reputation.
        let f_proof: Future =
            fairdrop_proof.aleo/update_reputation(creator, filled, volume);

        return finalize_close_auction(
            f_closer,
            f_proof,
            auction_id,
            creator,
            filled,
            volume,
            closer_reward,
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
        assert(!fairdrop_config.aleo/paused.get_or_use(0field, false));
        f_closer.await();
        f_proof.await();

        let config: AuctionConfig = auction_configs.get(auction_id);
        let state:  AuctionState  = auction_states.get(auction_id);

        assert(!state.cleared);
        assert(!state.voided);
        assert(state.supply_met || block.height >= config.end_block);

        // D11 validations.
        assert_eq(creator,       config.creator);
        assert_eq(filled,        state.supply_met);
        assert_eq(volume,        state.total_payments);
        assert_eq(closer_reward, config.closer_reward);

        // Protocol treasury must have enough to cover closer reward.
        let treasury: u128 = protocol_treasury.get_or_use(0field, 0u128);
        assert(treasury >= closer_reward);

        // Compute clearing price.
        // ended_at_block: use stored block when supply was met mid-auction;
        // set to config.end_block when supply was not met (uniform vesting base).
        let ended_block: u32    = state.supply_met ? state.ended_at_block : config.end_block;
        let blocks_elapsed: u32 = ended_block - config.start_block;
        let decay_steps: u128   = (blocks_elapsed / config.price_decay_blocks) as u128;
        let total_decay: u128   = decay_steps * config.price_decay_amount;
        let price_range: u128   = config.start_price - config.floor_price;
        let clearing_price: u128 = total_decay < price_range
            ? config.start_price - total_decay : config.floor_price;

        // Revenue accounting.
        let total_cost: u128      = state.total_committed * clearing_price / config.sale_scale;
        let protocol_fee: u128    = total_cost * (config.fee_bps as u128) / 10000u128;
        let creator_revenue: u128 = total_cost - protocol_fee;
        let referral_budget: u128 = protocol_fee * (REFERRAL_SHARE_BPS as u128) / 10000u128;

        // Update treasury: credit net protocol fee, debit closer reward.
        // net_fee = protocol_fee - referral_budget (>= 0, referral share <= 100%)
        // treasury + net_fee >= treasury >= closer_reward (asserted above) → safe.
        let net_fee: u128     = protocol_fee - referral_budget;
        let new_treasury: u128 = treasury + net_fee - closer_reward;
        protocol_treasury.set(0field, new_treasury);

        // Write cleared state. referral_budget stored for push_referral_budget.
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
    // 7. push_referral_budget — permissionless; call after close_auction
    // =========================================================================
    //
    // Transfers the referral_budget credits to fairdrop_ref.aleo and calls
    // fund_reserve to enable credit_commission for this auction's bidders.
    //
    // Separate from close_auction because:
    //   1. Leo cannot conditionally await a CPI Future (conditional CPI is illegal).
    //   2. Not all auctions have referral codes — pushing 0 credits would fail.
    //
    // Double-push protection: fairdrop_ref.aleo/fund_reserve has a reserve_funded
    // guard (one call per auction_id). AuctionState.referral_budget is zeroed after
    // push, so the D11 check also prevents any retry.
    //
    // Edge case: if referral_budget = 0 (tiny auction, zero fee, or truncation),
    // push_referral_budget cannot be called (assert budget > 0 fails).
    // Referrers for that auction receive zero commission. Acceptable — no fund to distribute
    // No paused check — referral settlement is not a risk vector during emergency pause.

    async transition push_referral_budget(
        public auction_id: field,
        public budget:     u128,   // D11: state.referral_budget
    ) -> Future {
        // Send actual credits to fairdrop_ref.aleo's public balance.
        let f_credits: Future =
            credits.aleo/transfer_public(fairdrop_ref.aleo, budget as u64);

        // Record reserve amount in fairdrop_ref; marks reserve_funded = true.
        let f_ref: Future = fairdrop_ref.aleo/fund_reserve(auction_id, budget);
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
        // D11: budget must match what was stored at close.
        assert_eq(budget, state.referral_budget);

        // Zero out referral_budget — consumed. fund_reserve guard prevents double-push,
        // but zeroing makes the D11 check independently block any retry.
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
    // 8. claim — redeem Bid record (non-vesting auctions)
    // =========================================================================
    //
    // Returns:
    //   token_registry.aleo/Token  — sale tokens minted privately to bidder.
    //   credits.aleo/credits       — overpayment refund (payment_amount - cost).
    //
    // bid.owner is a private field — never reaches any finalize function.
    // Both token recipient and refund recipient are hidden on-chain.
    //
    // Blocked when vest_enabled = true; use claim_vested instead.
    // D11 clearing_price, sale_token_id, sale_scale validated in finalize.

    async transition claim(
        bid:                   Bid,
        public clearing_price: u128,
        public sale_token_id:  field,
        public sale_scale:     u128,
    ) -> (token_registry.aleo/Token, credits.aleo/credits, Future) {
        let sale_amount: u128       = bid.quantity;
        let cost: u128              = bid.quantity * clearing_price / sale_scale;
        let refund_amount: u64      = (bid.payment_amount - cost) as u64;

        // bid.owner is private — recipient of both outputs is hidden.
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
            f_mint,
            f_refund,
            bid.auction_id,
            clearing_price,
            sale_token_id,
            sale_scale,
            sale_amount,
            refund_amount as u128,
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
        assert(!fairdrop_config.aleo/paused.get_or_use(0field, false));
        f_mint.await();
        f_refund.await();

        let config: AuctionConfig = auction_configs.get(auction_id);
        let state:  AuctionState  = auction_states.get(auction_id);

        assert(state.cleared);
        assert(!state.voided);
        // Enforce vesting intent — vest_enabled auctions must use claim_vested.
        assert(!config.vest_enabled);
        assert_eq(clearing_price, state.clearing_price);
        assert_eq(sale_token_id,  config.sale_token_id);
        assert_eq(sale_scale,     config.sale_scale);

        // Deduct from mint budget.
        let sale_remaining: u128 = escrow_sales.get(auction_id);
        assert(sale_amount <= sale_remaining);
        escrow_sales.set(auction_id, sale_remaining - sale_amount);

        // Deduct refund from payment escrow.
        let payment_remaining: u128 = escrow_payments.get(auction_id);
        assert(refund_amount <= payment_remaining);
        escrow_payments.set(auction_id, payment_remaining - refund_amount);
    }

    // =========================================================================
    // 9. claim_vested — redeem Bid record (vest_enabled auctions)
    // =========================================================================
    //
    // Issues a VestedAllocation record instead of an immediate Token.
    // fairdrop_vest.aleo mints tokens at release time using its own SUPPLY_MANAGER_ROLE.
    // This program only issues the vesting schedule and deducts from escrow_sales.
    //
    // D11 params: ended_at_block, cliff_blocks, vest_end_blocks validated in finalize.
    // bid.owner is private — passed as private param to create_vest; never finalized.
    // Blocked when vest_enabled = false; use claim instead.

    async transition claim_vested(
        bid:                    Bid,
        public clearing_price:  u128,
        public sale_token_id:   field,
        public sale_scale:      u128,
        public ended_at_block:  u32,    // D11: state.ended_at_block
        public cliff_blocks:    u32,    // D11: config.vest_cliff_blocks
        public vest_end_blocks: u32,    // D11: config.vest_end_blocks
    ) -> (fairdrop_vest.aleo/VestedAllocation, credits.aleo/credits, Future) {
        let sale_amount: u128  = bid.quantity;
        let cost: u128         = bid.quantity * clearing_price / sale_scale;
        let refund_amount: u64 = (bid.payment_amount - cost) as u64;

        // bid.owner is private (from Bid record) — never reaches create_vest finalize.
        let (vest, f_vest): (fairdrop_vest.aleo/VestedAllocation, Future) =
            fairdrop_vest.aleo/create_vest(
                bid.auction_id,
                bid.owner,
                sale_token_id,
                sale_amount,
                ended_at_block,
                cliff_blocks,
                vest_end_blocks,
            );

        // Overpayment refund delivered privately.
        let (refund, f_refund): (credits.aleo/credits, Future) =
            credits.aleo/transfer_public_to_private(bid.owner, refund_amount);

        return (vest, refund, finalize_claim_vested(
            f_vest,
            f_refund,
            bid.auction_id,
            clearing_price,
            sale_token_id,
            sale_scale,
            sale_amount,
            refund_amount as u128,
            ended_at_block,
            cliff_blocks,
            vest_end_blocks,
        ));
    }

    async function finalize_claim_vested(
        f_vest:         Future,
        f_refund:       Future,
        auction_id:     field,
        clearing_price: u128,
        sale_token_id:  field,
        sale_scale:     u128,
        sale_amount:    u128,
        refund_amount:  u128,
        ended_at_block: u32,
        cliff_blocks:   u32,
        vest_end_blocks: u32,
    ) {
        assert(!fairdrop_config.aleo/paused.get_or_use(0field, false));
        f_vest.await();
        f_refund.await();

        let config: AuctionConfig = auction_configs.get(auction_id);
        let state:  AuctionState  = auction_states.get(auction_id);

        assert(state.cleared);
        assert(!state.voided);
        // Only vest_enabled auctions may use this path.
        assert(config.vest_enabled);
        assert_eq(clearing_price, state.clearing_price);
        assert_eq(sale_token_id,  config.sale_token_id);
        assert_eq(sale_scale,     config.sale_scale);

        // D11: validate vest params against stored config/state.
        assert_eq(ended_at_block,  state.ended_at_block);
        assert_eq(cliff_blocks,    config.vest_cliff_blocks);
        assert_eq(vest_end_blocks, config.vest_end_blocks);

        // Deduct from mint budget.
        let sale_remaining: u128 = escrow_sales.get(auction_id);
        assert(sale_amount <= sale_remaining);
        escrow_sales.set(auction_id, sale_remaining - sale_amount);

        // Deduct refund from payment escrow.
        let payment_remaining: u128 = escrow_payments.get(auction_id);
        assert(refund_amount <= payment_remaining);
        escrow_payments.set(auction_id, payment_remaining - refund_amount);
    }

    // =========================================================================
    // 10. withdraw_payments — creator withdraws clearing-price revenue
    // =========================================================================
    //
    // Capped at state.creator_revenue (total_cost - protocol_fee).
    // Cannot exceed remaining escrow_payments — prevents solvency issues.
    // Callable multiple times (partial withdrawals ok).

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
        assert(!fairdrop_config.aleo/paused.get_or_use(0field, false));
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
    // 11. withdraw_unsold — creator mints back unsold supply after close
    // =========================================================================
    //
    // Available only when total_committed < supply.
    // Mints up to (supply - total_committed) tokens to the creator.

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
            f_mint,
            auction_id,
            self.signer,
            amount,
            sale_token_id,
        ));
    }

    async function finalize_withdraw_unsold(
        f_mint:       Future,
        auction_id:   field,
        caller:       address,
        amount:       u128,
        sale_token_id: field,
    ) {
        assert(!fairdrop_config.aleo/paused.get_or_use(0field, false));
        f_mint.await();

        let config: AuctionConfig = auction_configs.get(auction_id);
        let state:  AuctionState  = auction_states.get(auction_id);

        assert(state.cleared);
        assert(!state.voided);
        assert_eq(caller,       config.creator);
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
    // 12. cancel_auction — creator escape hatch
    // =========================================================================
    //
    // Creator cancels any non-cleared, non-voided auction at any time.
    // The full supply is minted back to the creator from the escrow_sales budget.
    // If bids exist, those credits remain in escrow_payments and bidders recover
    // them via claim_voided. Creation_fee is NOT refunded (anti-spam).
    //
    // D11 supply: needed for mint_private CPI in transition body; validated in finalize.

    async transition cancel_auction(
        public auction_id:    field,
        public sale_token_id: field,
        public supply:        u128,   // D11: config.supply
    ) -> (token_registry.aleo/Token, Future) {
        // Mint full supply back to creator.
        let (token, f_mint): (token_registry.aleo/Token, Future) =
            token_registry.aleo/mint_private(
                sale_token_id,
                self.signer,
                supply,
                false,
                4294967295u32,
            );

        return (token, finalize_cancel_auction(
            f_mint,
            self.signer,
            auction_id,
            sale_token_id,
            supply,
        ));
    }

    async function finalize_cancel_auction(
        f_mint:        Future,
        creator:       address,
        auction_id:    field,
        sale_token_id: field,
        supply:        u128,
    ) {
        assert(!fairdrop_config.aleo/paused.get_or_use(0field, false));
        f_mint.await();

        let config: AuctionConfig = auction_configs.get(auction_id);
        let state:  AuctionState  = auction_states.get(auction_id);

        assert_eq(creator,       config.creator);
        assert(!state.cleared);
        assert(!state.voided);
        assert_eq(sale_token_id, config.sale_token_id);

        // D11: supply must match config (prevents creator from minting more than deposited).
        assert_eq(supply, config.supply);

        // Consume the full mint budget (supply is minted back; no further minting allowed).
        let remaining: u128 = escrow_sales.get(auction_id);
        assert(supply <= remaining);
        escrow_sales.set(auction_id, remaining - supply);

        // Mark voided; bidders may now call claim_voided to recover payments.
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
    // 13. claim_voided — bidder recovers payment from a voided auction
    // =========================================================================
    //
    // Consumes the Bid record (single-spend) and returns payment_amount privately.
    // No paused check — emergency pause must not trap bidder capital.
    // bid.owner is private — refund recipient is hidden on-chain.

    async transition claim_voided(
        bid: Bid,
    ) -> (credits.aleo/credits, Future) {
        // bid.owner is private — recipient is hidden.
        let (refund, f_refund): (credits.aleo/credits, Future) =
            credits.aleo/transfer_public_to_private(bid.owner, bid.payment_amount as u64);

        return (refund, finalize_claim_voided(
            f_refund,
            bid.auction_id,
            bid.payment_amount,
        ));
    }

    async function finalize_claim_voided(
        f_refund:       Future,
        auction_id:     field,
        payment_amount: u128,
    ) {
        // No paused check — voided claims are a recovery path that must always work.
        f_refund.await();

        let state: AuctionState = auction_states.get(auction_id);
        assert(state.voided);

        let remaining: u128 = escrow_payments.get_or_use(auction_id, 0u128);
        assert(payment_amount <= remaining);
        escrow_payments.set(auction_id, remaining - payment_amount);
    }
}
