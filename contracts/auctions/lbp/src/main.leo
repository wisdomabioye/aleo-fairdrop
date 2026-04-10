// fairdrop_lbp_v3.aleo — Privacy-preserving Liquidity Bootstrapping Pool auction.
//
// Mechanism: price is a joint function of time elapsed AND remaining supply.
// High demand (supply decreasing fast) decelerates the price descent.
// No demand causes a fast price drop to attract buyers. Self-correcting
// without an oracle. Front-running bots are structurally impossible on Aleo
// because all transaction inputs are encrypted until a block is finalized.
//
// Price formula (PRECISION = 1_000_000):
//   remaining       = config.supply - state.total_committed  (before this bid)
//   time_remaining  = config.end_block - block.height
//   total_duration  = config.end_block - config.start_block
//   supply_fraction = remaining    * PRECISION / config.supply
//   time_fraction   = time_remaining * PRECISION / total_duration
//   price_spread    = config.start_price - config.floor_price
//   current_price   = config.floor_price
//                   + price_spread * supply_fraction / PRECISION
//                                 * time_fraction   / PRECISION
//
// Overflow safety: PRECISION = 1e6, practical start_price ≤ 1e18 (u64 range) →
//   price_spread * supply_fraction ≤ 1e24 — well within u128 max (~3.4e38). ✓
//
// max_bid_price (slippage guard): bidder supplies the maximum price they will accept.
// Finalize re-derives current_price from state + block.height and asserts it is ≤
// max_bid_price. Because LBP price is strictly non-increasing (both supply_frac and
// time_frac can only decrease), concurrent bids never cause a false rejection —
// price can only fall between tx build and finalize. Exact equality would fail
// whenever any other bid lands first; a ceiling check is robust to this.
// Client SDK should expose slippage_bps and compute max_bid_price client-side.
//
// Payment model: pay-what-you-bid. max_bid_price stored in LBPBid for analytics.
// No uniform clearing price. Creator revenue = total_payments.
//
// Payment token : credits.aleo — private record OR public balance.
// Sale tokens   : token_registry.aleo::Token. Burned at create, re-minted at claim.
//
// Roles required:
//   fairdrop_lbp_v3.aleo  — SUPPLY_MANAGER_ROLE on sale token (burn + mint).
//   fairdrop_vest_v2.aleo — SUPPLY_MANAGER_ROLE on sale token (mint at release),
//                        required only when vest_enabled = true.
//
// Revenue accounting (set at close_auction):
//   protocol_fee    = total_payments * fee_bps / 10000
//   creator_revenue = total_payments - protocol_fee
//   referral_budget = protocol_fee * referral_pool_bps / 10000
//   treasury_credit = protocol_fee - referral_budget - closer_reward
//
//   Invariant: creator_revenue + protocol_fee = total_payments  ✓
//
// Auction ID derivation:
//   auction_id = BHP256(AuctionKey { creator, nonce, PROGRAM_SALT = 5field })
//   Distinct from Dutch (1field), Ascending (2field), Sealed (3field), Raise (4field).
//
// Privacy model:
//   - Bid payment amount : public (unavoidable — on-chain escrow accounting).
//   - Bid quantity       : public (used for supply tracking and price formula).
//   - Bid source         : hidden for place_bid_private (private UTXO consumed).
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

// ── Leo 4.0 migration notes ───────────────────────────────────────────────────
//   async constructor → constructor
//   async transition  → fn; async function finalize_* → deleted, inlined as final {}
//   self.signer captured before final {} where needed
//   record fields captured before final {} in claim, claim_vested, claim_voided
//   structs moved outside program {}
//   Future → Final, .aleo:: → .aleo::
// ─────────────────────────────────────────────────────────────────────────────

import fairdrop_multisig_v2.aleo;
import credits.aleo;
import token_registry.aleo;
import fairdrop_config_v3.aleo;
import fairdrop_gate_v3.aleo;
import fairdrop_proof_v3.aleo;
import fairdrop_ref_v2.aleo;
import fairdrop_vest_v2.aleo;
import fairswap_dex_v3.aleo;

// =========================================================================
// Structs (moved outside program {} for Leo 4.0)
// =========================================================================

struct TokenOwner { account: address, token_id: field }

struct AuctionKey { creator: address, nonce: u64, program_salt: field }

struct BidderKey { bidder: address, auction_id: field }

// BHP256 input for multisig-approved treasury withdrawal. Matches multisig doc.
struct WithdrawalOp  { amount: u128, recipient: address, nonce: u64 }
struct PauseToggleOp { paused: bool, nonce: u64 }

// Immutable auction parameters — written once at create_auction.
struct AuctionConfig {
    auction_id:         field,
    creator:            address,
    sale_token_id:      field,
    payment_token_id:   field,
    supply:             u128,
    start_price:        u128,    // max price: full supply, t=0
    floor_price:        u128,    // min price: regardless of supply/time
    start_block:        u32,
    end_block:          u32,
    max_bid_amount:     u128,    // 0 = no per-bidder cap
    min_bid_amount:     u128,
    sale_scale:         u128,    // 10^sale_token_decimals
    gate_mode:          u8,      // 0=open 1=merkle 2=credential
    vest_enabled:       bool,
    vest_cliff_blocks:  u32,
    vest_end_blocks:    u32,
    fee_bps:            u16,     // D16: snapshotted from fairdrop_config at create
    closer_reward:      u128,    // D16: snapshotted from fairdrop_config at create
    referral_pool_bps:  u16,     // D16: snapshotted from fairdrop_config at create
    metadata_hash:      field,   // BHP256 of off-chain metadata JSON. 0field = no metadata.
}

struct AuctionState {
    total_committed: u128,
    total_payments:  u128,
    supply_met:      bool,
    ended_at_block:  u32,
    cleared:         bool,
    clearing_price:  u128,  // always 0u128 for LBP (pay-what-you-bid)
    creator_revenue: u128,
    protocol_fee:    u128,
    voided:          bool,
    referral_budget: u128,
}

struct Stats {
    total_auctions:          u64,
    total_bids:              u64,
    total_payment_collected: u128,
}

// Input struct: LBP-specific price parameters.
struct LbpParams {
    start_price: u128,   // max price (supply full, t=0)
    floor_price: u128,   // min price (supply=0 or t=end_block)
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

program fairdrop_lbp_v3.aleo {
    // Upgrade governance: 3-of-5 multi-sig must call fairdrop_multisig_v2.aleo::approve_upgrade
    // with contract_key=8field and this program's compiled checksum before deployment.
    @checksum(mapping="fairdrop_multisig_v2.aleo::approved_upgrades", key="8field")
    constructor() {}

    // =========================================================================
    // Constants
    // =========================================================================

    const CREDITS_RESERVED_TOKEN_ID: field =
        3443843282313283355522573239085696902919850365217539366784739393210722344986field;

    const SUPPLY_MANAGER_ROLE: u8 = 3u8;

    // Distinguishes LBP auction_ids from all other auction programs.
    // Dutch=1field, Ascending=2field, Sealed=3field, Raise=4field, LBP=5field.
    const PROGRAM_SALT: field = 5field;

    // Burn address — all-zeros Aleo address. Used to guard lp_recipient in seed_liquidity.
    const ZERO_ADDRESS: address = aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc;

    // Fixed-point precision denominator for supply_fraction and time_fraction.
    // Chosen so price_spread * PRECISION ≤ 1e18 * 1e6 = 1e24 (well within u128).
    const PRECISION: u128 = 1_000_000u128;

    // =========================================================================
    // Records
    // =========================================================================

    // Private bid receipt. Stores max_bid_price (bidder's ceiling) for analytics.
    record LBPBid {
        owner:          address,
        auction_id:     field,
        quantity:       u128,
        payment_amount: u128,
        max_bid_price:  u128,   // price ceiling set by bidder; finalize fills at computed_price ≤ this
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

    mapping auction_index: u64 => field;

    mapping creator_auction_count:   address => u64;
    mapping creator_latest_auction:  address => field;
    mapping auction_prev_by_creator: field   => field;

    mapping creator_nonces: address => u64;

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
    // Burns `supply` tokens from creator's private Token record.
    // CPIs: burn_private, transfer_public_as_signer (creation_fee),
    //       assert_config (D16), register_gate.

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
        public metadata_hash:  field,
        public lbp:            LbpParams,
        public gate:           GateParams,
        public vest:           VestParams,
        public snapshot:       ConfigSnapshot,
    ) -> (token_registry.aleo::Token, Final) {
        assert(supply > 0u128);
        assert_eq(token.token_id, sale_token_id);
        assert_eq(token.amount, supply);

        let the_signer: address = self.signer;

        let auction_id: field = BHP256::hash_to_field(AuctionKey {
            creator:      self.signer,
            nonce:        nonce,
            program_salt: PROGRAM_SALT,
        });

        let (remainder, f_burn): (token_registry.aleo::Token, Final) =
            token_registry.aleo::burn_private(token, supply);

        let f_creation: Final =
            credits.aleo::transfer_public_as_signer(self.address, snapshot.creation_fee as u64);

        let f_cfg: Final = fairdrop_config_v3.aleo::assert_config(
            snapshot.fee_bps,
            snapshot.creation_fee,
            snapshot.closer_reward,
            snapshot.slash_reward_bps,
            snapshot.referral_pool_bps,
            start_block,
            end_block,
        );

        let f_gate: Final = fairdrop_gate_v3.aleo::register_gate(
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
            start_price:        lbp.start_price,
            floor_price:        lbp.floor_price,
            start_block:        start_block,
            end_block:          end_block,
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

        return (remainder, final {
            f_burn.run();
            f_creation.run();
            f_cfg.run();
            f_gate.run();

            assert(!fairdrop_config_v3.aleo::paused.get_or_use(0field, false) && !paused.get_or_use(0field, false));

            assert_eq(config.payment_token_id, CREDITS_RESERVED_TOKEN_ID);
            assert(config.sale_token_id != CREDITS_RESERVED_TOKEN_ID);
            assert(config.start_block >= block.height);
            // total_duration must be > 0 for time_fraction denominator.
            assert(config.end_block > config.start_block);
            assert(config.floor_price > 0u128);
            assert(config.start_price > config.floor_price);
            assert(config.min_bid_amount > 0u128);
            assert(config.max_bid_amount == 0u128 || config.max_bid_amount >= config.min_bid_amount);

            assert_eq(nonce, creator_nonces.get_or_use(the_signer, 0u64));

            let expected_id: field = BHP256::hash_to_field(AuctionKey {
                creator:      the_signer,
                nonce:        nonce,
                program_salt: PROGRAM_SALT,
            });
            assert_eq(auction_id, expected_id);
            assert_eq(config.auction_id, auction_id);

            let lbp_role_key: field = BHP256::hash_to_field(TokenOwner {
                account:  fairdrop_lbp_v3.aleo,
                token_id: config.sale_token_id,
            });
            assert_eq(
                token_registry.aleo::roles.get_or_use(lbp_role_key, 0u8),
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

            let treasury: u128 = protocol_treasury.get_or_use(0field, 0u128);
            protocol_treasury.set(0field, treasury + snapshot.creation_fee);

            let count: u64 = creator_auction_count.get_or_use(the_signer, 0u64);
            let prev: field  = creator_latest_auction.get_or_use(the_signer, 0field);
            creator_auction_count.set(the_signer, count + 1u64);
            creator_latest_auction.set(the_signer, auction_id);
            auction_prev_by_creator.set(auction_id, prev);

            let s: Stats = stats.get_or_use(0field, Stats {
                total_auctions: 0u64, total_bids: 0u64, total_payment_collected: 0u128
            });
            let idx: u64 = s.total_auctions;
            stats.set(0field, Stats {
                total_auctions: idx + 1u64, total_bids: s.total_bids, total_payment_collected: s.total_payment_collected
            });
            auction_index.set(idx, auction_id);
            creator_nonces.set(the_signer, nonce + 1u64);
        });
    }

    // =========================================================================
    // 2. place_bid_private — private credits record
    // =========================================================================
    //
    // max_bid_price: bidder's acceptable price ceiling. Finalize computes current_price
    // and asserts computed_price <= max_bid_price. Price only falls in LBP so concurrent
    // bids never cause a false rejection; only stale-block staleness can fail this check.

    fn place_bid_private(
        payment:                credits.aleo::credits,
        public auction_id:      field,
        public quantity:        u128,
        public payment_amount:  u64,
        public max_bid_price:   u128,   // slippage guard: finalize asserts computed_price <= this
    ) -> (credits.aleo::credits, LBPBid, fairdrop_proof_v3.aleo::ParticipationReceipt, Final) {
        assert(quantity > 0u128);
        assert(payment_amount > 0u64);

        let bidder_key: field = BHP256::hash_to_field(BidderKey {
            bidder:     self.signer,
            auction_id: auction_id,
        });

        let (change, f_credits): (credits.aleo::credits, Final) =
            credits.aleo::transfer_private_to_public(payment, self.address, payment_amount);

        let f_gate: Final = fairdrop_gate_v3.aleo::check_admission(auction_id);

        let (receipt, f_proof): (fairdrop_proof_v3.aleo::ParticipationReceipt, Final) =
            fairdrop_proof_v3.aleo::issue_receipt(auction_id, 0field, bidder_key);

        let bid: LBPBid = LBPBid {
            owner:          self.signer,
            auction_id:     auction_id,
            quantity:       quantity,
            payment_amount: payment_amount as u128,
            max_bid_price:  max_bid_price,
        };

        return (change, bid, receipt, final {
            f_credits.run();
            f_gate.run();
            f_proof.run();
            assert(!fairdrop_config_v3.aleo::paused.get_or_use(0field, false) && !paused.get_or_use(0field, false));
            // ── LBP bid validation and state updates ─────────────────────────────
            let config: AuctionConfig = auction_configs.get(auction_id);
            let state:  AuctionState  = auction_states.get(auction_id);
            assert(!state.supply_met);
            assert(!state.cleared);
            assert(!state.voided);
            assert(block.height >= config.start_block);
            assert(block.height <  config.end_block);
            // Re-derive LBP price from current state and enforce slippage guard.
            let remaining: u128      = config.supply - state.total_committed;
            let time_rem: u128       = (config.end_block - block.height) as u128;
            let total_dur: u128      = (config.end_block - config.start_block) as u128;
            let supply_frac: u128    = remaining * PRECISION / config.supply;
            let time_frac: u128      = time_rem * PRECISION / total_dur;
            let price_spread: u128   = config.start_price - config.floor_price;
            let spread_sf: u128      = price_spread * supply_frac / PRECISION;
            let computed_price: u128 = config.floor_price + spread_sf * time_frac / PRECISION;
            assert(computed_price <= max_bid_price);
            // Payment must cover the bid at the actual fill price.
            assert(payment_amount as u128 * config.sale_scale >= quantity * computed_price);
            assert(quantity >= config.min_bid_amount);
            let new_committed: u128    = state.total_committed + quantity;
            assert(new_committed <= config.supply);
            let current_total: u128    = bid_totals.get_or_use(bidder_key, 0u128);
            let new_bidder_total: u128 = current_total + quantity;
            let within_limit: bool = config.max_bid_amount == 0u128
                || new_bidder_total <= config.max_bid_amount;
            assert(within_limit);
            bid_totals.set(bidder_key, new_bidder_total);
            let is_supply_met: bool = new_committed >= config.supply;
            auction_states.set(auction_id, AuctionState {
                total_committed: new_committed,
                total_payments:  state.total_payments + payment_amount as u128,
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
            escrow_payments.set(auction_id, escrow + payment_amount as u128);
            let s: Stats = stats.get_or_use(0field, Stats {
                total_auctions: 0u64, total_bids: 0u64, total_payment_collected: 0u128
            });
            stats.set(0field, Stats {
                total_auctions:          s.total_auctions,
                total_bids:              s.total_bids + 1u64,
                total_payment_collected: s.total_payment_collected + payment_amount as u128,
            });
            // ─────────────────────────────────────────────────────────────────────
        });
    }

    // =========================================================================
    // 3. place_bid_public — public credits balance
    // =========================================================================

    fn place_bid_public(
        public auction_id:     field,
        public quantity:       u128,
        public payment_amount:  u64,
        public max_bid_price:   u128,   // slippage guard: finalize asserts computed_price <= this
    ) -> (LBPBid, fairdrop_proof_v3.aleo::ParticipationReceipt, Final) {
        assert(quantity > 0u128);
        assert(payment_amount > 0u64);

        let bidder_key: field = BHP256::hash_to_field(BidderKey {
            bidder:     self.signer,
            auction_id: auction_id,
        });

        let f_credits: Final =
            credits.aleo::transfer_public_as_signer(self.address, payment_amount);

        let f_gate: Final = fairdrop_gate_v3.aleo::check_admission(auction_id);

        let (receipt, f_proof): (fairdrop_proof_v3.aleo::ParticipationReceipt, Final) =
            fairdrop_proof_v3.aleo::issue_receipt(auction_id, 0field, bidder_key);

        let bid: LBPBid = LBPBid {
            owner:          self.signer,
            auction_id:     auction_id,
            quantity:       quantity,
            payment_amount: payment_amount as u128,
            max_bid_price:  max_bid_price,
        };

        return (bid, receipt, final {
            f_credits.run();
            f_gate.run();
            f_proof.run();
            assert(!fairdrop_config_v3.aleo::paused.get_or_use(0field, false) && !paused.get_or_use(0field, false));
            // ── LBP bid validation and state updates ─────────────────────────────
            let config: AuctionConfig = auction_configs.get(auction_id);
            let state:  AuctionState  = auction_states.get(auction_id);
            assert(!state.supply_met);
            assert(!state.cleared);
            assert(!state.voided);
            assert(block.height >= config.start_block);
            assert(block.height <  config.end_block);
            let remaining: u128      = config.supply - state.total_committed;
            let time_rem: u128       = (config.end_block - block.height) as u128;
            let total_dur: u128      = (config.end_block - config.start_block) as u128;
            let supply_frac: u128    = remaining * PRECISION / config.supply;
            let time_frac: u128      = time_rem * PRECISION / total_dur;
            let price_spread: u128   = config.start_price - config.floor_price;
            let spread_sf: u128      = price_spread * supply_frac / PRECISION;
            let computed_price: u128 = config.floor_price + spread_sf * time_frac / PRECISION;
            assert(computed_price <= max_bid_price);
            assert(payment_amount as u128 * config.sale_scale >= quantity * computed_price);
            assert(quantity >= config.min_bid_amount);
            let new_committed: u128    = state.total_committed + quantity;
            assert(new_committed <= config.supply);
            let current_total: u128    = bid_totals.get_or_use(bidder_key, 0u128);
            let new_bidder_total: u128 = current_total + quantity;
            let within_limit: bool = config.max_bid_amount == 0u128
                || new_bidder_total <= config.max_bid_amount;
            assert(within_limit);
            bid_totals.set(bidder_key, new_bidder_total);
            let is_supply_met: bool = new_committed >= config.supply;
            auction_states.set(auction_id, AuctionState {
                total_committed: new_committed,
                total_payments:  state.total_payments + payment_amount as u128,
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
            escrow_payments.set(auction_id, escrow + payment_amount as u128);
            let s: Stats = stats.get_or_use(0field, Stats {
                total_auctions: 0u64, total_bids: 0u64, total_payment_collected: 0u128
            });
            stats.set(0field, Stats {
                total_auctions:          s.total_auctions,
                total_bids:              s.total_bids + 1u64,
                total_payment_collected: s.total_payment_collected + payment_amount as u128,
            });
            // ─────────────────────────────────────────────────────────────────────
        });
    }

    // =========================================================================
    // 4. place_bid_private_ref — private credits + referral code
    // =========================================================================

    fn place_bid_private_ref(
        payment:               credits.aleo::credits,
        public auction_id:     field,
        public quantity:       u128,
        public payment_amount:  u64,
        public max_bid_price:   u128,   // slippage guard: finalize asserts computed_price <= this
        public code_id:         field,
    ) -> (credits.aleo::credits, LBPBid, fairdrop_proof_v3.aleo::ParticipationReceipt, Final) {
        assert(quantity > 0u128);
        assert(payment_amount > 0u64);

        let bidder_key: field = BHP256::hash_to_field(BidderKey {
            bidder:     self.signer,
            auction_id: auction_id,
        });

        let (change, f_credits): (credits.aleo::credits, Final) =
            credits.aleo::transfer_private_to_public(payment, self.address, payment_amount);

        let f_gate: Final = fairdrop_gate_v3.aleo::check_admission(auction_id);

        let (receipt, f_proof): (fairdrop_proof_v3.aleo::ParticipationReceipt, Final) =
            fairdrop_proof_v3.aleo::issue_receipt(auction_id, 0field, bidder_key);

        let f_ref: Final = fairdrop_ref_v2.aleo::record_referral(
            code_id,
            auction_id,
            bidder_key,
            payment_amount as u128,
        );

        let bid: LBPBid = LBPBid {
            owner:          self.signer,
            auction_id:     auction_id,
            quantity:       quantity,
            payment_amount: payment_amount as u128,
            max_bid_price:  max_bid_price,
        };

        return (change, bid, receipt, final {
            f_credits.run();
            f_gate.run();
            f_proof.run();
            f_ref.run();
            assert(!fairdrop_config_v3.aleo::paused.get_or_use(0field, false) && !paused.get_or_use(0field, false));
            // ── LBP bid validation and state updates ─────────────────────────────
            let config: AuctionConfig = auction_configs.get(auction_id);
            let state:  AuctionState  = auction_states.get(auction_id);
            assert(!state.supply_met);
            assert(!state.cleared);
            assert(!state.voided);
            assert(block.height >= config.start_block);
            assert(block.height <  config.end_block);
            let remaining: u128      = config.supply - state.total_committed;
            let time_rem: u128       = (config.end_block - block.height) as u128;
            let total_dur: u128      = (config.end_block - config.start_block) as u128;
            let supply_frac: u128    = remaining * PRECISION / config.supply;
            let time_frac: u128      = time_rem * PRECISION / total_dur;
            let price_spread: u128   = config.start_price - config.floor_price;
            let spread_sf: u128      = price_spread * supply_frac / PRECISION;
            let computed_price: u128 = config.floor_price + spread_sf * time_frac / PRECISION;
            assert(computed_price <= max_bid_price);
            assert(payment_amount as u128 * config.sale_scale >= quantity * computed_price);
            assert(quantity >= config.min_bid_amount);
            let new_committed: u128    = state.total_committed + quantity;
            assert(new_committed <= config.supply);
            let current_total: u128    = bid_totals.get_or_use(bidder_key, 0u128);
            let new_bidder_total: u128 = current_total + quantity;
            let within_limit: bool = config.max_bid_amount == 0u128
                || new_bidder_total <= config.max_bid_amount;
            assert(within_limit);
            bid_totals.set(bidder_key, new_bidder_total);
            let is_supply_met: bool = new_committed >= config.supply;
            auction_states.set(auction_id, AuctionState {
                total_committed: new_committed,
                total_payments:  state.total_payments + payment_amount as u128,
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
            escrow_payments.set(auction_id, escrow + payment_amount as u128);
            let s: Stats = stats.get_or_use(0field, Stats {
                total_auctions: 0u64, total_bids: 0u64, total_payment_collected: 0u128
            });
            stats.set(0field, Stats {
                total_auctions:          s.total_auctions,
                total_bids:              s.total_bids + 1u64,
                total_payment_collected: s.total_payment_collected + payment_amount as u128,
            });
            // ─────────────────────────────────────────────────────────────────────
        });
    }

    // =========================================================================
    // 5. place_bid_public_ref — public credits + referral code
    // =========================================================================

    fn place_bid_public_ref(
        public auction_id:     field,
        public quantity:       u128,
        public payment_amount:  u64,
        public max_bid_price:   u128,   // slippage guard: finalize asserts computed_price <= this
        public code_id:         field,
    ) -> (LBPBid, fairdrop_proof_v3.aleo::ParticipationReceipt, Final) {
        assert(quantity > 0u128);
        assert(payment_amount > 0u64);

        let bidder_key: field = BHP256::hash_to_field(BidderKey {
            bidder:     self.signer,
            auction_id: auction_id,
        });

        let f_credits: Final =
            credits.aleo::transfer_public_as_signer(self.address, payment_amount);

        let f_gate: Final = fairdrop_gate_v3.aleo::check_admission(auction_id);

        let (receipt, f_proof): (fairdrop_proof_v3.aleo::ParticipationReceipt, Final) =
            fairdrop_proof_v3.aleo::issue_receipt(auction_id, 0field, bidder_key);

        let f_ref: Final = fairdrop_ref_v2.aleo::record_referral(
            code_id,
            auction_id,
            bidder_key,
            payment_amount as u128,
        );

        let bid: LBPBid = LBPBid {
            owner:          self.signer,
            auction_id:     auction_id,
            quantity:       quantity,
            payment_amount: payment_amount as u128,
            max_bid_price:  max_bid_price,
        };

        return (bid, receipt, final {
            f_credits.run();
            f_gate.run();
            f_proof.run();
            f_ref.run();
            assert(!fairdrop_config_v3.aleo::paused.get_or_use(0field, false) && !paused.get_or_use(0field, false));
            // ── LBP bid validation and state updates ─────────────────────────────
            let config: AuctionConfig = auction_configs.get(auction_id);
            let state:  AuctionState  = auction_states.get(auction_id);
            assert(!state.supply_met);
            assert(!state.cleared);
            assert(!state.voided);
            assert(block.height >= config.start_block);
            assert(block.height <  config.end_block);
            let remaining: u128      = config.supply - state.total_committed;
            let time_rem: u128       = (config.end_block - block.height) as u128;
            let total_dur: u128      = (config.end_block - config.start_block) as u128;
            let supply_frac: u128    = remaining * PRECISION / config.supply;
            let time_frac: u128      = time_rem * PRECISION / total_dur;
            let price_spread: u128   = config.start_price - config.floor_price;
            let spread_sf: u128      = price_spread * supply_frac / PRECISION;
            let computed_price: u128 = config.floor_price + spread_sf * time_frac / PRECISION;
            assert(computed_price <= max_bid_price);
            assert(payment_amount as u128 * config.sale_scale >= quantity * computed_price);
            assert(quantity >= config.min_bid_amount);
            let new_committed: u128    = state.total_committed + quantity;
            assert(new_committed <= config.supply);
            let current_total: u128    = bid_totals.get_or_use(bidder_key, 0u128);
            let new_bidder_total: u128 = current_total + quantity;
            let within_limit: bool = config.max_bid_amount == 0u128
                || new_bidder_total <= config.max_bid_amount;
            assert(within_limit);
            bid_totals.set(bidder_key, new_bidder_total);
            let is_supply_met: bool = new_committed >= config.supply;
            auction_states.set(auction_id, AuctionState {
                total_committed: new_committed,
                total_payments:  state.total_payments + payment_amount as u128,
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
            escrow_payments.set(auction_id, escrow + payment_amount as u128);
            let s: Stats = stats.get_or_use(0field, Stats {
                total_auctions: 0u64, total_bids: 0u64, total_payment_collected: 0u128
            });
            stats.set(0field, Stats {
                total_auctions:          s.total_auctions,
                total_bids:              s.total_bids + 1u64,
                total_payment_collected: s.total_payment_collected + payment_amount as u128,
            });
            // ─────────────────────────────────────────────────────────────────────
        });
    }

    // =========================================================================
    // 6. close_auction — permissionless after supply_met or end_block
    // =========================================================================
    //
    // Revenue is on total_payments (pay-what-you-bid; no clearing price refund).
    // Closer reward paid from protocol treasury. D12: CPI to proof for reputation.

    fn close_auction(
        public auction_id:    field,
        public creator:       address,
        public filled:        bool,
        public volume:        u128,
        public closer_reward: u128,
    ) -> Final {
        let the_signer: address = self.signer;

        let f_closer: Final =
            credits.aleo::transfer_public(self.signer, closer_reward as u64);

        let f_proof: Final =
            fairdrop_proof_v3.aleo::update_reputation(creator, filled, volume);

        return final {
            f_closer.run();
            f_proof.run();
            assert(!fairdrop_config_v3.aleo::paused.get_or_use(0field, false) && !paused.get_or_use(0field, false));

            let config: AuctionConfig = auction_configs.get(auction_id);
            let state:  AuctionState  = auction_states.get(auction_id);

            assert(!state.cleared);
            assert(!state.voided);
            assert(state.supply_met || block.height >= config.end_block);

            assert_eq(creator,       config.creator);
            assert_eq(filled,        state.supply_met);
            assert_eq(volume,        state.total_payments);
            assert_eq(closer_reward, config.closer_reward);

            let treasury: u128 = protocol_treasury.get_or_use(0field, 0u128);
            assert(treasury >= closer_reward);

            let ended_block: u32 = state.supply_met ? state.ended_at_block : config.end_block;

            // Revenue accounting on total_payments (pay-what-you-bid; no clearing price).
            let total_cost: u128      = state.total_payments;
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
                clearing_price:  0u128,
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
    // 8. claim — redeem LBPBid record (non-vesting auctions)
    // =========================================================================
    //
    // No clearing-price refund: bidders paid their bid-time price.

    fn claim(
        bid:                  LBPBid,
        public sale_token_id: field,
    ) -> (token_registry.aleo::Token, Final) {
        let sale_amount: u128  = bid.quantity;
        let bid_owner: address = bid.owner;
        let bid_auction_id: field = bid.auction_id;

        let (sale_token, f_mint): (token_registry.aleo::Token, Final) =
            token_registry.aleo::mint_private(
                sale_token_id,
                bid.owner,
                sale_amount,
                false,
                4294967295u32,
            );

        return (sale_token, final {
            f_mint.run();
            assert(!fairdrop_config_v3.aleo::paused.get_or_use(0field, false) && !paused.get_or_use(0field, false));

            let config: AuctionConfig = auction_configs.get(bid_auction_id);
            let state:  AuctionState  = auction_states.get(bid_auction_id);

            assert(state.cleared);
            assert(!state.voided);
            assert(!config.vest_enabled);
            assert_eq(sale_token_id, config.sale_token_id);

            let sale_remaining: u128 = escrow_sales.get(bid_auction_id);
            assert(sale_amount <= sale_remaining);
            escrow_sales.set(bid_auction_id, sale_remaining - sale_amount);
        });
    }

    // =========================================================================
    // 9. claim_vested — redeem LBPBid record (vest_enabled auctions)
    // =========================================================================

    fn claim_vested(
        bid:                    LBPBid,
        public sale_token_id:   field,
        public ended_at_block:  u32,
        public cliff_blocks:    u32,
        public vest_end_blocks: u32,
    ) -> (fairdrop_vest_v2.aleo::VestedAllocation, Final) {
        let sale_amount: u128     = bid.quantity;
        let bid_auction_id: field = bid.auction_id;
        let bid_owner: address    = bid.owner;

        let (vest, f_vest): (fairdrop_vest_v2.aleo::VestedAllocation, Final) =
            fairdrop_vest_v2.aleo::create_vest(
                bid.auction_id,
                bid.owner,
                sale_token_id,
                sale_amount,
                ended_at_block,
                cliff_blocks,
                vest_end_blocks,
            );

        return (vest, final {
            f_vest.run();
            assert(!fairdrop_config_v3.aleo::paused.get_or_use(0field, false) && !paused.get_or_use(0field, false));

            let config: AuctionConfig = auction_configs.get(bid_auction_id);
            let state:  AuctionState  = auction_states.get(bid_auction_id);

            assert(state.cleared);
            assert(!state.voided);
            assert(config.vest_enabled);
            assert_eq(sale_token_id,  config.sale_token_id);
            assert_eq(ended_at_block,  state.ended_at_block);
            assert_eq(cliff_blocks,    config.vest_cliff_blocks);
            assert_eq(vest_end_blocks, config.vest_end_blocks);

            let sale_remaining: u128 = escrow_sales.get(bid_auction_id);
            assert(sale_amount <= sale_remaining);
            escrow_sales.set(bid_auction_id, sale_remaining - sale_amount);
        });
    }

    // =========================================================================
    // 10. withdraw_payments — creator withdraws revenue after close
    // =========================================================================

    fn withdraw_payments(
        public auction_id: field,
        public amount:     u128,
        public recipient:  address,
    ) -> Final {
        assert(amount > 0u128);
        let the_signer: address = self.signer;
        let f0: Final = credits.aleo::transfer_public(recipient, amount as u64);
        return final {
            f0.run();
            assert(!fairdrop_config_v3.aleo::paused.get_or_use(0field, false) && !paused.get_or_use(0field, false));

            let config: AuctionConfig = auction_configs.get(auction_id);
            let state:  AuctionState  = auction_states.get(auction_id);

            assert(state.cleared);
            assert(!state.voided);
            assert_eq(the_signer, config.creator);

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

    fn withdraw_unsold(
        public auction_id:    field,
        public amount:        u128,
        public sale_token_id: field,
        public recipient:     address,
    ) -> (token_registry.aleo::Token, Final) {
        assert(amount > 0u128);
        let the_signer: address = self.signer;

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
            assert(!fairdrop_config_v3.aleo::paused.get_or_use(0field, false) && !paused.get_or_use(0field, false));

            let config: AuctionConfig = auction_configs.get(auction_id);
            let state:  AuctionState  = auction_states.get(auction_id);

            assert(state.cleared);
            assert(!state.voided);
            assert_eq(the_signer,    config.creator);
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

    fn cancel_auction(
        public auction_id:    field,
        public sale_token_id: field,
        public supply:        u128,
    ) -> (token_registry.aleo::Token, Final) {
        let the_signer: address = self.signer;

        let (token, f_mint): (token_registry.aleo::Token, Final) =
            token_registry.aleo::mint_private(
                sale_token_id,
                self.signer,
                supply,
                false,
                4294967295u32,
            );

        return (token, final {
            f_mint.run();
            assert(!fairdrop_config_v3.aleo::paused.get_or_use(0field, false) && !paused.get_or_use(0field, false));

            let config: AuctionConfig = auction_configs.get(auction_id);
            let state:  AuctionState  = auction_states.get(auction_id);

            assert_eq(the_signer,    config.creator);
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
    // 13. claim_voided — bidder recovers payment from a voided auction
    // =========================================================================
    //
    // No paused check — emergency pause must not trap bidder capital.

    fn claim_voided(
        bid: LBPBid,
    ) -> (credits.aleo::credits, Final) {
        let bid_auction_id: field     = bid.auction_id;
        let bid_payment_amount: u128  = bid.payment_amount;

        let (refund, f_refund): (credits.aleo::credits, Final) =
            credits.aleo::transfer_public_to_private(bid.owner, bid.payment_amount as u64);

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
