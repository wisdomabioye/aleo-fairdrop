// fairdrop_ascending_v3.aleo — Privacy-preserving ascending-price auction.
//
// Mechanism: price rises from floor_price toward ceiling_price in discrete steps.
// Early bidders pay less; late bidders pay more (pay-what-you-bid, no uniform clearing).
// No clearing-price refund at claim — bidders pay their bid-time cost exactly.
//
// Payment token : credits.aleo — private record OR public balance.
// Sale tokens   : token_registry.aleo::Token. Burned at create, re-minted at claim.
//
// Roles required:
//   fairdrop_ascending_v3.aleo — SUPPLY_MANAGER_ROLE on sale token (burn + mint).
//   fairdrop_vest_v3.aleo      — SUPPLY_MANAGER_ROLE on sale token (mint at release),
//                             required only when vest_enabled = true.
//
// Revenue accounting (set at close_auction):
//   protocol_fee    = total_payments * fee_bps / 10000
//   creator_revenue = total_payments - protocol_fee
//   referral_budget = protocol_fee * referral_pool_bps / 10000
//   treasury_credit = protocol_fee - referral_budget - closer_reward
//
//   Invariant: creator_revenue + protocol_fee = total_payments
//   (No clearing-price refunds; individual rounding residue stays in escrow.)
//
// Price model at bid time:
//   blocks_elapsed = block.height - config.start_block
//   price_steps    = blocks_elapsed / config.price_rise_blocks
//   rise           = price_steps * config.price_rise_amount
//   current_price  = min(config.floor_price + rise, config.ceiling_price)
//
// Auction ID derivation:
//   auction_id = BHP256(AuctionKey { creator, nonce, PROGRAM_SALT = 2field })
//   Distinct PROGRAM_SALT prevents cross-type ID collision with fairdrop_dutch_v3.aleo.
//
// Privacy model:
//   - Bid payment amount : public (unavoidable — on-chain escrow accounting).
//   - Bid quantity       : public (rising price means payment approximates quantity).
//   - Bidder identity    : pseudonymous — only BHP256(bidder, auction_id) on-chain.
//   - Token recipients   : private (mint_private).
//   - Vest owner         : private (passed as private param to create_vest CPI).
//
// Pause model:
//   All finalizes except claim_voided assert !fairdrop_config.paused.
//   claim_voided is pause-exempt — bidders must always be able to recover funds.
//
// Lifecycle:
//   create_auction → place_bid_* → close_auction → [push_referral_budget] →
//   claim / claim_vested → withdraw_payments + withdraw_unsold
//   OR: cancel_auction → claim_voided (escape hatch)
//
// ── Leo 4.0 migration notes ──────────────────────────────────────────────────
//   • All `async transition` → `fn`; `async function finalize_*` deleted and
//     their bodies inlined as `final { }` blocks inside the calling entry point.
//   • `Future` → `Final`; `f.await()` → `f.run()` (inside `final { }` only).
//   • `.aleo/` → `.aleo::` throughout.
//   • `async constructor` → `constructor`.
//   • All structs moved outside `program {}` (interface boundary convention).
//   • Two module-level helpers introduced (zero behavioral change):
//       fn bid_setup       — proof-context; deduplicates 4 place_bid_* bodies.
//       final fn record_bid — finalize-context; deduplicates 4 finalize bodies.
//     Both are inlined by the compiler; no new on-chain functions introduced.
// ─────────────────────────────────────────────────────────────────────────────

import fairdrop_multisig_v2.aleo;
import credits.aleo;
import token_registry.aleo;
import fairdrop_config_v3.aleo;
import fairdrop_gate_v3.aleo;
import fairdrop_proof_v3.aleo;
import fairdrop_ref_v3.aleo;
import fairdrop_vest_v3.aleo;
import fairswap_dex_v3.aleo;

// =============================================================================
// Module-level structs
// Leo 4.0: structs that are not records (i.e. not UTXO types) live outside
// `program {}`. The program block now defines only the on-chain interface:
// entry points, records, and mappings.
// =============================================================================

struct TokenOwner { account: address, token_id: field }

struct AuctionKey { creator: address, nonce: u64, program_salt: field }

struct BidderKey { bidder: address, auction_id: field }

// BHP256 input for multisig-approved treasury withdrawal. Matches multisig doc.
struct WithdrawalOp  { amount: u128, recipient: address, nonce: u64 }
struct PauseToggleOp { paused: bool, nonce: u64 }

// Immutable auction parameters — written once at create_auction.
struct AuctionConfig {
    auction_id:        field,
    creator:           address,
    sale_token_id:     field,
    payment_token_id:  field,
    supply:            u128,
    floor_price:       u128,    // starting (minimum) price
    ceiling_price:     u128,    // maximum price cap
    start_block:       u32,
    end_block:         u32,
    price_rise_blocks: u32,     // blocks per price step
    price_rise_amount: u128,    // microcredits increase per step
    max_bid_amount:    u128,    // 0 = no per-bidder cap
    min_bid_amount:    u128,
    sale_scale:        u128,
    gate_mode:         u8,
    vest_enabled:      bool,
    vest_cliff_blocks: u32,
    vest_end_blocks:   u32,
    fee_bps:           u16,
    closer_reward:     u128,
    referral_pool_bps: u16,
    metadata_hash:     field,
    extension_window:  u32,   // 0 = anti-sniping disabled
    extension_blocks:  u32,   // blocks added per qualifying bid
    max_end_block:     u32,   // hard cap; ignored when extension_window = 0
}

struct AuctionState {
    total_committed:    u128,
    total_payments:     u128,
    supply_met:         bool,
    ended_at_block:     u32,
    cleared:            bool,
    clearing_price:     u128,  // always 0u128 for ascending (pay-what-you-bid)
    creator_revenue:    u128,
    protocol_fee:       u128,
    voided:             bool,
    referral_budget:    u128,
    effective_end_block: u32,  // mutable end block; updated by anti-sniping extension
}

struct Stats {
    total_auctions:          u64,
    total_bids:              u64,
    total_payment_collected: u128,
}

// Input struct: ascending-specific price parameters.
struct AscendingParams {
    floor_price:       u128,
    ceiling_price:     u128,
    price_rise_blocks: u32,
    price_rise_amount: u128,
    extension_window:  u32,   // blocks before end that trigger extension (0 = disabled)
    extension_blocks:  u32,   // blocks added per qualifying bid
    max_end_block:     u32,   // hard cap on how far effective_end_block can extend
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

// =============================================================================
// Module-level proof-context helper: bid_setup
//
// Leo 4.0: helper `fn` outside `program {}` run in the proof context and are
// inlined by the compiler into every call site. No new on-chain function.
//
// All four place_bid_* entry points share identical validation, bidder_key
// derivation, and Bid construction. Those three items are extracted here.
// CPIs (gate, proof, credits) stay inside entry points because `self.address`
// is program-scoped and not available in module-level functions.
//
// Parameters:
//   owner          — pass self.signer from the entry point (program-scoped)
//   auction_id     — forwarded unchanged
//   quantity       — bid quantity; asserted > 0
//   payment_amount — bid payment in microcredits; asserted > 0
//
// Returns: bidder_key — BHP256(BidderKey{owner, auction_id}) pseudonymous hash
//   needed for proof CPI and bid_totals tracking.
//
//   Leo 4.0: module-level fn cannot return records — only entry-point fn inside
//   program {} can have records as inputs/outputs. Bid construction (5 lines) is
//   therefore repeated in each of the four place_bid_* entry points. The asserts
//   and hash computation remain shared here.
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

    // Derive pseudonymous bidder key. self.signer is private in the proof
    // context — raw bidder address never reaches any finalize mapping.
    return BHP256::hash_to_field(BidderKey {
        bidder:     owner,
        auction_id: auction_id,
    });
}

// =============================================================================
// Module-level finalize-context helper: record_bid
//
// Leo 4.0: `final fn` outside `program {}` run in the finalization context
// and are inlined by the compiler into the caller's `final {}` block before
// that block is lifted into a standalone on-chain finalization function.
// No new on-chain function is introduced — this is pure code reuse.
//
// All four place_bid_* final blocks share identical ascending price validation
// and state/mapping writes. They differ only in which CPIs are .run()-ed
// before calling this function (private vs public credits; optional ref CPI).
//
// Ascending price formula:
//   blocks_elapsed = block.height - config.start_block
//   price_steps    = blocks_elapsed / config.price_rise_blocks
//   rise           = price_steps * config.price_rise_amount
//   current_price  = min(config.floor_price + rise, config.ceiling_price)
//
// Invariants checked:
//   • Auction is live: not supply_met, not cleared, not voided, in time window.
//   • Payment covers the bid at current price: payment * scale >= qty * price.
//   • Per-bidder cap not exceeded (if configured).
//   • Total supply not exceeded.
//
// State effects:
//   • bid_totals[bidder_key]   updated (per-bidder quantity tracking).
//   • auction_states[auction_id] updated (supply tracking, supply_met flag).
//   • escrow_payments[auction_id] incremented by payment_amount.
//   • stats[0field] bid count and volume incremented.
// =============================================================================
final fn record_bid(
    auction_id:     field,
    bidder_key:     field,   // BHP256(BidderKey{bidder, auction_id})
    quantity:       u128,
    payment_amount: u128,
) {
    let config: AuctionConfig = auction_configs.get(auction_id);
    let state:  AuctionState  = auction_states.get(auction_id);

    // Lifecycle guards: bid only allowed while auction is live.
    assert(!state.supply_met);
    assert(!state.cleared);
    assert(!state.voided);
    assert(block.height >= config.start_block);
    assert(block.height <  state.effective_end_block);

    // Ascending price: rise from floor toward ceiling in discrete steps.
    let blocks_elapsed: u32 = block.height - config.start_block;
    let price_steps: u128   = (blocks_elapsed / config.price_rise_blocks) as u128;
    let rise: u128          = price_steps * config.price_rise_amount;
    let price_room: u128    = config.ceiling_price - config.floor_price;
    let current_price: u128 = rise < price_room
        ? config.floor_price + rise : config.ceiling_price;

    // Payment sufficiency: payment_amount * sale_scale >= quantity * current_price.
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

    // Anti-sniping: extend effective_end_block when bid lands in the final window.
    // Guard against underflow: if effective_end_block < extension_window, window_start = 0.
    // Skip extension when this bid fills supply — supply_met takes over as the close trigger
    // and effective_end_block is no longer read by close_auction or place_bid_*.
    let window_start: u32 = state.effective_end_block > config.extension_window
        ? state.effective_end_block - config.extension_window : 0u32;
    let in_window: bool   = config.extension_window > 0u32
        && block.height >= window_start
        && !is_supply_met;
    let extended: u32     = state.effective_end_block + config.extension_blocks;
    let new_eff_end: u32  = in_window
        ? (extended < config.max_end_block ? extended : config.max_end_block)
        : state.effective_end_block;

    auction_states.set(auction_id, AuctionState {
        total_committed:    new_committed,
        total_payments:     state.total_payments + payment_amount,
        supply_met:         is_supply_met,
        ended_at_block:     is_supply_met ? block.height : state.ended_at_block,
        cleared:            false,
        clearing_price:     0u128,
        creator_revenue:    0u128,
        protocol_fee:       0u128,
        voided:             false,
        referral_budget:    0u128,
        effective_end_block: new_eff_end,
    });

    // Escrow: credits locked in this program's public balance.
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
// =============================================================================

program fairdrop_ascending_v3.aleo {
    // Upgrade governance: 3-of-5 multi-sig must call fairdrop_multisig_v2.aleo::approve_upgrade
    // with contract_key=6field and this program's compiled checksum before deployment.
    @checksum(mapping="fairdrop_multisig_v2.aleo::approved_upgrades", key="6field")
    constructor() {}

    // =========================================================================
    // Constants
    // =========================================================================

    const CREDITS_RESERVED_TOKEN_ID: field =
        3443843282313283355522573239085696902919850365217539366784739393210722344986field;

    const SUPPLY_MANAGER_ROLE: u8 = 3u8;

    // Distinguishes ascending auction_ids from other program types.
    // MUST differ from fairdrop_dutch (1field) and fairdrop_sealed (3field).
    const PROGRAM_SALT: field = 2field;

    // Burn address — all-zeros Aleo address. Used to guard lp_recipient in seed_liquidity.
    const ZERO_ADDRESS: address = aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc;

    // =========================================================================
    // Records
    // Leo 4.0: records remain inside `program {}` as part of the on-chain
    // interface (UTXO types). Structs moved to module level above.
    // =========================================================================

    // Private bid receipt — consumed at claim or claim_vested.
    // No bid_price field: no clearing-price refund model.
    record Bid {
        owner:          address,
        auction_id:     field,
        quantity:       u128,
        payment_amount: u128,
    }

    // =========================================================================
    // Mappings
    // =========================================================================

    mapping auction_configs:  field => AuctionConfig;
    mapping auction_states:   field => AuctionState;

    // BHP256(BidderKey) → cumulative quantity; enforces max_bid_amount per bidder.
    mapping bid_totals: field => u128;

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

    // Protocol-owned credits (creation fees + protocol fees - closer rewards).
    mapping protocol_treasury: field => u128;

    // Replay protection for withdraw_treasury_fees approvals.
    // Local auction pause. key = 0field; default false (running).
    // Either this OR fairdrop_config_v3::paused being true halts this auction.
    mapping paused:       field => bool;
    mapping consumed_ops: field => bool;

    // =========================================================================
    // 1. create_auction
    // =========================================================================
    //
    // Burns `supply` tokens from creator's private Token record, pays creation
    // fee, validates config snapshot (D16), and registers the gate mode.
    //
    // Leo 4.0: `async transition` → `fn`; finalize_create_auction deleted and
    // its body moved inline into the `final { }` block below.

    fn create_auction(
        token:                 token_registry.aleo::Token,
        public sale_token_id:  field,
        public supply:         u128,
        public start_block:    u32,
        public end_block:      u32,
        public max_bid_amount: u128,
        public min_bid_amount: u128,
        public sale_scale:     u128,
        public nonce:          u64,
        public metadata_hash:  field,
        public ascending:      AscendingParams,
        public gate:           GateParams,
        public vest:           VestParams,
        public snapshot:       ConfigSnapshot,
    ) -> (token_registry.aleo::Token, Final) {
        assert(supply > 0u128);
        assert_eq(token.token_id, sale_token_id);
        assert_eq(token.amount, supply);

        // Compute auction_id in proof context so CPI register_gate can use it.
        let auction_id: field = BHP256::hash_to_field(AuctionKey {
            creator:      self.signer,
            nonce:        nonce,
            program_salt: PROGRAM_SALT,
        });

        // CPI 1: burn sale token deposit.
        let (remainder, f_burn): (token_registry.aleo::Token, Final) =
            token_registry.aleo::burn_private(token, supply);

        // CPI 2: deduct anti-spam creation fee from creator's public balance.
        let f_creation: Final =
            credits.aleo::transfer_public_as_signer(self.address, snapshot.creation_fee as u64);

        // CPI 3: D16 — validate snapshotted protocol params and auction duration.
        let f_cfg: Final = fairdrop_config_v3.aleo::assert_config(
            snapshot.fee_bps,
            snapshot.creation_fee,
            snapshot.closer_reward,
            snapshot.slash_reward_bps,
            snapshot.referral_pool_bps,
            start_block,
            end_block,
        );

        // CPI 4: register gate mode for this auction.
        let f_gate: Final = fairdrop_gate_v3.aleo::register_gate(
            auction_id,
            gate.gate_mode,
            gate.merkle_root,
            gate.issuer,
        );

        // Build AuctionConfig in proof context; pass as one struct to keep
        // the final block lean (no parameter-count concern in 4.0, but grouping
        // keeps the logic readable and consistent with the Dutch reference).
        let config: AuctionConfig = AuctionConfig {
            auction_id:        auction_id,
            creator:           self.signer,
            sale_token_id:     sale_token_id,
            payment_token_id:  CREDITS_RESERVED_TOKEN_ID,
            supply:            supply,
            floor_price:       ascending.floor_price,
            ceiling_price:     ascending.ceiling_price,
            start_block:       start_block,
            end_block:         end_block,
            price_rise_blocks: ascending.price_rise_blocks,
            price_rise_amount: ascending.price_rise_amount,
            max_bid_amount:    max_bid_amount,
            min_bid_amount:    min_bid_amount,
            sale_scale:        sale_scale,
            gate_mode:         gate.gate_mode,
            vest_enabled:      vest.vest_enabled,
            vest_cliff_blocks: vest.vest_cliff_blocks,
            vest_end_blocks:   vest.vest_end_blocks,
            fee_bps:           snapshot.fee_bps,
            closer_reward:     snapshot.closer_reward,
            referral_pool_bps: snapshot.referral_pool_bps,
            metadata_hash:     metadata_hash,
            extension_window:  ascending.extension_window,
            extension_blocks:  ascending.extension_blocks,
            max_end_block:     ascending.max_end_block,
        };

        // Capture self.signer and creation_fee before entering final block —
        // self.* is proof-context only and not accessible inside final { }.
        let creator: address      = self.signer;
        let creation_fee: u128    = snapshot.creation_fee;

        return (remainder, final {
            assert(!fairdrop_config_v3.aleo::paused.get_or_use(0field, false) && !paused.get_or_use(0field, false));
            f_burn.run();
            f_creation.run();
            f_cfg.run();    // validates params, duration, end_block > start_block
            f_gate.run();

            assert_eq(config.payment_token_id, CREDITS_RESERVED_TOKEN_ID);
            assert(config.sale_token_id != CREDITS_RESERVED_TOKEN_ID);
            assert(config.start_block >= block.height);
            assert(config.floor_price > 0u128);
            assert(config.ceiling_price > config.floor_price);
            assert(config.price_rise_blocks > 0u32);
            assert(config.price_rise_amount > 0u128);
            assert(config.min_bid_amount > 0u128);
            assert(config.max_bid_amount == 0u128 || config.max_bid_amount >= config.min_bid_amount);

            // Anti-sniping param validation (only when extension_window > 0).
            // extension_blocks must be > 0 (otherwise the extension is a no-op).
            // max_end_block must be >= end_block (otherwise the cap would immediately
            // prevent any extension from firing, making the config misleading).
            assert(
                config.extension_window == 0u32
                || (config.extension_blocks > 0u32 && config.max_end_block >= end_block)
            );

            // D11 nonce: creator_nonces[creator] must match the nonce used to
            // derive auction_id in the proof context.
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
            let asc_role_key: field = BHP256::hash_to_field(TokenOwner {
                account:  fairdrop_ascending_v3.aleo,
                token_id: config.sale_token_id,
            });
            assert_eq(
                token_registry.aleo::roles.get_or_use(asc_role_key, 0u8),
                SUPPLY_MANAGER_ROLE
            );

            // Vesting role check (only required when vest_enabled = true).
            let vest_duration_ok: bool =
                !config.vest_enabled || config.vest_end_blocks > config.vest_cliff_blocks;
            assert(vest_duration_ok);

            let vest_role_key: field = BHP256::hash_to_field(TokenOwner {
                account:  fairdrop_vest_v3.aleo,
                token_id: config.sale_token_id,
            });
            let vest_role_ok: bool =
                !config.vest_enabled ||
                token_registry.aleo::roles.get_or_use(vest_role_key, 0u8) == SUPPLY_MANAGER_ROLE;
            assert(vest_role_ok);

            // Write immutable config and zero-value initial state.
            auction_configs.set(auction_id, config);
            auction_states.set(auction_id, AuctionState {
                total_committed:    0u128,
                total_payments:     0u128,
                supply_met:         false,
                ended_at_block:     0u32,
                cleared:            false,
                clearing_price:     0u128,
                creator_revenue:    0u128,
                protocol_fee:       0u128,
                voided:             false,
                referral_budget:    0u128,
                effective_end_block: end_block,
            });

            // Set burn-backed mint budget.
            escrow_sales.set(auction_id, config.supply);

            // Register in global sequential index.
            let s: Stats = stats.get_or_use(0field, Stats {
                total_auctions: 0u64, total_bids: 0u64, total_payment_collected: 0u128
            });
            auction_index.set(s.total_auctions, auction_id);

            // Update per-creator linked list for enumeration.
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
    // Consumes a private credits record; deposits payment_amount to this
    // program's public credits balance; returns change record.
    // Bidder's UTXO source is hidden.
    //
    // Leo 4.0: bid_setup (proof helper) handles validation and bidder_key
    // derivation; Bid is constructed inline (records cannot be returned from
    // module-level fn). record_bid (finalize helper) handles state writes.
    // The unique element here is the private→public credits CPI.

    fn place_bid_private(
        payment:               credits.aleo::credits,
        public auction_id:     field,
        public quantity:       u128,
        public payment_amount: u64,
    ) -> (credits.aleo::credits, Bid, fairdrop_proof_v3.aleo::ParticipationReceipt, Final) {
        // bid_setup: asserts, bidder_key, Bid record — shared with all variants.
        // bid_setup: asserts + bidder_key. Bid constructed here because
        // module-level fn cannot return records in Leo 4.0.
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

        // CPIs shared with public variant (gate + proof).
        let f_gate: Final = fairdrop_gate_v3.aleo::check_admission(auction_id);
        let (receipt, f_proof): (fairdrop_proof_v3.aleo::ParticipationReceipt, Final) =
            fairdrop_proof_v3.aleo::issue_receipt(auction_id, 0field, bidder_key);

        return (change, bid, receipt, final {
            assert(!fairdrop_config_v3.aleo::paused.get_or_use(0field, false) && !paused.get_or_use(0field, false));
            f_credits.run();
            f_gate.run();
            f_proof.run();
            // record_bid: ascending price validation + all state/mapping writes.
            record_bid(auction_id, bidder_key, quantity, payment_amount as u128);
        });
    }

    // =========================================================================
    // 3. place_bid_public — public credits balance
    // =========================================================================
    //
    // Deducts payment_amount from self.signer's public credits.aleo balance.
    // transfer_public_as_signer pulls from the original tx signer — no
    // pre-approval required.
    //
    // Leo 4.0: differs from place_bid_private only in the credits CPI
    // (transfer_public_as_signer vs transfer_private_to_public) and return type
    // (no change record). Both helpers are shared.

    fn place_bid_public(
        public auction_id:     field,
        public quantity:       u128,
        public payment_amount: u64,
    ) -> (Bid, fairdrop_proof_v3.aleo::ParticipationReceipt, Final) {
        // bid_setup: asserts + bidder_key. Bid constructed here because
        // module-level fn cannot return records in Leo 4.0.
        let bidder_key: field =
            bid_setup(self.signer, auction_id, quantity, payment_amount);
        let bid: Bid = Bid {
            owner:          self.signer,
            auction_id:     auction_id,
            quantity:       quantity,
            payment_amount: payment_amount as u128,
        };

        // Unique to public variant: pull from signer's public balance.
        let f_credits: Final =
            credits.aleo::transfer_public_as_signer(self.address, payment_amount);

        let f_gate: Final = fairdrop_gate_v3.aleo::check_admission(auction_id);
        let (receipt, f_proof): (fairdrop_proof_v3.aleo::ParticipationReceipt, Final) =
            fairdrop_proof_v3.aleo::issue_receipt(auction_id, 0field, bidder_key);

        return (bid, receipt, final {
            assert(!fairdrop_config_v3.aleo::paused.get_or_use(0field, false) && !paused.get_or_use(0field, false));
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
    // Same as place_bid_private plus a record_referral CPI to fairdrop_ref_v1.
    // Separate entry point required — Leo cannot conditionally await a Final.
    //
    // Leo 4.0: only difference from place_bid_private in the final block is
    // the additional f_ref.run() call before record_bid.

    fn place_bid_private_ref(
        payment:               credits.aleo::credits,
        public auction_id:     field,
        public quantity:       u128,
        public payment_amount: u64,
        public code_id:        field,
    ) -> (credits.aleo::credits, Bid, fairdrop_proof_v3.aleo::ParticipationReceipt, Final) {
        // bid_setup: asserts + bidder_key. Bid constructed here because
        // module-level fn cannot return records in Leo 4.0.
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

        let f_gate: Final = fairdrop_gate_v3.aleo::check_admission(auction_id);
        let (receipt, f_proof): (fairdrop_proof_v3.aleo::ParticipationReceipt, Final) =
            fairdrop_proof_v3.aleo::issue_receipt(auction_id, 0field, bidder_key);

        // Referral attribution: attribute this bid payment to code_id.
        let f_ref: Final = fairdrop_ref_v3.aleo::record_referral(
            code_id,
            auction_id,
            bidder_key,
            payment_amount as u128,
        );

        return (change, bid, receipt, final {
            assert(!fairdrop_config_v3.aleo::paused.get_or_use(0field, false) && !paused.get_or_use(0field, false));
            f_credits.run();
            f_gate.run();
            f_proof.run();
            f_ref.run();    // additional vs non-ref variants
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
    // and return type (no change record). All other code is shared.

    fn place_bid_public_ref(
        public auction_id:     field,
        public quantity:       u128,
        public payment_amount: u64,
        public code_id:        field,
    ) -> (Bid, fairdrop_proof_v3.aleo::ParticipationReceipt, Final) {
        // bid_setup: asserts + bidder_key. Bid constructed here because
        // module-level fn cannot return records in Leo 4.0.
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

        let f_gate: Final = fairdrop_gate_v3.aleo::check_admission(auction_id);
        let (receipt, f_proof): (fairdrop_proof_v3.aleo::ParticipationReceipt, Final) =
            fairdrop_proof_v3.aleo::issue_receipt(auction_id, 0field, bidder_key);

        let f_ref: Final = fairdrop_ref_v3.aleo::record_referral(
            code_id,
            auction_id,
            bidder_key,
            payment_amount as u128,
        );

        return (bid, receipt, final {
            assert(!fairdrop_config_v3.aleo::paused.get_or_use(0field, false) && !paused.get_or_use(0field, false));
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
    // Revenue = total_payments (pay-what-you-bid — no uniform clearing price).
    // Caller receives closer_reward from protocol_treasury.
    //
    // D11 params: creator, filled, volume, closer_reward validated in final block.
    //
    // Leo 4.0: self.signer captured as `closer` before final block (self.* is
    // proof-context only).

    fn close_auction(
        public auction_id:    field,
        public creator:       address,
        public filled:        bool,
        public volume:        u128,
        public closer_reward: u128,
    ) -> Final {
        // Capture self.signer — unavailable inside final { }.
        let closer: address = self.signer;

        let f_closer: Final =
            credits.aleo::transfer_public(closer, closer_reward as u64);

        let f_proof: Final =
            fairdrop_proof_v3.aleo::update_reputation(creator, filled, volume);

        return final {
            assert(!fairdrop_config_v3.aleo::paused.get_or_use(0field, false) && !paused.get_or_use(0field, false));
            f_closer.run();
            f_proof.run();

            let config: AuctionConfig = auction_configs.get(auction_id);
            let state:  AuctionState  = auction_states.get(auction_id);

            assert(!state.cleared);
            assert(!state.voided);
            assert(state.supply_met || block.height >= state.effective_end_block);

            // D11: validate caller-supplied public params against on-chain state.
            assert_eq(creator,       config.creator);
            assert_eq(filled,        state.supply_met);
            assert_eq(volume,        state.total_payments);
            assert_eq(closer_reward, config.closer_reward);

            let treasury: u128 = protocol_treasury.get_or_use(0field, 0u128);
            assert(treasury >= closer_reward);

            let ended_block: u32 = state.supply_met ? state.ended_at_block : state.effective_end_block;

            // Revenue accounting on total_payments (pay-what-you-bid).
            let total_cost: u128      = state.total_payments;
            let protocol_fee: u128    = total_cost * (config.fee_bps as u128) / 10000u128;
            let creator_revenue: u128 = total_cost - protocol_fee;
            let referral_budget: u128 =
                protocol_fee * (config.referral_pool_bps as u128) / 10000u128;

            let net_fee: u128      = protocol_fee - referral_budget;
            let new_treasury: u128 = treasury + net_fee - closer_reward;
            protocol_treasury.set(0field, new_treasury);

            auction_states.set(auction_id, AuctionState {
                total_committed:    state.total_committed,
                total_payments:     state.total_payments,
                supply_met:         state.supply_met,
                ended_at_block:     ended_block,
                cleared:            true,
                clearing_price:     0u128,         // always 0 — pay-what-you-bid
                creator_revenue:    creator_revenue,
                protocol_fee:       protocol_fee,
                voided:             false,
                referral_budget:    referral_budget,
                effective_end_block: state.effective_end_block,
            });
        };
    }

    // =========================================================================
    // 7. push_referral_budget — permissionless; call after close_auction
    // =========================================================================
    //
    // Transfers the referral_budget portion of protocol_fee to fairdrop_ref_v3.aleo
    // and zeroes it in auction state. Must be called exactly once per cleared
    // auction (budget validated as non-zero and matching state).
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
            credits.aleo::transfer_public(fairdrop_ref_v3.aleo, budget as u64);

        let f_ref: Final = fairdrop_ref_v3.aleo::fund_reserve(auction_id, budget);

        return final {
            f_credits.run();
            f_ref.run();

            let state: AuctionState = auction_states.get(auction_id);
            assert(state.cleared);
            assert(!state.voided);
            assert(budget > 0u128);
            assert_eq(budget, state.referral_budget);

            // Zero out referral_budget to prevent double-push.
            auction_states.set(auction_id, AuctionState {
                total_committed:    state.total_committed,
                total_payments:     state.total_payments,
                supply_met:         state.supply_met,
                ended_at_block:     state.ended_at_block,
                cleared:            state.cleared,
                clearing_price:     state.clearing_price,
                creator_revenue:    state.creator_revenue,
                protocol_fee:       state.protocol_fee,
                voided:             state.voided,
                referral_budget:    0u128,
                effective_end_block: state.effective_end_block,
            });
        };
    }

    // =========================================================================
    // 8. claim — redeem Bid record (non-vesting ascending auctions)
    // =========================================================================
    //
    // No clearing-price refund: bidders paid their bid-time price; payment_amount
    // stays in escrow and is settled via creator_revenue + protocol_fee.
    // bid.owner is private — token recipient is hidden on-chain.

    fn claim(
        bid:                  Bid,
        public sale_token_id: field,
    ) -> (token_registry.aleo::Token, Final) {
        let sale_amount: u128 = bid.quantity;

        let (sale_token, f_mint): (token_registry.aleo::Token, Final) =
            token_registry.aleo::mint_private(
                sale_token_id,
                bid.owner,
                sale_amount,
                false,
                4294967295u32,
            );

        // Capture fields from bid record — record consumed after this point.
        let auction_id: field = bid.auction_id;

        return (sale_token, final {
            assert(!fairdrop_config_v3.aleo::paused.get_or_use(0field, false) && !paused.get_or_use(0field, false));
            f_mint.run();

            let config: AuctionConfig = auction_configs.get(auction_id);
            let state:  AuctionState  = auction_states.get(auction_id);

            assert(state.cleared);
            assert(!state.voided);
            assert(!config.vest_enabled);
            assert_eq(sale_token_id, config.sale_token_id);

            // Decrement burn-backed mint budget.
            let sale_remaining: u128 = escrow_sales.get(auction_id);
            assert(sale_amount <= sale_remaining);
            escrow_sales.set(auction_id, sale_remaining - sale_amount);
        });
    }

    // =========================================================================
    // 9. claim_vested — redeem Bid record (vest_enabled ascending auctions)
    // =========================================================================
    //
    // Creates a VestedAllocation record in fairdrop_vest_v3.aleo instead of
    // minting tokens immediately. Tokens are released on the vest schedule.
    //
    // D11 params: ended_at_block, cliff_blocks, vest_end_blocks validated
    // against on-chain state/config in the final block.

    fn claim_vested(
        bid:                    Bid,
        public sale_token_id:   field,
        public ended_at_block:  u32,
        public cliff_blocks:    u32,
        public vest_end_blocks: u32,
    ) -> (fairdrop_vest_v3.aleo::VestedAllocation, Final) {
        let sale_amount: u128 = bid.quantity;
        let auction_id: field = bid.auction_id;

        let (vest, f_vest): (fairdrop_vest_v3.aleo::VestedAllocation, Final) =
            fairdrop_vest_v3.aleo::create_vest(
                auction_id,
                bid.owner,
                sale_token_id,
                sale_amount,
                ended_at_block,
                cliff_blocks,
                vest_end_blocks,
            );

        return (vest, final {
            assert(!fairdrop_config_v3.aleo::paused.get_or_use(0field, false) && !paused.get_or_use(0field, false));
            f_vest.run();

            let config: AuctionConfig = auction_configs.get(auction_id);
            let state:  AuctionState  = auction_states.get(auction_id);

            assert(state.cleared);
            assert(!state.voided);
            assert(config.vest_enabled);
            assert_eq(sale_token_id,   config.sale_token_id);
            // D11: validate caller-supplied vest params against on-chain config.
            assert_eq(ended_at_block,  state.ended_at_block);
            assert_eq(cliff_blocks,    config.vest_cliff_blocks);
            assert_eq(vest_end_blocks, config.vest_end_blocks);

            let sale_remaining: u128 = escrow_sales.get(auction_id);
            assert(sale_amount <= sale_remaining);
            escrow_sales.set(auction_id, sale_remaining - sale_amount);
        });
    }

    // =========================================================================
    // 10. withdraw_payments — creator withdraws revenue after close
    // =========================================================================
    //
    // Capped at state.creator_revenue = total_payments - protocol_fee.
    // The protocol_fee portion remains in escrow_payments for the protocol.

    fn withdraw_payments(
        public auction_id: field,
        public amount:     u128,
        public recipient:  address,
    ) -> Final {
        assert(amount > 0u128);

        // Capture self.signer — proof-context only.
        let caller: address = self.signer;
        let f0: Final = credits.aleo::transfer_public(recipient, amount as u64);

        return final {
            assert(!fairdrop_config_v3.aleo::paused.get_or_use(0field, false) && !paused.get_or_use(0field, false));
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
    // Unsold = config.supply - state.total_committed.
    // Mint is backed by the burn at create_auction via escrow_sales budget.

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
            assert(!fairdrop_config_v3.aleo::paused.get_or_use(0field, false) && !paused.get_or_use(0field, false));
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
    // Mints full supply back to creator. Bidder payments remain in escrow;
    // bidders recover via claim_voided. creation_fee is NOT refunded.

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
            assert(!fairdrop_config_v3.aleo::paused.get_or_use(0field, false) && !paused.get_or_use(0field, false));
            f_mint.run();

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
                total_committed:    state.total_committed,
                total_payments:     state.total_payments,
                supply_met:         state.supply_met,
                ended_at_block:     state.ended_at_block,
                cleared:            false,
                clearing_price:     0u128,
                creator_revenue:    0u128,
                protocol_fee:       0u128,
                voided:             true,
                referral_budget:    0u128,
                effective_end_block: state.effective_end_block,
            });
        });
    }

    // =========================================================================
    // 13. claim_voided — bidder recovers payment from a voided auction
    // =========================================================================
    //
    // No paused check — emergency pause must not trap bidder capital.
    // Full payment_amount refunded (pay-what-you-bid: no partial recovery).
    // Pause-exempt: bidders must always be able to recover funds.

    fn claim_voided(
        bid: Bid,
    ) -> (credits.aleo::credits, Final) {
        // Capture bid fields — record consumed after this point.
        let owner: address          = bid.owner;
        let auction_id: field       = bid.auction_id;
        let payment_amount: u128    = bid.payment_amount;

        let (refund, f_refund): (credits.aleo::credits, Final) =
            credits.aleo::transfer_public_to_private(owner, payment_amount as u64);

        return (refund, final {
            // No paused check — bidder recovery must always be available.
            f_refund.run();

            let state: AuctionState = auction_states.get(auction_id);
            assert(state.voided);

            let remaining: u128 = escrow_payments.get_or_use(auction_id, 0u128);
            assert(payment_amount <= remaining);
            escrow_payments.set(auction_id, remaining - payment_amount);
        });
    }

    // =========================================================================
    // 14. withdraw_treasury_fees — sweep protocol treasury to a private recipient
    // =========================================================================
    //
    // Transfers `amount` microcredits from the on-chain protocol_treasury balance
    // to `recipient` as a private credits record. Requires prior 3-of-5 multisig
    // approval via fairdrop_multisig_v2.aleo::approve_op.
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
            assert(fairdrop_multisig_v2.aleo::approved_ops.get_or_use(op_hash, false));
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
    // Pauses or unpauses this auction independently of fairdrop_config_v3::paused.
    // Either being true blocks create_auction, place_bid, close_auction, claim, etc.
    // claim_voided remains exempt from both checks — bidder capital must always
    // be recoverable regardless of pause state.
    //
    // Caller must first call fairdrop_multisig_v2.aleo::approve_op with:
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
            assert(fairdrop_multisig_v2.aleo::approved_ops.get_or_use(op_hash, false));
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
            assert(!fairdrop_config_v3.aleo::paused.get_or_use(0field, false) && !paused.get_or_use(0field, false));

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
