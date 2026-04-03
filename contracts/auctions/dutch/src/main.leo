// fairdrop_dutch_v1.aleo — Privacy-preserving descending-price Dutch auction.
// Leo 4.0 migration: fn/Final/final/:: — no behavioural changes.
//
// Mechanism: price descends from start_price toward floor_price in discrete steps.
// All winners pay the same clearing price set at close_auction.
//
// Payment token : credits.aleo — private record OR public balance.
// Sale tokens   : token_registry.aleo::Token. Burned at create (freeing max_supply),
//                 re-minted at claim/claim_vested. Net supply change = 0.
//
// Roles required:
//   fairdrop_dutch_v1.aleo — SUPPLY_MANAGER_ROLE on sale token (burn + mint).
//   fairdrop_vest_v1.aleo  — SUPPLY_MANAGER_ROLE on sale token (mint at release),
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
//
// Auction ID derivation:
//   auction_id = BHP256(AuctionKey { creator, nonce, PROGRAM_SALT = 1field })
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
//
// ── Leo 4.0 migration notes ───────────────────────────────────────────────────
//   async transition  → fn  (inside program {})
//   async function finalize_* → deleted; body inlined as final {} block
//   async constructor → constructor
//   Future → Final, f.await() → f.run(), .aleo/ → .aleo::
//   structs moved outside program {} (convention; records stay inside)
//   fn bid_setup: module-level proof-context helper (returns field, not Bid record)
//   final fn record_bid: module-level finalize-context helper (inlined by compiler)
//   self.signer captured before final {} in: withdraw_payments, withdraw_unsold,
//     cancel_auction (self.* is proof-context only; not accessible inside final {})
//   bid record fields captured before final {} in: claim, claim_vested, claim_voided
// ─────────────────────────────────────────────────────────────────────────────

import credits.aleo;
import token_registry.aleo;
import fairdrop_config_v1.aleo;
import fairdrop_gate_v1.aleo;
import fairdrop_proof_v1.aleo;
import fairdrop_ref_v1.aleo;
import fairdrop_vest_v1.aleo;

// ═════════════════════════════════════════════════════════════════════════════
// Module-level struct definitions
// Leo 4.0: structs that are not records move outside program {} (convention).
// Records stay inside program {} as part of the public on-chain interface.
// ═════════════════════════════════════════════════════════════════════════════

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
    referral_pool_bps:  u16,      // D16: snapshotted from fairdrop_config at create
    metadata_hash:      field,    // BHP256 of off-chain metadata JSON (IPFS). 0field = no metadata.
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
// Validated by assert_config CPI; fee_bps, closer_reward, and referral_pool_bps
// are stored in AuctionConfig for use at close_auction.
struct ConfigSnapshot {
    fee_bps:            u16,
    creation_fee:       u128,
    closer_reward:      u128,
    slash_reward_bps:   u16,
    referral_pool_bps:  u16,
}

// =============================================================================
// Module-level proof-context helper: bid_setup
//
// Leo 4.0: module-level fn runs in the proof context and is inlined by the
// compiler into every call site. Cannot return records — only entry-point fn
// inside program {} can have records as inputs/outputs. Returns bidder_key
// (field) only; Bid record construction is repeated in each entry point.
//
// Parameters:
//   owner          — pass self.signer from the entry point (program-scoped)
//   auction_id     — forwarded unchanged
//   quantity       — asserted > 0
//   payment_amount — asserted > 0
// =============================================================================
fn bid_setup(
    owner:          address,
    auction_id:     field,
    quantity:       u128,
    payment_amount: u64,
) -> field {
    // Transition-body assertions: fail fast before any CPI executes.
    assert(quantity > 0u128);
    assert(payment_amount > 0u64);

    // Pseudonymous bidder key — raw address never reaches any mapping.
    return BHP256::hash_to_field(BidderKey {
        bidder:     owner,
        auction_id: auction_id,
    });
}

// =============================================================================
// Module-level finalize-context helper: record_bid
//
// Leo 4.0: final fn is inlined by the compiler into each caller's final {}
// block before that block is lifted into a standalone on-chain finalization.
// All 4 place_bid_* variants share identical Dutch price validation and state
// writes — extracted here to avoid ~40 lines × 4 duplication.
//
// Dutch price formula:
//   blocks_elapsed = block.height - config.start_block
//   decay_steps    = blocks_elapsed / config.price_decay_blocks
//   total_decay    = decay_steps * config.price_decay_amount
//   price_range    = config.start_price - config.floor_price
//   current_price  = total_decay < price_range
//                    ? config.start_price - total_decay : config.floor_price
//
// State effects:
//   bid_totals[bidder_key]   — per-bidder quantity (enforces max_bid_amount).
//   auction_states[id]       — total_committed, total_payments, supply_met.
//   escrow_payments[id]      — credits locked.
//   stats[0field]            — bid count and total volume.
// =============================================================================
final fn record_bid(
    auction_id:     field,
    bidder_key:     field,   // BHP256(BidderKey{bidder, auction_id})
    quantity:       u128,
    payment_amount: u128,
) {
    let config: AuctionConfig = auction_configs.get(auction_id);
    let state:  AuctionState  = auction_states.get(auction_id);

    // Lifecycle guards.
    assert(!state.supply_met);
    assert(!state.cleared);
    assert(!state.voided);
    assert(block.height >= config.start_block);
    assert(block.height <  config.end_block);

    // Dutch descending price: start_price decays toward floor_price in steps.
    let blocks_elapsed: u32 = block.height - config.start_block;
    let decay_steps: u128   = (blocks_elapsed / config.price_decay_blocks) as u128;
    let total_decay: u128   = decay_steps * config.price_decay_amount;
    let price_range: u128   = config.start_price - config.floor_price;
    let current_price: u128 = total_decay < price_range
        ? config.start_price - total_decay : config.floor_price;

    // Payment sufficiency and quantity floor.
    assert(payment_amount * config.sale_scale >= quantity * current_price);
    assert(quantity >= config.min_bid_amount);

    // Supply cap.
    let new_committed: u128 = state.total_committed + quantity;
    assert(new_committed <= config.supply);

    // Per-bidder cap (0 = unlimited).
    let current_total: u128    = bid_totals.get_or_use(bidder_key, 0u128);
    let new_bidder_total: u128 = current_total + quantity;
    let within_limit: bool = config.max_bid_amount == 0u128
        || new_bidder_total <= config.max_bid_amount;
    assert(within_limit);
    bid_totals.set(bidder_key, new_bidder_total);

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

    // Escrow: credits locked in this program's public credits.aleo balance.
    let escrow: u128 = escrow_payments.get_or_use(auction_id, 0u128);
    escrow_payments.set(auction_id, escrow + payment_amount);

    // Global stats.
    let s: Stats = stats.get_or_use(0field, Stats {
        total_auctions: 0u64, total_bids: 0u64, total_payment_collected: 0u128
    });
    stats.set(0field, Stats {
        total_auctions:          s.total_auctions,
        total_bids:              s.total_bids + 1u64,
        total_payment_collected: s.total_payment_collected + payment_amount,
    });
}

// =============================================================================
// Program interface
// Leo 4.0: program {} contains only entry-point fn, records, and mappings.
// =============================================================================

program fairdrop_dutch_v1.aleo {
    // Leo 4.0: async removed from constructor.
    @admin(address="aleo128wz89c78ur4mx378056yd9q7kqmphr07k0kfsmnwvqnv7g9syyqkg263r")
    constructor() {}

    // =========================================================================
    // Constants
    // =========================================================================

    // ALEO credits registered in token_registry.aleo.
    const CREDITS_RESERVED_TOKEN_ID: field =
        3443843282313283355522573239085696902919850365217539366784739393210722344986field;

    // Required role for burn_private (create) and mint_private (claim/withdraw_unsold).
    const SUPPLY_MANAGER_ROLE: u8 = 3u8;

    // Distinguishes auction_ids from fairdrop_dutch vs other auction programs.
    const PROGRAM_SALT: field = 1field;

    // =========================================================================
    // Records
    // Leo 4.0: records remain inside program {} as part of the on-chain interface.
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
    mapping bid_totals: field => u128;

    // Burn-backed mint budget (= supply at creation; decremented at claim/withdraw_unsold).
    mapping escrow_sales: field => u128;

    // Bidder credits locked in this program's public credits.aleo balance.
    mapping escrow_payments: field => u128;

    mapping creator_withdrawn: field => u128;
    mapping unsold_withdrawn:  field => u128;

    mapping stats: field => Stats;

    // Global sequential index: n-th auction created → auction_id.
    mapping auction_index: u64 => field;

    // Per-creator discovery (linked list).
    mapping creator_auction_count:   address => u64;
    mapping creator_latest_auction:  address => field;
    mapping auction_prev_by_creator: field   => field;

    // Per-creator nonce for auction_id derivation.
    mapping creator_nonces: address => u64;

    // Protocol-owned credits (creation_fees + protocol_fees − closer_rewards).
    mapping protocol_treasury: field => u128;

    // =========================================================================
    // 1. create_auction
    // =========================================================================
    //
    // Burns `supply` tokens from creator's private Token record (frees max_supply
    // headroom so mint_private at claim is always guaranteed to succeed).
    // CPIs: burn_private, transfer_public_as_signer, assert_config, register_gate.
    // D11 nonce pattern validated in final block.

    fn create_auction(
        token:                 token_registry.aleo::Token,
        public sale_token_id:  field,
        public supply:         u128,
        public start_block:    u32,
        public end_block:      u32,
        public max_bid_amount: u128,
        public min_bid_amount: u128,
        public sale_scale:     u128,
        public nonce:          u64,     // D11: creator_nonces[creator]
        public metadata_hash:  field,   // BHP256 of off-chain metadata JSON. 0field = none.
        public dutch:          DutchParams,
        public gate:           GateParams,
        public vest:           VestParams,
        public snapshot:       ConfigSnapshot,
    ) -> (token_registry.aleo::Token, Final) {
        assert(supply > 0u128);
        assert_eq(token.token_id, sale_token_id);
        assert_eq(token.amount, supply);  // exact deposit — remainder is always zero-amount dust

        // Compute auction_id in entry point body so CPIs can reference it.
        let auction_id: field = BHP256::hash_to_field(AuctionKey {
            creator:      self.signer,
            nonce:        nonce,
            program_salt: PROGRAM_SALT,
        });

        // CPI 1: burn supply; return zero-amount remainder (harmless dust).
        let (remainder, f_burn): (token_registry.aleo::Token, Final) =
            token_registry.aleo::burn_private(token, supply);

        // CPI 2: deduct creation_fee anti-spam deposit.
        let f_creation: Final =
            credits.aleo::transfer_public_as_signer(self.address, snapshot.creation_fee as u64);

        // CPI 3: validate snapshotted config params and auction duration (D16).
        let f_cfg: Final = fairdrop_config_v1.aleo::assert_config(
            snapshot.fee_bps,
            snapshot.creation_fee,
            snapshot.closer_reward,
            snapshot.slash_reward_bps,
            snapshot.referral_pool_bps,
            start_block,
            end_block,
        );

        // CPI 4: register gate mode for this auction.
        let f_gate: Final = fairdrop_gate_v1.aleo::register_gate(
            auction_id,
            gate.gate_mode,
            gate.merkle_root,
            gate.issuer,
        );

        // Build AuctionConfig in entry point body; pass as one struct to keep
        // the final block lean.
        let config: AuctionConfig = AuctionConfig {
            auction_id:         auction_id,
            creator:            self.signer,
            sale_token_id:      sale_token_id,
            payment_token_id:   CREDITS_RESERVED_TOKEN_ID,
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
            referral_pool_bps:  snapshot.referral_pool_bps,
            metadata_hash:      metadata_hash,
        };

        // Capture proof-context values needed inside final block.
        // self.* is proof-context only and not accessible inside final {}.
        let creator: address   = self.signer;
        let creation_fee: u128 = snapshot.creation_fee;

        return (remainder, final {
            assert(!fairdrop_config_v1.aleo::paused.get_or_use(0field, false));
            f_burn.run();
            f_creation.run();
            f_cfg.run();    // validates params, duration, end_block > start_block
            f_gate.run();

            assert_eq(config.payment_token_id, CREDITS_RESERVED_TOKEN_ID);
            assert(config.sale_token_id != CREDITS_RESERVED_TOKEN_ID);
            assert(config.start_block >= block.height);
            assert(config.floor_price > 0u128);
            assert(config.start_price > config.floor_price);
            assert(config.price_decay_blocks > 0u32);
            assert(config.price_decay_amount > 0u128);
            assert(config.min_bid_amount > 0u128);
            assert(config.max_bid_amount == 0u128 || config.max_bid_amount >= config.min_bid_amount);

            // D11 nonce: must equal current per-creator counter.
            assert_eq(nonce, creator_nonces.get_or_use(creator, 0u64));

            // Re-derive and verify auction_id (defence in depth).
            let expected_id: field = BHP256::hash_to_field(AuctionKey {
                creator:      creator,
                nonce:        nonce,
                program_salt: PROGRAM_SALT,
            });
            assert_eq(auction_id, expected_id);
            assert_eq(config.auction_id, auction_id);

            // Verify SUPPLY_MANAGER_ROLE on sale token.
            let dutch_role_key: field = BHP256::hash_to_field(TokenOwner {
                account:  fairdrop_dutch_v1.aleo,
                token_id: config.sale_token_id,
            });
            assert_eq(
                token_registry.aleo::roles.get_or_use(dutch_role_key, 0u8),
                SUPPLY_MANAGER_ROLE
            );

            // Vesting role check (only required when vest_enabled = true).
            let vest_duration_ok: bool =
                !config.vest_enabled || config.vest_end_blocks > config.vest_cliff_blocks;
            assert(vest_duration_ok);

            let vest_role_key: field = BHP256::hash_to_field(TokenOwner {
                account:  fairdrop_vest_v1.aleo,
                token_id: config.sale_token_id,
            });
            let vest_role_ok: bool =
                !config.vest_enabled ||
                token_registry.aleo::roles.get_or_use(vest_role_key, 0u8) == SUPPLY_MANAGER_ROLE;
            assert(vest_role_ok);

            // Write immutable config and zero-value initial state.
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

            // Advance per-creator nonce (prevents ID reuse on next create).
            creator_nonces.set(creator, nonce + 1u64);

            // Credit creation_fee to protocol treasury.
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
    // 2. place_bid_private — private credits UTXO
    // =========================================================================
    //
    // Consumes a private credits record; deposits payment_amount to this program's
    // public credits balance; returns change record. Bidder's UTXO source is hidden.
    //
    // Leo 4.0: bid_setup handles validation + bidder_key; Bid constructed inline
    // (module-level fn cannot return records). record_bid handles state writes.
    // The unique element here is the private→public credits CPI.

    fn place_bid_private(
        payment:               credits.aleo::credits,
        public auction_id:     field,
        public quantity:       u128,
        public payment_amount: u64,
    ) -> (credits.aleo::credits, Bid, fairdrop_proof_v1.aleo::ParticipationReceipt, Final) {
        // bid_setup: asserts + bidder_key. Bid constructed here (records cannot
        // be returned from module-level fn in Leo 4.0).
        let bidder_key: field =
            bid_setup(self.signer, auction_id, quantity, payment_amount);
        let bid: Bid = Bid {
            owner:          self.signer,
            auction_id:     auction_id,
            quantity:       quantity,
            payment_amount: payment_amount as u128,
        };

        // Unique to private variant: consume private UTXO, return change.
        let (change, f_credits): (credits.aleo::credits, Final) =
            credits.aleo::transfer_private_to_public(payment, self.address, payment_amount);

        let f_gate: Final = fairdrop_gate_v1.aleo::check_admission(auction_id);

        let (receipt, f_proof): (fairdrop_proof_v1.aleo::ParticipationReceipt, Final) =
            fairdrop_proof_v1.aleo::issue_receipt(auction_id, 0field, bidder_key);

        return (change, bid, receipt, final {
            assert(!fairdrop_config_v1.aleo::paused.get_or_use(0field, false));
            f_credits.run();
            f_gate.run();
            f_proof.run();
            // record_bid: Dutch price validation + all state/mapping writes.
            record_bid(auction_id, bidder_key, quantity, payment_amount as u128);
        });
    }

    // =========================================================================
    // 3. place_bid_public — public credits balance
    // =========================================================================
    //
    // Deducts payment_amount from self.signer's public credits.aleo balance.
    // transfer_public_as_signer pulls from the original tx signer — no pre-approval.
    //
    // Leo 4.0: differs from place_bid_private only in the credits CPI
    // (transfer_public_as_signer vs transfer_private_to_public) and return type
    // (no change record). Both helpers are shared.

    fn place_bid_public(
        public auction_id:     field,
        public quantity:       u128,
        public payment_amount: u64,
    ) -> (Bid, fairdrop_proof_v1.aleo::ParticipationReceipt, Final) {
        let bidder_key: field =
            bid_setup(self.signer, auction_id, quantity, payment_amount);
        let bid: Bid = Bid {
            owner:          self.signer,
            auction_id:     auction_id,
            quantity:       quantity,
            payment_amount: payment_amount as u128,
        };

        let f_credits: Final =
            credits.aleo::transfer_public_as_signer(self.address, payment_amount);

        let f_gate: Final = fairdrop_gate_v1.aleo::check_admission(auction_id);

        let (receipt, f_proof): (fairdrop_proof_v1.aleo::ParticipationReceipt, Final) =
            fairdrop_proof_v1.aleo::issue_receipt(auction_id, 0field, bidder_key);

        return (bid, receipt, final {
            assert(!fairdrop_config_v1.aleo::paused.get_or_use(0field, false));
            f_credits.run();
            f_gate.run();
            f_proof.run();
            record_bid(auction_id, bidder_key, quantity, payment_amount as u128);
        });
    }

    // =========================================================================
    // 4. place_bid_private_ref — private credits + referral attribution
    // =========================================================================
    //
    // Same as place_bid_private, plus record_referral CPI to fairdrop_ref_v1.aleo.
    // Separate entry point required — Leo cannot conditionally call a CPI Final.
    //
    // Leo 4.0: only difference from place_bid_private in the final block is
    // the additional f_ref.run() call before record_bid.

    fn place_bid_private_ref(
        payment:               credits.aleo::credits,
        public auction_id:     field,
        public quantity:       u128,
        public payment_amount: u64,
        public code_id:        field,
    ) -> (credits.aleo::credits, Bid, fairdrop_proof_v1.aleo::ParticipationReceipt, Final) {
        let bidder_key: field =
            bid_setup(self.signer, auction_id, quantity, payment_amount);
        let bid: Bid = Bid {
            owner:          self.signer,
            auction_id:     auction_id,
            quantity:       quantity,
            payment_amount: payment_amount as u128,
        };

        let (change, f_credits): (credits.aleo::credits, Final) =
            credits.aleo::transfer_private_to_public(payment, self.address, payment_amount);

        let f_gate: Final = fairdrop_gate_v1.aleo::check_admission(auction_id);

        let (receipt, f_proof): (fairdrop_proof_v1.aleo::ParticipationReceipt, Final) =
            fairdrop_proof_v1.aleo::issue_receipt(auction_id, 0field, bidder_key);

        // Attribute this bid to the referral code.
        let f_ref: Final = fairdrop_ref_v1.aleo::record_referral(
            code_id,
            auction_id,
            bidder_key,
            payment_amount as u128,
        );

        return (change, bid, receipt, final {
            assert(!fairdrop_config_v1.aleo::paused.get_or_use(0field, false));
            f_credits.run();
            f_gate.run();
            f_proof.run();
            f_ref.run();    // additional vs non-ref variant
            record_bid(auction_id, bidder_key, quantity, payment_amount as u128);
        });
    }

    // =========================================================================
    // 5. place_bid_public_ref — public credits + referral attribution
    // =========================================================================
    //
    // Same as place_bid_public plus referral CPI.
    //
    // Leo 4.0: differs from place_bid_private_ref only in the credits CPI
    // and return type (no change record).

    fn place_bid_public_ref(
        public auction_id:     field,
        public quantity:       u128,
        public payment_amount: u64,
        public code_id:        field,
    ) -> (Bid, fairdrop_proof_v1.aleo::ParticipationReceipt, Final) {
        let bidder_key: field =
            bid_setup(self.signer, auction_id, quantity, payment_amount);
        let bid: Bid = Bid {
            owner:          self.signer,
            auction_id:     auction_id,
            quantity:       quantity,
            payment_amount: payment_amount as u128,
        };

        let f_credits: Final =
            credits.aleo::transfer_public_as_signer(self.address, payment_amount);

        let f_gate: Final = fairdrop_gate_v1.aleo::check_admission(auction_id);

        let (receipt, f_proof): (fairdrop_proof_v1.aleo::ParticipationReceipt, Final) =
            fairdrop_proof_v1.aleo::issue_receipt(auction_id, 0field, bidder_key);

        let f_ref: Final = fairdrop_ref_v1.aleo::record_referral(
            code_id,
            auction_id,
            bidder_key,
            payment_amount as u128,
        );

        return (bid, receipt, final {
            assert(!fairdrop_config_v1.aleo::paused.get_or_use(0field, false));
            f_credits.run();
            f_gate.run();
            f_proof.run();
            f_ref.run();
            record_bid(auction_id, bidder_key, quantity, payment_amount as u128);
        });
    }

    // =========================================================================
    // 6. close_auction — permissionless
    // =========================================================================
    //
    // Anyone may call once auction ends (supply_met OR block.height >= end_block).
    // Caller receives closer_reward from protocol_treasury.
    //
    // D11 params: creator, filled, volume, closer_reward validated in final block.
    //
    // Revenue accounting (fee on clearing-price revenue, not total_payments):
    //   total_cost      = total_committed * clearing_price / sale_scale
    //   protocol_fee    = total_cost * fee_bps / 10000
    //   creator_revenue = total_cost - protocol_fee
    //   referral_budget = protocol_fee * referral_pool_bps / 10000
    //
    // Leo 4.0: self.signer used in credits CPI inside entry point body — no
    // capture needed (transfer_public destination is set in proof context).

    fn close_auction(
        public auction_id:    field,
        public creator:       address,  // D11: config.creator
        public filled:        bool,     // D11: state.supply_met
        public volume:        u128,     // D11: state.total_payments
        public closer_reward: u128,     // D11: config.closer_reward
    ) -> Final {
        // Pay closer reward from this program's public credits balance.
        let f_closer: Final =
            credits.aleo::transfer_public(self.signer, closer_reward as u64);

        // Update creator's on-chain reputation.
        let f_proof: Final =
            fairdrop_proof_v1.aleo::update_reputation(creator, filled, volume);

        return final {
            assert(!fairdrop_config_v1.aleo::paused.get_or_use(0field, false));
            f_closer.run();
            f_proof.run();

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

            // Compute clearing price at the ended block.
            // ended_at_block: stored when supply was met; config.end_block otherwise.
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
            let referral_budget: u128 = protocol_fee * (config.referral_pool_bps as u128) / 10000u128;

            // Update treasury: credit net protocol fee, debit closer reward.
            let net_fee: u128      = protocol_fee - referral_budget;
            let new_treasury: u128 = treasury + net_fee - closer_reward;
            protocol_treasury.set(0field, new_treasury);

            // Write cleared state; referral_budget stored for push_referral_budget.
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
    // 7. push_referral_budget — permissionless; call after close_auction
    // =========================================================================
    //
    // Transfers referral_budget credits to fairdrop_ref_v1.aleo and calls
    // fund_reserve to enable credit_commission for this auction's bidders.
    // Double-push protection: fund_reserve has a reserve_funded guard.
    // D11: budget must match state.referral_budget.

    fn push_referral_budget(
        public auction_id: field,
        public budget:     u128,   // D11: state.referral_budget
    ) -> Final {
        let f_credits: Final =
            credits.aleo::transfer_public(fairdrop_ref_v1.aleo, budget as u64);

        let f_ref: Final = fairdrop_ref_v1.aleo::fund_reserve(auction_id, budget);

        return final {
            f_credits.run();
            f_ref.run();

            let state: AuctionState = auction_states.get(auction_id);
            assert(state.cleared);
            assert(!state.voided);
            assert(budget > 0u128);
            assert_eq(budget, state.referral_budget);

            // Zero out referral_budget — consumed.
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
    // 8. claim — redeem Bid record (non-vesting auctions)
    // =========================================================================
    //
    // Returns sale tokens (minted privately) and overpayment refund.
    // Dutch auction: bidder paid at bid time; clearing price may be lower →
    //   refund = payment_amount - (quantity * clearing_price / sale_scale).
    //
    // Leo 4.0: capture record fields before final block — record fields are
    // proof-context only (private UTXO data not accessible in finalization).

    fn claim(
        bid:                   Bid,
        public clearing_price: u128,
        public sale_token_id:  field,
        public sale_scale:     u128,
    ) -> (token_registry.aleo::Token, credits.aleo::credits, Final) {
        // Capture private record fields before final block.
        let auction_id: field  = bid.auction_id;
        let owner: address     = bid.owner;
        let sale_amount: u128  = bid.quantity;
        let cost: u128         = bid.quantity * clearing_price / sale_scale;
        let refund_amount: u64 = (bid.payment_amount - cost) as u64;

        // owner is private — recipient of both outputs is hidden on-chain.
        let (sale_token, f_mint): (token_registry.aleo::Token, Final) =
            token_registry.aleo::mint_private(
                sale_token_id,
                owner,
                sale_amount,
                false,
                4294967295u32,
            );

        let (refund, f_refund): (credits.aleo::credits, Final) =
            credits.aleo::transfer_public_to_private(owner, refund_amount);

        return (sale_token, refund, final {
            assert(!fairdrop_config_v1.aleo::paused.get_or_use(0field, false));
            f_mint.run();
            f_refund.run();

            let config: AuctionConfig = auction_configs.get(auction_id);
            let state:  AuctionState  = auction_states.get(auction_id);

            assert(state.cleared);
            assert(!state.voided);
            assert(!config.vest_enabled);  // vest_enabled auctions must use claim_vested
            assert_eq(clearing_price, state.clearing_price);
            assert_eq(sale_token_id,  config.sale_token_id);
            assert_eq(sale_scale,     config.sale_scale);

            // Deduct from mint budget.
            let sale_remaining: u128 = escrow_sales.get(auction_id);
            assert(sale_amount <= sale_remaining);
            escrow_sales.set(auction_id, sale_remaining - sale_amount);

            // Deduct refund from payment escrow.
            let payment_remaining: u128 = escrow_payments.get(auction_id);
            assert(refund_amount as u128 <= payment_remaining);
            escrow_payments.set(auction_id, payment_remaining - refund_amount as u128);
        });
    }

    // =========================================================================
    // 9. claim_vested — redeem Bid record (vest_enabled auctions)
    // =========================================================================
    //
    // Issues a VestedAllocation record instead of an immediate Token.
    // fairdrop_vest_v1.aleo mints tokens at release time.
    // D11 params: ended_at_block, cliff_blocks, vest_end_blocks validated in final.
    //
    // Leo 4.0: same capture pattern as claim.

    fn claim_vested(
        bid:                    Bid,
        public clearing_price:  u128,
        public sale_token_id:   field,
        public sale_scale:      u128,
        public ended_at_block:  u32,    // D11: state.ended_at_block
        public cliff_blocks:    u32,    // D11: config.vest_cliff_blocks
        public vest_end_blocks: u32,    // D11: config.vest_end_blocks
    ) -> (fairdrop_vest_v1.aleo::VestedAllocation, credits.aleo::credits, Final) {
        // Capture private record fields before final block.
        let auction_id: field  = bid.auction_id;
        let owner: address     = bid.owner;
        let sale_amount: u128  = bid.quantity;
        let cost: u128         = bid.quantity * clearing_price / sale_scale;
        let refund_amount: u64 = (bid.payment_amount - cost) as u64;

        // owner is private — passed as private param to create_vest.
        let (vest, f_vest): (fairdrop_vest_v1.aleo::VestedAllocation, Final) =
            fairdrop_vest_v1.aleo::create_vest(
                auction_id,
                owner,
                sale_token_id,
                sale_amount,
                ended_at_block,
                cliff_blocks,
                vest_end_blocks,
            );

        let (refund, f_refund): (credits.aleo::credits, Final) =
            credits.aleo::transfer_public_to_private(owner, refund_amount);

        return (vest, refund, final {
            assert(!fairdrop_config_v1.aleo::paused.get_or_use(0field, false));
            f_vest.run();
            f_refund.run();

            let config: AuctionConfig = auction_configs.get(auction_id);
            let state:  AuctionState  = auction_states.get(auction_id);

            assert(state.cleared);
            assert(!state.voided);
            assert(config.vest_enabled);  // non-vest auctions must use claim
            assert_eq(clearing_price, state.clearing_price);
            assert_eq(sale_token_id,  config.sale_token_id);
            assert_eq(sale_scale,     config.sale_scale);

            // D11: validate vest params against stored config/state.
            assert_eq(ended_at_block,  state.ended_at_block);
            assert_eq(cliff_blocks,    config.vest_cliff_blocks);
            assert_eq(vest_end_blocks, config.vest_end_blocks);

            let sale_remaining: u128 = escrow_sales.get(auction_id);
            assert(sale_amount <= sale_remaining);
            escrow_sales.set(auction_id, sale_remaining - sale_amount);

            let payment_remaining: u128 = escrow_payments.get(auction_id);
            assert(refund_amount as u128 <= payment_remaining);
            escrow_payments.set(auction_id, payment_remaining - refund_amount as u128);
        });
    }

    // =========================================================================
    // 10. withdraw_payments — creator withdraws clearing-price revenue
    // =========================================================================
    //
    // Capped at state.creator_revenue. Callable multiple times (partial ok).
    //
    // Leo 4.0: self.signer captured before final block — used in both the
    // credits CPI (entry point body) and the creator assert (final block).

    fn withdraw_payments(
        public auction_id: field,
        public amount:     u128,
    ) -> Final {
        assert(amount > 0u128);
        // Capture self.signer — unavailable inside final {}.
        let caller: address = self.signer;
        let f0: Final = credits.aleo::transfer_public(caller, amount as u64);

        return final {
            assert(!fairdrop_config_v1.aleo::paused.get_or_use(0field, false));
            f0.run();

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
    // 11. withdraw_unsold — creator mints back unsold supply after close
    // =========================================================================
    //
    // Available only when total_committed < supply. Partial withdrawals ok.
    //
    // Leo 4.0: self.signer captured before final block.

    fn withdraw_unsold(
        public auction_id:    field,
        public amount:        u128,
        public sale_token_id: field,
    ) -> (token_registry.aleo::Token, Final) {
        assert(amount > 0u128);
        // Capture self.signer — unavailable inside final {}.
        let caller: address = self.signer;

        let (token, f_mint): (token_registry.aleo::Token, Final) =
            token_registry.aleo::mint_private(
                sale_token_id,
                caller,
                amount,
                false,
                4294967295u32,
            );

        return (token, final {
            assert(!fairdrop_config_v1.aleo::paused.get_or_use(0field, false));
            f_mint.run();

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
    // 12. cancel_auction — creator escape hatch
    // =========================================================================
    //
    // Creator cancels any non-cleared, non-voided auction at any time.
    // Full supply minted back; bidders recover payments via claim_voided.
    // creation_fee is NOT refunded (anti-spam).
    //
    // Leo 4.0: self.signer captured before final block.

    fn cancel_auction(
        public auction_id:    field,
        public sale_token_id: field,
        public supply:        u128,   // D11: config.supply
    ) -> (token_registry.aleo::Token, Final) {
        // Capture self.signer — unavailable inside final {}.
        let creator: address = self.signer;

        // Mint full supply back to creator.
        let (token, f_mint): (token_registry.aleo::Token, Final) =
            token_registry.aleo::mint_private(
                sale_token_id,
                creator,
                supply,
                false,
                4294967295u32,
            );

        return (token, final {
            assert(!fairdrop_config_v1.aleo::paused.get_or_use(0field, false));
            f_mint.run();

            let config: AuctionConfig = auction_configs.get(auction_id);
            let state:  AuctionState  = auction_states.get(auction_id);

            assert_eq(creator,       config.creator);
            assert(!state.cleared);
            assert(!state.voided);
            assert_eq(sale_token_id, config.sale_token_id);
            assert_eq(supply,        config.supply);  // D11

            // Consume the full mint budget.
            let remaining: u128 = escrow_sales.get(auction_id);
            assert(supply <= remaining);
            escrow_sales.set(auction_id, remaining - supply);

            // Mark voided — bidders may now call claim_voided.
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
    // 13. claim_voided — bidder recovers payment from a voided auction
    // =========================================================================
    //
    // Consumes the Bid record (single-spend) and returns payment_amount privately.
    // No paused check — emergency pause must not trap bidder capital.
    //
    // Leo 4.0: capture bid record fields before final block.

    fn claim_voided(
        bid: Bid,
    ) -> (credits.aleo::credits, Final) {
        // Capture private record fields before final block.
        let auction_id: field    = bid.auction_id;
        let owner: address       = bid.owner;
        let payment_amount: u128 = bid.payment_amount;

        // owner is private — refund recipient hidden on-chain.
        let (refund, f_refund): (credits.aleo::credits, Final) =
            credits.aleo::transfer_public_to_private(owner, payment_amount as u64);

        return (refund, final {
            // No paused check — voided claims are a recovery path that must always work.
            f_refund.run();

            let state: AuctionState = auction_states.get(auction_id);
            assert(state.voided);

            let remaining: u128 = escrow_payments.get_or_use(auction_id, 0u128);
            assert(payment_amount <= remaining);
            escrow_payments.set(auction_id, remaining - payment_amount);
        });
    }
}
