// fairdrop_quadratic_v3.aleo — Privacy-preserving quadratic allocation auction.
//
// Mechanism: bidders pay any amount ≥ min_bid_amount. Allocation is proportional
// to the square root of payment, not the payment itself. A bidder with 100× your
// budget receives only 10× your tokens. Anti-whale by design.
//
// Core formula:
//   contribution_weight = approx_sqrt(payment_amount)   // computed at bid time
//   total_sqrt_weight  += contribution_weight            // accumulated in mapping
//
//   At claim (after close_auction):
//   actual_quantity = supply * bid.contribution_weight / state_total_sqrt_weight
//
// approx_sqrt implementation: Newton-Raphson, 64 unrolled iterations.
// Starting estimate: 2^33 (= 8_589_934_592) — strict overestimate of sqrt(u64_max).
// Converges to floor(sqrt(n)) for all n in u64 range.
//
// Sybil note: splitting P across N accounts produces N × sqrt(P/N) = sqrt(N) × sqrt(P),
// which is MORE weight than a single sqrt(P). Mitigation: combine with ZK credential
// gating (gate_mode = 2) to enforce one-credential-per-identity.
//
// Success / void:
//   Auction always runs to end_block (no supply_met early close).
//   Cleared when total_payments >= raise_target at close.
//   Voided when total_payments < raise_target at close.
//   Voided auctions: bidders recover credits via claim_voided.
//                    Creator reclaims supply via withdraw_unsold.
//
// Payment token : credits.aleo — private record OR public balance.
// Sale tokens   : token_registry.aleo::Token. Burned at create, re-minted at claim.
//
// Roles required:
//   fairdrop_quadratic_v3.aleo — SUPPLY_MANAGER_ROLE on sale token (burn + mint).
//   fairdrop_vest_v3.aleo      — SUPPLY_MANAGER_ROLE on sale token (mint at release),
//                             required only when vest_enabled = true.
//
// Revenue accounting (set at close_auction, cleared case only):
//   protocol_fee    = total_payments * fee_bps / 10000
//   creator_revenue = total_payments - protocol_fee
//   referral_budget = protocol_fee * referral_pool_bps / 10000
//   treasury_credit = protocol_fee - referral_budget - closer_reward
//
//   Void case: no revenue computed. Bidders recover via claim_voided.
//
// Auction ID derivation:
//   auction_id = BHP256(AuctionKey { creator, nonce, PROGRAM_SALT = 6field })
//
// Privacy model:
//   - Bid payment amount     : public (unavoidable — on-chain escrow accounting).
//   - Contribution weight    : public (sqrt(payment); inferrable from payment anyway).
//   - Allocation amount      : private — computed from QuadraticBid record at claim.
//   - Bid source             : hidden for place_bid_private (private UTXO consumed).
//   - Bidder identity        : pseudonymous — only BHP256(bidder, auction_id) on-chain.
//   - Token recipients       : private (mint_private).
//
// Pause model:
//   All finalizes except claim_voided assert !fairdrop_config.paused.
//   claim_voided is pause-exempt — bidders must always be able to recover funds.
//
// Lifecycle:
//   create_auction → place_bid_* → close_auction → [push_referral_budget] →
//   claim / claim_vested → withdraw_payments + withdraw_unsold
//   OR: cancel_auction → claim_voided (escape hatch)
//   OR: close_auction (voided) → claim_voided + withdraw_unsold

// ── Leo 4.0 migration notes ───────────────────────────────────────────────────
//   async constructor → constructor
//   async transition  → fn; async function finalize_* → deleted, inlined as final {}
//   self.signer captured before final {} where needed
//   record fields captured before final {} in claim, claim_vested, claim_voided
//   structs moved outside program {}
//   Future → Final, .aleo/ → .aleo::
// ─────────────────────────────────────────────────────────────────────────────

import fairdrop_multisig_v2.aleo;
import credits.aleo;
import wrapped_credits.aleo;
import token_registry.aleo;
import fairdrop_config_v3.aleo;
import fairdrop_gate_v3.aleo;
import fairdrop_proof_v3.aleo;
import fairdrop_ref_v3.aleo;
import fairdrop_vest_v3.aleo;
import fairswap_dex_v3.aleo;

// =========================================================================
// Structs (module-level — moved outside program {} per Leo 4.0)
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
    supply:             u128,     // total tokens to distribute
    raise_target:       u128,     // minimum total credits for success; must be > 0
    start_block:        u32,
    end_block:          u32,
    max_bid_amount:     u128,     // max cumulative payment per bidder; 0 = no cap
    min_bid_amount:     u128,     // minimum payment per bid
    sale_scale:         u128,     // 10^sale_token_decimals (for display; unused in pricing)
    gate_mode:          u8,       // 0=open 1=merkle 2=credential (credential recommended)
    vest_enabled:       bool,
    vest_cliff_blocks:  u32,
    vest_end_blocks:    u32,
    fee_bps:            u16,      // D16: snapshotted from fairdrop_config at create
    closer_reward:      u128,     // D16: snapshotted from fairdrop_config at create
    referral_pool_bps:  u16,      // D16: snapshotted from fairdrop_config at create
    metadata_hash:      field,    // BHP256 of off-chain metadata JSON. 0field = no metadata.
    fill_min_bps:       u16,      // minimum fill to succeed (e.g. 7000 = 70%). 0 = disabled (100% required).
}

struct AuctionState {
    total_committed: u128,  // 0 during bids; effective_supply when cleared; 0 when voided
    total_payments:  u128,  // cumulative bidder credits locked
    supply_met:      bool,  // always false during bid phase; reserved
    ended_at_block:  u32,   // config.end_block at close
    cleared:         bool,
    clearing_price:  u128,  // always 0 for quadratic (pay-what-you-bid)
    creator_revenue: u128,
    protocol_fee:    u128,
    voided:          bool,
    referral_budget: u128,
    effective_supply: u128, // actual tokens to distribute at close; < supply for partial fill; 0 until cleared
}

struct Stats {
    total_auctions:          u64,
    total_bids:              u64,
    total_payment_collected: u128,
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

// Newton-Raphson integer sqrt — 65 unrolled iterations from 2^33.
// Converges to floor(sqrt(n)) for all n in the u64 value range.
// Starting estimate 8_589_934_592 = 2^33 is a strict overestimate of sqrt(u64_max).
fn approx_sqrt(n: u128) -> u128 {
    let s0:  u128 = 8_589_934_592u128;
    let s1:  u128 = (s0  + n / s0)  / 2u128;
    let s2:  u128 = (s1  + n / s1)  / 2u128;
    let s3:  u128 = (s2  + n / s2)  / 2u128;
    let s4:  u128 = (s3  + n / s3)  / 2u128;
    let s5:  u128 = (s4  + n / s4)  / 2u128;
    let s6:  u128 = (s5  + n / s5)  / 2u128;
    let s7:  u128 = (s6  + n / s6)  / 2u128;
    let s8:  u128 = (s7  + n / s7)  / 2u128;
    let s9:  u128 = (s8  + n / s8)  / 2u128;
    let s10: u128 = (s9  + n / s9)  / 2u128;
    let s11: u128 = (s10 + n / s10) / 2u128;
    let s12: u128 = (s11 + n / s11) / 2u128;
    let s13: u128 = (s12 + n / s12) / 2u128;
    let s14: u128 = (s13 + n / s13) / 2u128;
    let s15: u128 = (s14 + n / s14) / 2u128;
    let s16: u128 = (s15 + n / s15) / 2u128;
    let s17: u128 = (s16 + n / s16) / 2u128;
    let s18: u128 = (s17 + n / s17) / 2u128;
    let s19: u128 = (s18 + n / s18) / 2u128;
    let s20: u128 = (s19 + n / s19) / 2u128;
    let s21: u128 = (s20 + n / s20) / 2u128;
    let s22: u128 = (s21 + n / s21) / 2u128;
    let s23: u128 = (s22 + n / s22) / 2u128;
    let s24: u128 = (s23 + n / s23) / 2u128;
    let s25: u128 = (s24 + n / s24) / 2u128;
    let s26: u128 = (s25 + n / s25) / 2u128;
    let s27: u128 = (s26 + n / s26) / 2u128;
    let s28: u128 = (s27 + n / s27) / 2u128;
    let s29: u128 = (s28 + n / s28) / 2u128;
    let s30: u128 = (s29 + n / s29) / 2u128;
    let s31: u128 = (s30 + n / s30) / 2u128;
    let s32: u128 = (s31 + n / s31) / 2u128;
    let s33: u128 = (s32 + n / s32) / 2u128;
    let s34: u128 = (s33 + n / s33) / 2u128;
    let s35: u128 = (s34 + n / s34) / 2u128;
    let s36: u128 = (s35 + n / s35) / 2u128;
    let s37: u128 = (s36 + n / s36) / 2u128;
    let s38: u128 = (s37 + n / s37) / 2u128;
    let s39: u128 = (s38 + n / s38) / 2u128;
    let s40: u128 = (s39 + n / s39) / 2u128;
    let s41: u128 = (s40 + n / s40) / 2u128;
    let s42: u128 = (s41 + n / s41) / 2u128;
    let s43: u128 = (s42 + n / s42) / 2u128;
    let s44: u128 = (s43 + n / s43) / 2u128;
    let s45: u128 = (s44 + n / s44) / 2u128;
    let s46: u128 = (s45 + n / s45) / 2u128;
    let s47: u128 = (s46 + n / s46) / 2u128;
    let s48: u128 = (s47 + n / s47) / 2u128;
    let s49: u128 = (s48 + n / s48) / 2u128;
    let s50: u128 = (s49 + n / s49) / 2u128;
    let s51: u128 = (s50 + n / s50) / 2u128;
    let s52: u128 = (s51 + n / s51) / 2u128;
    let s53: u128 = (s52 + n / s52) / 2u128;
    let s54: u128 = (s53 + n / s53) / 2u128;
    let s55: u128 = (s54 + n / s54) / 2u128;
    let s56: u128 = (s55 + n / s55) / 2u128;
    let s57: u128 = (s56 + n / s56) / 2u128;
    let s58: u128 = (s57 + n / s57) / 2u128;
    let s59: u128 = (s58 + n / s58) / 2u128;
    let s60: u128 = (s59 + n / s59) / 2u128;
    let s61: u128 = (s60 + n / s60) / 2u128;
    let s62: u128 = (s61 + n / s61) / 2u128;
    let s63: u128 = (s62 + n / s62) / 2u128;
    return (s63 + n / s63) / 2u128;
}

program fairdrop_quadratic_v3.aleo {
    // Upgrade governance: 3-of-5 multi-sig must call fairdrop_multisig_v2.aleo::approve_upgrade
    // with contract_key=9field and this program's compiled checksum before deployment.
    @checksum(mapping="fairdrop_multisig_v2.aleo::approved_upgrades", key="9field")
    constructor() {}

    // =========================================================================
    // Constants
    // =========================================================================

    const CREDITS_RESERVED_TOKEN_ID: field =
        3443843282313283355522573239085696902919850365217539366784739393210722344986field;

    const SUPPLY_MANAGER_ROLE: u8 = 3u8;

    // Dutch=1field, Ascending=2field, Sealed=3field, Raise=4field, LBP=5field, Quadratic=6field.
    const PROGRAM_SALT: field = 6field;

    // Burn address — all-zeros Aleo address. Used to guard lp_recipient in seed_liquidity.
    const ZERO_ADDRESS: address = aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc;

    // =========================================================================
    // Records
    // =========================================================================

    // Private bid receipt. contribution_weight = approx_sqrt(payment_amount).
    // Stored in record so claim does not need to recompute sqrt.
    record QuadraticBid {
        owner:               address,
        auction_id:          field,
        payment_amount:      u128,
        contribution_weight: u128,  // approx_sqrt(payment_amount)
    }

    // =========================================================================
    // Mappings
    // =========================================================================

    mapping auction_configs:  field => AuctionConfig;
    mapping auction_states:   field => AuctionState;

    // BHP256(BidderKey) → cumulative payment. Enforces max_bid_amount per bidder.
    mapping bid_totals: field => u128;

    // Accumulated sqrt weights per auction. Final value used at claim.
    mapping sqrt_weights: field => u128;

    // Burn-backed mint budget; decremented at claim / withdraw_unsold.
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

    fn create_auction(
        token:                 token_registry.aleo::Token,
        public sale_token_id:  field,
        public supply:         u128,
        public raise_target:   u128,   // minimum credits for success
        public start_block:    u32,
        public end_block:      u32,
        public max_bid_amount: u128,   // 0 = no per-bidder cap
        public min_bid_amount: u128,
        public sale_scale:     u128,
        public nonce:          u64,    // D11: creator_nonces[creator]
        public metadata_hash:  field,
        public fill_min_bps:   u16,    // minimum fill threshold; 0 = disabled (100% required)
        public gate:           GateParams,
        public vest:           VestParams,
        public snapshot:       ConfigSnapshot,
    ) -> (token_registry.aleo::Token, Final) {
        assert(supply > 0u128);
        assert(raise_target > 0u128);
        assert_eq(token.token_id, sale_token_id);
        assert_eq(token.amount, supply);

        let signer: address = self.signer;

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
            raise_target:       raise_target,
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
            fill_min_bps:       fill_min_bps,
        };

        let creation_fee: u128 = snapshot.creation_fee;

        return (remainder, final {
            assert(!fairdrop_config_v3.aleo::paused.get_or_use(0field, false) && !paused.get_or_use(0field, false));
            f_burn.run();
            f_creation.run();
            f_cfg.run();
            f_gate.run();

            assert_eq(config.payment_token_id, CREDITS_RESERVED_TOKEN_ID);
            assert(config.sale_token_id != CREDITS_RESERVED_TOKEN_ID);
            assert(config.start_block >= block.height);
            assert(config.raise_target > 0u128);
            assert(config.min_bid_amount > 0u128);
            assert(config.max_bid_amount == 0u128 || config.max_bid_amount >= config.min_bid_amount);
            assert(config.fill_min_bps <= 10000u16);

            assert_eq(nonce, creator_nonces.get_or_use(signer, 0u64));

            let expected_id: field = BHP256::hash_to_field(AuctionKey {
                creator:      signer,
                nonce:        nonce,
                program_salt: PROGRAM_SALT,
            });
            assert_eq(auction_id, expected_id);
            assert_eq(config.auction_id, auction_id);

            let quad_role_key: field = BHP256::hash_to_field(TokenOwner {
                account:  fairdrop_quadratic_v3.aleo,
                token_id: config.sale_token_id,
            });
            assert_eq(
                token_registry.aleo::roles.get_or_use(quad_role_key, 0u8),
                SUPPLY_MANAGER_ROLE
            );

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

            auction_configs.set(auction_id, config);
            auction_states.set(auction_id, AuctionState {
                total_committed:  0u128,
                total_payments:   0u128,
                supply_met:       false,
                ended_at_block:   0u32,
                cleared:          false,
                clearing_price:   0u128,
                creator_revenue:  0u128,
                protocol_fee:     0u128,
                voided:           false,
                referral_budget:  0u128,
                effective_supply: 0u128,
            });
            escrow_sales.set(auction_id, config.supply);
            sqrt_weights.set(auction_id, 0u128);

            let treasury: u128 = protocol_treasury.get_or_use(0field, 0u128);
            protocol_treasury.set(0field, treasury + creation_fee);

            let count: u64 = creator_auction_count.get_or_use(signer, 0u64);
            let prev: field  = creator_latest_auction.get_or_use(signer, 0field);
            creator_auction_count.set(signer, count + 1u64);
            creator_latest_auction.set(signer, auction_id);
            auction_prev_by_creator.set(auction_id, prev);

            let s: Stats = stats.get_or_use(0field, Stats {
                total_auctions: 0u64, total_bids: 0u64, total_payment_collected: 0u128
            });
            let idx: u64 = s.total_auctions;
            stats.set(0field, Stats {
                total_auctions: idx + 1u64, total_bids: s.total_bids, total_payment_collected: s.total_payment_collected
            });
            auction_index.set(idx, auction_id);
            creator_nonces.set(signer, nonce + 1u64);
        });
    }

    // =========================================================================
    // 2. place_bid_private — private credits record
    // =========================================================================
    //
    // contribution_weight = approx_sqrt(payment_amount) — see module-level fn.
    // Newton-Raphson 65 iterations from 2^33; converges to floor(sqrt(payment_amount)).

    fn place_bid_private(
        payment:               credits.aleo::credits,
        public auction_id:     field,
        public payment_amount: u64,
    ) -> (credits.aleo::credits, QuadraticBid, fairdrop_proof_v3.aleo::ParticipationReceipt, Final) {
        assert(payment_amount > 0u64);

        let bidder_key: field = BHP256::hash_to_field(BidderKey {
            bidder:     self.signer,
            auction_id: auction_id,
        });

        let contribution_weight: u128 = approx_sqrt(payment_amount as u128);

        let (change, f_credits): (credits.aleo::credits, Final) =
            credits.aleo::transfer_private_to_public(payment, self.address, payment_amount);

        let f_gate: Final = fairdrop_gate_v3.aleo::check_admission(auction_id);

        let (receipt, f_proof): (fairdrop_proof_v3.aleo::ParticipationReceipt, Final) =
            fairdrop_proof_v3.aleo::issue_receipt(auction_id, 0field, bidder_key);

        let bid: QuadraticBid = QuadraticBid {
            owner:               self.signer,
            auction_id:          auction_id,
            payment_amount:      payment_amount as u128,
            contribution_weight: contribution_weight,
        };

        let payment_amount_u128: u128 = payment_amount as u128;

        return (change, bid, receipt, final {
            assert(!fairdrop_config_v3.aleo::paused.get_or_use(0field, false) && !paused.get_or_use(0field, false));
            f_credits.run();
            f_gate.run();
            f_proof.run();
            // ── quadratic bid validation and state updates ────────────────────────
            let config: AuctionConfig = auction_configs.get(auction_id);
            let state:  AuctionState  = auction_states.get(auction_id);
            assert(!state.cleared);
            assert(!state.voided);
            assert(block.height >= config.start_block);
            assert(block.height <  config.end_block);
            assert(payment_amount_u128 >= config.min_bid_amount);
            let current_total: u128    = bid_totals.get_or_use(bidder_key, 0u128);
            let new_bidder_total: u128 = current_total + payment_amount_u128;
            let within_limit: bool = config.max_bid_amount == 0u128
                || new_bidder_total <= config.max_bid_amount;
            assert(within_limit);
            bid_totals.set(bidder_key, new_bidder_total);
            auction_states.set(auction_id, AuctionState {
                total_committed:  0u128,
                total_payments:   state.total_payments + payment_amount_u128,
                supply_met:       false,
                ended_at_block:   state.ended_at_block,
                cleared:          false,
                clearing_price:   0u128,
                creator_revenue:  0u128,
                protocol_fee:     0u128,
                voided:           false,
                referral_budget:  0u128,
                effective_supply: 0u128,
            });
            let escrow: u128 = escrow_payments.get_or_use(auction_id, 0u128);
            escrow_payments.set(auction_id, escrow + payment_amount_u128);
            let acc_weight: u128 = sqrt_weights.get_or_use(auction_id, 0u128);
            sqrt_weights.set(auction_id, acc_weight + contribution_weight);
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
    // 3. place_bid_public — public credits balance
    // =========================================================================

    fn place_bid_public(
        public auction_id:     field,
        public payment_amount: u64,
    ) -> (QuadraticBid, fairdrop_proof_v3.aleo::ParticipationReceipt, Final) {
        assert(payment_amount > 0u64);

        let bidder_key: field = BHP256::hash_to_field(BidderKey {
            bidder:     self.signer,
            auction_id: auction_id,
        });

        let contribution_weight: u128 = approx_sqrt(payment_amount as u128);

        let f_credits: Final =
            credits.aleo::transfer_public_as_signer(self.address, payment_amount);

        let f_gate: Final = fairdrop_gate_v3.aleo::check_admission(auction_id);

        let (receipt, f_proof): (fairdrop_proof_v3.aleo::ParticipationReceipt, Final) =
            fairdrop_proof_v3.aleo::issue_receipt(auction_id, 0field, bidder_key);

        let bid: QuadraticBid = QuadraticBid {
            owner:               self.signer,
            auction_id:          auction_id,
            payment_amount:      payment_amount as u128,
            contribution_weight: contribution_weight,
        };

        let payment_amount_u128: u128 = payment_amount as u128;

        return (bid, receipt, final {
            assert(!fairdrop_config_v3.aleo::paused.get_or_use(0field, false) && !paused.get_or_use(0field, false));
            f_credits.run();
            f_gate.run();
            f_proof.run();
            // ── quadratic bid validation and state updates ────────────────────────
            let config: AuctionConfig = auction_configs.get(auction_id);
            let state:  AuctionState  = auction_states.get(auction_id);
            assert(!state.cleared);
            assert(!state.voided);
            assert(block.height >= config.start_block);
            assert(block.height <  config.end_block);
            assert(payment_amount_u128 >= config.min_bid_amount);
            let current_total: u128    = bid_totals.get_or_use(bidder_key, 0u128);
            let new_bidder_total: u128 = current_total + payment_amount_u128;
            let within_limit: bool = config.max_bid_amount == 0u128
                || new_bidder_total <= config.max_bid_amount;
            assert(within_limit);
            bid_totals.set(bidder_key, new_bidder_total);
            auction_states.set(auction_id, AuctionState {
                total_committed:  0u128,
                total_payments:   state.total_payments + payment_amount_u128,
                supply_met:       false,
                ended_at_block:   state.ended_at_block,
                cleared:          false,
                clearing_price:   0u128,
                creator_revenue:  0u128,
                protocol_fee:     0u128,
                voided:           false,
                referral_budget:  0u128,
                effective_supply: 0u128,
            });
            let escrow: u128 = escrow_payments.get_or_use(auction_id, 0u128);
            escrow_payments.set(auction_id, escrow + payment_amount_u128);
            let acc_weight: u128 = sqrt_weights.get_or_use(auction_id, 0u128);
            sqrt_weights.set(auction_id, acc_weight + contribution_weight);
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
    // 4. place_bid_private_ref — private credits + referral code
    // =========================================================================

    fn place_bid_private_ref(
        payment:               credits.aleo::credits,
        public auction_id:     field,
        public payment_amount: u64,
        public code_id:        field,
    ) -> (credits.aleo::credits, QuadraticBid, fairdrop_proof_v3.aleo::ParticipationReceipt, Final) {
        assert(payment_amount > 0u64);

        let bidder_key: field = BHP256::hash_to_field(BidderKey {
            bidder:     self.signer,
            auction_id: auction_id,
        });

        let contribution_weight: u128 = approx_sqrt(payment_amount as u128);

        let (change, f_credits): (credits.aleo::credits, Final) =
            credits.aleo::transfer_private_to_public(payment, self.address, payment_amount);

        let f_gate: Final = fairdrop_gate_v3.aleo::check_admission(auction_id);

        let (receipt, f_proof): (fairdrop_proof_v3.aleo::ParticipationReceipt, Final) =
            fairdrop_proof_v3.aleo::issue_receipt(auction_id, 0field, bidder_key);

        let f_ref: Final = fairdrop_ref_v3.aleo::record_referral(
            code_id,
            auction_id,
            bidder_key,
            payment_amount as u128,
        );

        let bid: QuadraticBid = QuadraticBid {
            owner:               self.signer,
            auction_id:          auction_id,
            payment_amount:      payment_amount as u128,
            contribution_weight: contribution_weight,
        };

        let payment_amount_u128: u128 = payment_amount as u128;

        return (change, bid, receipt, final {
            assert(!fairdrop_config_v3.aleo::paused.get_or_use(0field, false) && !paused.get_or_use(0field, false));
            f_credits.run();
            f_gate.run();
            f_proof.run();
            f_ref.run();
            // ── quadratic bid validation and state updates ────────────────────────
            let config: AuctionConfig = auction_configs.get(auction_id);
            let state:  AuctionState  = auction_states.get(auction_id);
            assert(!state.cleared);
            assert(!state.voided);
            assert(block.height >= config.start_block);
            assert(block.height <  config.end_block);
            assert(payment_amount_u128 >= config.min_bid_amount);
            let current_total: u128    = bid_totals.get_or_use(bidder_key, 0u128);
            let new_bidder_total: u128 = current_total + payment_amount_u128;
            let within_limit: bool = config.max_bid_amount == 0u128
                || new_bidder_total <= config.max_bid_amount;
            assert(within_limit);
            bid_totals.set(bidder_key, new_bidder_total);
            auction_states.set(auction_id, AuctionState {
                total_committed:  0u128,
                total_payments:   state.total_payments + payment_amount_u128,
                supply_met:       false,
                ended_at_block:   state.ended_at_block,
                cleared:          false,
                clearing_price:   0u128,
                creator_revenue:  0u128,
                protocol_fee:     0u128,
                voided:           false,
                referral_budget:  0u128,
                effective_supply: 0u128,
            });
            let escrow: u128 = escrow_payments.get_or_use(auction_id, 0u128);
            escrow_payments.set(auction_id, escrow + payment_amount_u128);
            let acc_weight: u128 = sqrt_weights.get_or_use(auction_id, 0u128);
            sqrt_weights.set(auction_id, acc_weight + contribution_weight);
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
    // 5. place_bid_public_ref — public credits + referral code
    // =========================================================================

    fn place_bid_public_ref(
        public auction_id:     field,
        public payment_amount: u64,
        public code_id:        field,
    ) -> (QuadraticBid, fairdrop_proof_v3.aleo::ParticipationReceipt, Final) {
        assert(payment_amount > 0u64);

        let bidder_key: field = BHP256::hash_to_field(BidderKey {
            bidder:     self.signer,
            auction_id: auction_id,
        });

        let contribution_weight: u128 = approx_sqrt(payment_amount as u128);

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

        let bid: QuadraticBid = QuadraticBid {
            owner:               self.signer,
            auction_id:          auction_id,
            payment_amount:      payment_amount as u128,
            contribution_weight: contribution_weight,
        };

        let payment_amount_u128: u128 = payment_amount as u128;

        return (bid, receipt, final {
            assert(!fairdrop_config_v3.aleo::paused.get_or_use(0field, false) && !paused.get_or_use(0field, false));
            f_credits.run();
            f_gate.run();
            f_proof.run();
            f_ref.run();
            // ── quadratic bid validation and state updates ────────────────────────
            let config: AuctionConfig = auction_configs.get(auction_id);
            let state:  AuctionState  = auction_states.get(auction_id);
            assert(!state.cleared);
            assert(!state.voided);
            assert(block.height >= config.start_block);
            assert(block.height <  config.end_block);
            assert(payment_amount_u128 >= config.min_bid_amount);
            let current_total: u128    = bid_totals.get_or_use(bidder_key, 0u128);
            let new_bidder_total: u128 = current_total + payment_amount_u128;
            let within_limit: bool = config.max_bid_amount == 0u128
                || new_bidder_total <= config.max_bid_amount;
            assert(within_limit);
            bid_totals.set(bidder_key, new_bidder_total);
            auction_states.set(auction_id, AuctionState {
                total_committed:  0u128,
                total_payments:   state.total_payments + payment_amount_u128,
                supply_met:       false,
                ended_at_block:   state.ended_at_block,
                cleared:          false,
                clearing_price:   0u128,
                creator_revenue:  0u128,
                protocol_fee:     0u128,
                voided:           false,
                referral_budget:  0u128,
                effective_supply: 0u128,
            });
            let escrow: u128 = escrow_payments.get_or_use(auction_id, 0u128);
            escrow_payments.set(auction_id, escrow + payment_amount_u128);
            let acc_weight: u128 = sqrt_weights.get_or_use(auction_id, 0u128);
            sqrt_weights.set(auction_id, acc_weight + contribution_weight);
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
    // 6. close_auction — permissionless after end_block
    // =========================================================================
    //
    // Quadratic auctions always run to end_block (no supply_met early close).
    // Cleared when total_payments >= raise_target; voided otherwise.
    // Revenue is on total_payments when cleared (pay-what-you-bid; no refund).

    fn close_auction(
        public auction_id:    field,
        public creator:       address,
        public filled:        bool,    // D11: state.supply_met (always false for quadratic)
        public volume:        u128,    // D11: state.total_payments
        public closer_reward: u128,
    ) -> Final {
        let signer: address = self.signer;

        let f_closer: Final =
            credits.aleo::transfer_public(self.signer, closer_reward as u64);

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
            assert(block.height >= config.end_block);

            assert_eq(creator,       config.creator);
            assert_eq(filled,        state.supply_met);  // always false for quadratic
            assert_eq(volume,        state.total_payments);
            assert_eq(closer_reward, config.closer_reward);

            let treasury: u128 = protocol_treasury.get_or_use(0field, 0u128);
            assert(treasury >= closer_reward);

            // Determine outcome using fill_min_bps threshold.
            let min_payments: u128 = config.fill_min_bps > 0u16
                ? config.raise_target * (config.fill_min_bps as u128) / 10000u128
                : config.raise_target;
            let is_cleared: bool = state.total_payments >= min_payments;

            // effective_supply: scale down proportionally for partial fill; full supply for exact/over.
            let effective_supply: u128 = is_cleared
                ? (state.total_payments >= config.raise_target
                    ? config.supply
                    : config.supply * state.total_payments / config.raise_target)
                : 0u128;

            // Revenue on total_payments — full amount received (no refunds).
            let total_cost: u128   = is_cleared ? state.total_payments : 0u128;
            let protocol_fee: u128 = total_cost * (config.fee_bps as u128) / 10000u128;
            let creator_rev: u128  = total_cost - protocol_fee;
            let ref_budget: u128   = protocol_fee * (config.referral_pool_bps as u128) / 10000u128;
            let net_fee: u128      = protocol_fee - ref_budget;

            let treasury_add: u128 = is_cleared ? net_fee : 0u128;
            protocol_treasury.set(0field, treasury + treasury_add - closer_reward);

            auction_states.set(auction_id, AuctionState {
                total_committed:  effective_supply,
                total_payments:   state.total_payments,
                supply_met:       false,
                ended_at_block:   config.end_block,
                cleared:          is_cleared,
                clearing_price:   0u128,
                creator_revenue:  creator_rev,
                protocol_fee:     protocol_fee,
                voided:           !is_cleared,
                referral_budget:  ref_budget,
                effective_supply: effective_supply,
            });
        };
    }

    // =========================================================================
    // 7. push_referral_budget — permissionless; call after cleared close_auction
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

            auction_states.set(auction_id, AuctionState {
                total_committed:  state.total_committed,
                total_payments:   state.total_payments,
                supply_met:       state.supply_met,
                ended_at_block:   state.ended_at_block,
                cleared:          state.cleared,
                clearing_price:   state.clearing_price,
                creator_revenue:  state.creator_revenue,
                protocol_fee:     state.protocol_fee,
                voided:           state.voided,
                referral_budget:  0u128,
                effective_supply: state.effective_supply,
            });
        };
    }

    // =========================================================================
    // 8. claim — redeem QuadraticBid record (non-vesting auctions)
    // =========================================================================
    //
    // actual_quantity = effective_supply * bid.contribution_weight / total_sqrt_weight
    // No clearing-price refund — bidder paid payment_amount in full.
    // effective_supply < supply for partial fill; == supply for exact/oversubscribed.
    //
    // D11: caller supplies total_sqrt_weight and effective_supply; finalize validates both.
    // Guard: assert(total_sqrt_weight > 0) prevents division by zero.

    fn claim(
        bid:                        QuadraticBid,
        public total_sqrt_weight:   u128,   // D11: sqrt_weights[auction_id]
        public effective_supply:    u128,   // D11: state.effective_supply
        public sale_token_id:       field,
    ) -> (token_registry.aleo::Token, Final) {
        assert(total_sqrt_weight > 0u128);

        // Capture record fields before final {}
        let bid_auction_id:          field   = bid.auction_id;
        let bid_contribution_weight: u128    = bid.contribution_weight;
        let bid_owner:               address = bid.owner;

        let actual_quantity: u128 = effective_supply * bid_contribution_weight / total_sqrt_weight;

        let (sale_token, f_mint): (token_registry.aleo::Token, Final) =
            token_registry.aleo::mint_private(
                sale_token_id,
                bid_owner,
                actual_quantity,
                false,
                4294967295u32,
            );

        return (sale_token, final {
            assert(!fairdrop_config_v3.aleo::paused.get_or_use(0field, false) && !paused.get_or_use(0field, false));
            f_mint.run();

            let config: AuctionConfig = auction_configs.get(bid_auction_id);
            let state:  AuctionState  = auction_states.get(bid_auction_id);

            assert(state.cleared);
            assert(!state.voided);
            assert(!config.vest_enabled);
            assert_eq(sale_token_id,    config.sale_token_id);
            assert_eq(effective_supply, state.effective_supply);
            // D11: validate total_sqrt_weight against accumulated mapping value.
            let final_weight: u128 = sqrt_weights.get(bid_auction_id);
            assert_eq(total_sqrt_weight, final_weight);
            assert(actual_quantity > 0u128);

            let sale_remaining: u128 = escrow_sales.get(bid_auction_id);
            assert(actual_quantity <= sale_remaining);
            escrow_sales.set(bid_auction_id, sale_remaining - actual_quantity);
        });
    }

    // =========================================================================
    // 9. claim_vested — redeem QuadraticBid record (vest_enabled auctions)
    // =========================================================================

    fn claim_vested(
        bid:                        QuadraticBid,
        public total_sqrt_weight:   u128,   // D11: sqrt_weights[auction_id]
        public effective_supply:    u128,   // D11: state.effective_supply
        public sale_token_id:       field,
        public ended_at_block:      u32,
        public cliff_blocks:        u32,
        public vest_end_blocks:     u32,
    ) -> (fairdrop_vest_v3.aleo::VestedAllocation, Final) {
        assert(total_sqrt_weight > 0u128);

        // Capture record fields before final {}
        let bid_auction_id:          field   = bid.auction_id;
        let bid_owner:               address = bid.owner;
        let bid_contribution_weight: u128    = bid.contribution_weight;

        let actual_quantity: u128 = effective_supply * bid_contribution_weight / total_sqrt_weight;

        let (vest, f_vest): (fairdrop_vest_v3.aleo::VestedAllocation, Final) =
            fairdrop_vest_v3.aleo::create_vest(
                bid_auction_id,
                bid_owner,
                sale_token_id,
                actual_quantity,
                ended_at_block,
                cliff_blocks,
                vest_end_blocks,
            );

        return (vest, final {
            assert(!fairdrop_config_v3.aleo::paused.get_or_use(0field, false) && !paused.get_or_use(0field, false));
            f_vest.run();

            let config: AuctionConfig = auction_configs.get(bid_auction_id);
            let state:  AuctionState  = auction_states.get(bid_auction_id);

            assert(state.cleared);
            assert(!state.voided);
            assert(config.vest_enabled);
            assert_eq(sale_token_id,    config.sale_token_id);
            assert_eq(effective_supply, state.effective_supply);
            let final_weight: u128 = sqrt_weights.get(bid_auction_id);
            assert_eq(total_sqrt_weight, final_weight);
            assert(actual_quantity > 0u128);
            assert_eq(ended_at_block,  state.ended_at_block);
            assert_eq(cliff_blocks,    config.vest_cliff_blocks);
            assert_eq(vest_end_blocks, config.vest_end_blocks);

            let sale_remaining: u128 = escrow_sales.get(bid_auction_id);
            assert(actual_quantity <= sale_remaining);
            escrow_sales.set(bid_auction_id, sale_remaining - actual_quantity);
        });
    }

    // =========================================================================
    // 10. withdraw_payments — creator withdraws revenue after cleared close
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
    // Voided case: full supply (total_committed = 0 → unsold = supply).
    // Cleared case: dust rounding if any (total_committed = supply → unsold = 0).

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

            // Allow in both cleared (dust) and voided (full supply) cases.
            assert(!state.cleared || !state.voided);  // must be in some final state
            assert(state.cleared || state.voided);
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

    fn cancel_auction(
        public auction_id:    field,
        public sale_token_id: field,
        public supply:        u128,
    ) -> (token_registry.aleo::Token, Final) {
        let creator: address = self.signer;

        let (token, f_mint): (token_registry.aleo::Token, Final) =
            token_registry.aleo::mint_private(
                sale_token_id,
                self.signer,
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
                total_committed:  state.total_committed,
                total_payments:   state.total_payments,
                supply_met:       state.supply_met,
                ended_at_block:   state.ended_at_block,
                cleared:          false,
                clearing_price:   0u128,
                creator_revenue:  0u128,
                protocol_fee:     0u128,
                voided:           true,
                referral_budget:  0u128,
                effective_supply: 0u128,
            });
        });
    }

    // =========================================================================
    // 13. claim_voided — bidder recovers payment from a voided auction
    // =========================================================================
    //
    // No paused check — emergency pause must not trap bidder capital.
    // Full payment_amount refunded (no partial recovery).

    fn claim_voided(
        bid: QuadraticBid,
    ) -> (credits.aleo::credits, Final) {
        // Capture record fields before final {}
        let bid_auction_id:     field   = bid.auction_id;
        let bid_payment_amount: u128    = bid.payment_amount;
        let bid_owner:          address = bid.owner;

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
