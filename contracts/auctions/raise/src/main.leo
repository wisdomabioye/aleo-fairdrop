// fairdrop_raise_v2.aleo — Privacy-preserving fixed-price community raise.
//
// Mechanism: creator sets raise_target (total credits to collect) and supply
// (tokens to distribute). Bidders commit any payment ≥ min_bid_amount.
// There is no price discovery — price is implied: raise_target / supply.
//
// Allocation model: pro-rata by payment.
//   actual_quantity = bid.payment_amount * supply / total_payments
// Bidder pays exactly their pro-rata cost; rounding dust (≤ 1 microunit) is refunded.
//
// Bids are capped at raise_target total — reject(assert) if new_total_payments > raise_target.
// This means total_payments == raise_target exactly when supply_met triggers.
// Pro-rata formula collapses to: actual_quantity = bid.payment_amount * supply / raise_target.
// Refund = bid.payment_amount - (actual_quantity * raise_target / supply)  [floor rounding dust].
//
// Success / void:
//   Cleared when total_payments >= raise_target (supply_met triggers early close).
//   Voided at close_auction if total_payments < raise_target (target not met).
//   Voided auctions: bidders recover credits via claim_voided;
//                    creator reclaims supply via withdraw_unsold.
//
// Payment token : credits.aleo — private record OR public balance.
// Sale tokens   : token_registry.aleo/Token. Burned at create (freeing max_supply
//                 headroom so mint_private at claim is always guaranteed to succeed).
//                 Re-minted at claim/claim_vested. Net supply change = 0.
//
// Roles required:
//   fairdrop_raise_v2.aleo — SUPPLY_MANAGER_ROLE on sale token (burn + mint).
//   fairdrop_vest_v2.aleo  — SUPPLY_MANAGER_ROLE on sale token (mint at release),
//                         required only when vest_enabled = true.
//
// Revenue accounting (set at close_auction, cleared case only):
//   total_cost      = raise_target  (fixed; bids capped so total_payments == raise_target)
//   protocol_fee    = total_cost * fee_bps / 10000
//   creator_revenue = total_cost - protocol_fee
//   referral_budget = protocol_fee * referral_pool_bps / 10000
//   treasury_credit = protocol_fee - referral_budget - closer_reward
//
//   Escrow invariant (cleared): creator_revenue + sum(rounding_refunds) + protocol_fee
//                               = raise_target = total_payments  ✓
//   Void case: no revenue computed. Bidders recover via claim_voided.
//              Creator recovers supply via withdraw_unsold. treasury -= closer_reward only.
//
// Auction ID derivation:
//   auction_id = BHP256(AuctionKey { creator, nonce, PROGRAM_SALT = 4field })
//   PROGRAM_SALT prevents cross-auction-type collisions (Dutch=1, Ascending=2, Sealed=3).
//
// Privacy model:
//   - Bid payment amount  : always public (on-chain escrow accounting; unavoidable).
//   - Bid source          : hidden for place_bid_private (private UTXO consumed).
//   - Bidder identity     : pseudonymous — only BHP256(bidder, auction_id) on-chain.
//   - Allocation amount   : private — computed from RaiseBid record at claim.
//   - Token recipients    : private (mint_private / transfer_public_to_private).
//   - Vest owner          : private (passed as private param to create_vest CPI).
//
// Note: quantity is NEVER specified at bid time. Allocation computed privately at claim.
//   total_payments reaches finalize (unavoidable for escrow accounting). Allocation
//   ratios are inferable post-close (public payments / raise_target). This is the
//   least-private auction type — use Dutch or Sealed if quantity privacy is required.
//
// Pause model:
//   All finalizes except claim_voided assert !fairdrop_config.paused (direct read).
//   claim_voided is pause-exempt — bidders must always be able to recover funds.
//
// Lifecycle:
//   create_auction → place_bid_* → close_auction → [push_referral_budget] →
//   claim / claim_vested → withdraw_payments + withdraw_unsold
//   OR: cancel_auction → claim_voided            (creator escape hatch)
//   OR: close_auction (voided) → claim_voided    (target not met)
//                              + withdraw_unsold  (creator reclaims supply)

// ── Leo 4.0 migration notes ───────────────────────────────────────────────────
//   async constructor → constructor
//   async transition  → fn; async function finalize_* → deleted, inlined as final {}
//   self.signer captured before final {} where needed (create_auction, place_bid_*, etc.)
//   record fields captured before final {} in claim, claim_vested, claim_voided
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

// =========================================================================
// Structs (moved outside program {} per Leo 4.0)
// =========================================================================

// From token_registry.aleo — field order must match exactly for correct hashing.
struct TokenOwner { account: address, token_id: field }

// BHP256 input for auction_id. PROGRAM_SALT prevents cross-type ID collision.
struct AuctionKey { creator: address, nonce: u64, program_salt: field }

// BHP256 input for pseudonymous per-bidder key. Raw bidder address never on-chain.
struct BidderKey { bidder: address, auction_id: field }

// BHP256 input for multisig-approved treasury withdrawal. Matches multisig doc.
struct WithdrawalOp { amount: u128, recipient: address, nonce: u64 }

// Immutable auction parameters. Written once at create_auction; never modified.
struct AuctionConfig {
    auction_id:         field,
    creator:            address,
    sale_token_id:      field,
    payment_token_id:   field,    // always CREDITS_RESERVED_TOKEN_ID
    supply:             u128,     // raw token units to distribute
    raise_target:       u128,     // total credits required for success
    start_block:        u32,
    end_block:          u32,
    max_bid_amount:     u128,     // max cumulative payment per bidder; 0 = no cap
    min_bid_amount:     u128,     // minimum payment per bid
    sale_scale:         u128,     // 10^sale_token_decimals
    gate_mode:          u8,       // 0=open 1=merkle 2=credential
    vest_enabled:       bool,
    vest_cliff_blocks:  u32,
    vest_end_blocks:    u32,
    fee_bps:            u16,      // D16: snapshotted from fairdrop_config at create
    closer_reward:      u128,     // D16: snapshotted from fairdrop_config at create
    referral_pool_bps:  u16,      // D16: snapshotted from fairdrop_config at create
    metadata_hash:      field,    // BHP256 of off-chain metadata JSON. 0field = none.
    fill_min_bps:       u16,      // minimum fill to succeed (e.g. 7000 = 70%). 0 = disabled (100% required).
}

// Mutable auction lifecycle state. Identical schema to all other auction programs.
struct AuctionState {
    total_committed: u128,  // set to effective_supply at cleared close; 0 otherwise
    total_payments:  u128,  // cumulative bidder credits locked
    supply_met:      bool,  // true when total_payments >= raise_target
    ended_at_block:  u32,   // block raise_target reached OR config.end_block at close
    cleared:         bool,  // true after successful close_auction
    clearing_price:  u128,  // raise_target * sale_scale / supply; set at cleared close
    creator_revenue: u128,  // total_payments - protocol_fee; set at cleared close
    protocol_fee:    u128,  // total_payments * fee_bps / 10000; set at cleared close
    voided:          bool,  // true after cancel_auction or failed-target close
    referral_budget: u128,  // portion of protocol_fee for referrals; set at cleared close
    effective_supply: u128, // actual tokens to distribute at close; < supply for partial fill; 0 until cleared
}

// Global stats for enumeration and volume tracking.
struct Stats {
    total_auctions:          u64,
    total_bids:              u64,
    total_payment_collected: u128,
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
struct ConfigSnapshot {
    fee_bps:            u16,
    creation_fee:       u128,
    closer_reward:      u128,
    slash_reward_bps:   u16,
    referral_pool_bps:  u16,
}

program fairdrop_raise_v2.aleo {
    // Upgrade governance: 3-of-5 multi-sig must call fairdrop_multisig_v1.aleo::approve_upgrade
    // with contract_key=10field and this program's compiled checksum before deployment.
    @checksum(mapping="fairdrop_multisig_v1.aleo::approved_upgrades", key="10field")
    constructor() {}

    // =========================================================================
    // Constants
    // =========================================================================

    // ALEO credits registered in token_registry.aleo.
    const CREDITS_RESERVED_TOKEN_ID: field =
        3443843282313283355522573239085696902919850365217539366784739393210722344986field;

    // Required role for burn_private (create) and mint_private (claim/withdraw_unsold).
    const SUPPLY_MANAGER_ROLE: u8 = 3u8;

    // Distinguishes auction_ids from fairdrop_raise vs other auction programs.
    // Dutch=1field, Ascending=2field, Sealed=3field, Raise=4field.
    const PROGRAM_SALT: field = 4field;

    // =========================================================================
    // Records
    // =========================================================================

    // Private raise bid receipt. No quantity field — allocation computed at claim (G17).
    // Single-spend UTXO: consumed once at claim, claim_vested, or claim_voided.
    record RaiseBid {
        owner:          address,  // private — never in finalize
        auction_id:     field,
        payment_amount: u128,     // microcredits deposited (fits u64; stored as u128)
    }

    // =========================================================================
    // Mappings
    // =========================================================================

    mapping auction_configs:  field => AuctionConfig;
    mapping auction_states:   field => AuctionState;

    // BHP256(BidderKey) → cumulative payment. Enforces max_bid_amount per bidder.
    // Pseudonymous: raw bidder address never stored.
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

    // Per-creator discovery (linked list, O(K) enumeration).
    mapping creator_auction_count:   address => u64;
    mapping creator_latest_auction:  address => field;
    mapping auction_prev_by_creator: field   => field;

    // Per-creator nonce for auction_id derivation.
    mapping creator_nonces: address => u64;

    // Protocol-owned credits accounting. Keyed by 0field.
    mapping protocol_treasury: field => u128;

    // Replay protection for withdraw_treasury_fees approvals.
    mapping consumed_ops: field => bool;

    // =========================================================================
    // 1. create_auction
    // =========================================================================
    //
    // Burns `supply` tokens from creator's private Token record. Remainder returned
    // as zero-amount dust (wallets filter it). creation_fee deducted as anti-spam.
    //
    // CPIs: burn_private, transfer_public_as_signer, assert_config, register_gate.
    //
    // Parameters grouped into GateParams / VestParams / ConfigSnapshot structs
    // to stay within Leo's 16-parameter limit.

    fn create_auction(
        token:                 token_registry.aleo::Token,
        public sale_token_id:  field,
        public supply:         u128,
        public raise_target:   u128,
        public start_block:    u32,
        public end_block:      u32,
        public max_bid_amount: u128,   // 0 = unlimited per bidder
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

        let creator: address = self.signer;

        let auction_id: field = BHP256::hash_to_field(AuctionKey {
            creator:      self.signer,
            nonce:        nonce,
            program_salt: PROGRAM_SALT,
        });

        let (remainder, f_burn): (token_registry.aleo::Token, Final) =
            token_registry.aleo::burn_private(token, supply);

        let f_creation: Final =
            credits.aleo::transfer_public_as_signer(self.address, snapshot.creation_fee as u64);

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
            assert(!fairdrop_config_v2.aleo::paused.get_or_use(0field, false));
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

            // D11: nonce must equal the current per-creator counter.
            assert_eq(nonce, creator_nonces.get_or_use(creator, 0u64));

            let expected_id: field = BHP256::hash_to_field(AuctionKey {
                creator:      creator,
                nonce:        nonce,
                program_salt: PROGRAM_SALT,
            });
            assert_eq(auction_id, expected_id);
            assert_eq(config.auction_id, auction_id);

            // Verify fairdrop_raise_v2.aleo has SUPPLY_MANAGER_ROLE on the sale token.
            let raise_role_key: field = BHP256::hash_to_field(TokenOwner {
                account:  fairdrop_raise_v2.aleo,
                token_id: config.sale_token_id,
            });
            assert_eq(
                token_registry.aleo::roles.get_or_use(raise_role_key, 0u8),
                SUPPLY_MANAGER_ROLE
            );

            // If vest_enabled: validate duration and check fairdrop_vest_v2.aleo has role.
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
        });
    }

    // =========================================================================
    // 2. place_bid_private — private credits UTXO
    // =========================================================================
    //
    // No quantity specified — allocation is computed pro-rata at claim.
    // Bids are rejected when supply_met (total_payments == raise_target) or
    // when they would exceed raise_target (assert new_total_payments <= raise_target).
    //
    // CPIs: transfer_private_to_public, check_admission, issue_receipt.

    fn place_bid_private(
        payment:               credits.aleo::credits,
        public auction_id:     field,
        public payment_amount: u64,
    ) -> (credits.aleo::credits, RaiseBid, fairdrop_proof_v2.aleo::ParticipationReceipt, Final) {
        assert(payment_amount > 0u64);

        let signer: address = self.signer;

        let bidder_key: field = BHP256::hash_to_field(BidderKey {
            bidder:     self.signer,
            auction_id: auction_id,
        });

        let (change, f_credits): (credits.aleo::credits, Final) =
            credits.aleo::transfer_private_to_public(payment, self.address, payment_amount);

        let f_gate: Final = fairdrop_gate_v2.aleo::check_admission(auction_id);

        let (receipt, f_proof): (fairdrop_proof_v2.aleo::ParticipationReceipt, Final) =
            fairdrop_proof_v2.aleo::issue_receipt(auction_id, 0field, bidder_key);

        let bid: RaiseBid = RaiseBid {
            owner:          self.signer,
            auction_id:     auction_id,
            payment_amount: payment_amount as u128,
        };

        let amount_u128: u128 = payment_amount as u128;

        return (change, bid, receipt, final {
            assert(!fairdrop_config_v2.aleo::paused.get_or_use(0field, false));
            f_credits.run();
            f_gate.run();
            f_proof.run();
            // ── shared bid validation and state updates ──────────────────────────
            let config: AuctionConfig = auction_configs.get(auction_id);
            let state:  AuctionState  = auction_states.get(auction_id);
            assert(!state.supply_met);
            assert(!state.cleared);
            assert(!state.voided);
            assert(block.height >= config.start_block);
            assert(block.height <  config.end_block);
            assert(amount_u128 >= config.min_bid_amount);
            // Reject bids that would exceed the raise target.
            let new_total_payments: u128 = state.total_payments + amount_u128;
            assert(new_total_payments <= config.raise_target);
            // Per-bidder payment cap.
            let current_total: u128    = bid_totals.get_or_use(bidder_key, 0u128);
            let new_bidder_total: u128 = current_total + amount_u128;
            let within_limit: bool = config.max_bid_amount == 0u128
                || new_bidder_total <= config.max_bid_amount;
            assert(within_limit);
            bid_totals.set(bidder_key, new_bidder_total);
            let is_supply_met: bool = new_total_payments >= config.raise_target;
            auction_states.set(auction_id, AuctionState {
                total_committed:  0u128,
                total_payments:   new_total_payments,
                supply_met:       is_supply_met,
                ended_at_block:   is_supply_met ? block.height : state.ended_at_block,
                cleared:          false,
                clearing_price:   0u128,
                creator_revenue:  0u128,
                protocol_fee:     0u128,
                voided:           false,
                referral_budget:  0u128,
                effective_supply: 0u128,
            });
            let escrow: u128 = escrow_payments.get_or_use(auction_id, 0u128);
            escrow_payments.set(auction_id, escrow + amount_u128);
            let s: Stats = stats.get_or_use(0field, Stats {
                total_auctions: 0u64, total_bids: 0u64, total_payment_collected: 0u128
            });
            stats.set(0field, Stats {
                total_auctions:          s.total_auctions,
                total_bids:              s.total_bids + 1u64,
                total_payment_collected: s.total_payment_collected + amount_u128,
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
    ) -> (RaiseBid, fairdrop_proof_v2.aleo::ParticipationReceipt, Final) {
        assert(payment_amount > 0u64);

        let signer: address = self.signer;

        let bidder_key: field = BHP256::hash_to_field(BidderKey {
            bidder:     self.signer,
            auction_id: auction_id,
        });

        let f_credits: Final =
            credits.aleo::transfer_public_as_signer(self.address, payment_amount);

        let f_gate: Final = fairdrop_gate_v2.aleo::check_admission(auction_id);

        let (receipt, f_proof): (fairdrop_proof_v2.aleo::ParticipationReceipt, Final) =
            fairdrop_proof_v2.aleo::issue_receipt(auction_id, 0field, bidder_key);

        let bid: RaiseBid = RaiseBid {
            owner:          self.signer,
            auction_id:     auction_id,
            payment_amount: payment_amount as u128,
        };

        let amount_u128: u128 = payment_amount as u128;

        return (bid, receipt, final {
            assert(!fairdrop_config_v2.aleo::paused.get_or_use(0field, false));
            f_credits.run();
            f_gate.run();
            f_proof.run();
            // ── shared bid validation and state updates ──────────────────────────
            let config: AuctionConfig = auction_configs.get(auction_id);
            let state:  AuctionState  = auction_states.get(auction_id);
            assert(!state.supply_met);
            assert(!state.cleared);
            assert(!state.voided);
            assert(block.height >= config.start_block);
            assert(block.height <  config.end_block);
            assert(amount_u128 >= config.min_bid_amount);
            let new_total_payments: u128 = state.total_payments + amount_u128;
            assert(new_total_payments <= config.raise_target);
            let current_total: u128    = bid_totals.get_or_use(bidder_key, 0u128);
            let new_bidder_total: u128 = current_total + amount_u128;
            let within_limit: bool = config.max_bid_amount == 0u128
                || new_bidder_total <= config.max_bid_amount;
            assert(within_limit);
            bid_totals.set(bidder_key, new_bidder_total);
            let is_supply_met: bool = new_total_payments >= config.raise_target;
            auction_states.set(auction_id, AuctionState {
                total_committed:  0u128,
                total_payments:   new_total_payments,
                supply_met:       is_supply_met,
                ended_at_block:   is_supply_met ? block.height : state.ended_at_block,
                cleared:          false,
                clearing_price:   0u128,
                creator_revenue:  0u128,
                protocol_fee:     0u128,
                voided:           false,
                referral_budget:  0u128,
                effective_supply: 0u128,
            });
            let escrow: u128 = escrow_payments.get_or_use(auction_id, 0u128);
            escrow_payments.set(auction_id, escrow + amount_u128);
            let s: Stats = stats.get_or_use(0field, Stats {
                total_auctions: 0u64, total_bids: 0u64, total_payment_collected: 0u128
            });
            stats.set(0field, Stats {
                total_auctions:          s.total_auctions,
                total_bids:              s.total_bids + 1u64,
                total_payment_collected: s.total_payment_collected + amount_u128,
            });
            // ─────────────────────────────────────────────────────────────────────
        });
    }

    // =========================================================================
    // 4. place_bid_private_ref — private credits + referral attribution
    // =========================================================================

    fn place_bid_private_ref(
        payment:               credits.aleo::credits,
        public auction_id:     field,
        public payment_amount: u64,
        public code_id:        field,
    ) -> (credits.aleo::credits, RaiseBid, fairdrop_proof_v2.aleo::ParticipationReceipt, Final) {
        assert(payment_amount > 0u64);

        let signer: address = self.signer;

        let bidder_key: field = BHP256::hash_to_field(BidderKey {
            bidder:     self.signer,
            auction_id: auction_id,
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

        let bid: RaiseBid = RaiseBid {
            owner:          self.signer,
            auction_id:     auction_id,
            payment_amount: payment_amount as u128,
        };

        let amount_u128: u128 = payment_amount as u128;

        return (change, bid, receipt, final {
            assert(!fairdrop_config_v2.aleo::paused.get_or_use(0field, false));
            f_credits.run();
            f_gate.run();
            f_proof.run();
            f_ref.run();
            // ── shared bid validation and state updates ──────────────────────────
            let config: AuctionConfig = auction_configs.get(auction_id);
            let state:  AuctionState  = auction_states.get(auction_id);
            assert(!state.supply_met);
            assert(!state.cleared);
            assert(!state.voided);
            assert(block.height >= config.start_block);
            assert(block.height <  config.end_block);
            assert(amount_u128 >= config.min_bid_amount);
            let new_total_payments: u128 = state.total_payments + amount_u128;
            assert(new_total_payments <= config.raise_target);
            let current_total: u128    = bid_totals.get_or_use(bidder_key, 0u128);
            let new_bidder_total: u128 = current_total + amount_u128;
            let within_limit: bool = config.max_bid_amount == 0u128
                || new_bidder_total <= config.max_bid_amount;
            assert(within_limit);
            bid_totals.set(bidder_key, new_bidder_total);
            let is_supply_met: bool = new_total_payments >= config.raise_target;
            auction_states.set(auction_id, AuctionState {
                total_committed:  0u128,
                total_payments:   new_total_payments,
                supply_met:       is_supply_met,
                ended_at_block:   is_supply_met ? block.height : state.ended_at_block,
                cleared:          false,
                clearing_price:   0u128,
                creator_revenue:  0u128,
                protocol_fee:     0u128,
                voided:           false,
                referral_budget:  0u128,
                effective_supply: 0u128,
            });
            let escrow: u128 = escrow_payments.get_or_use(auction_id, 0u128);
            escrow_payments.set(auction_id, escrow + amount_u128);
            let s: Stats = stats.get_or_use(0field, Stats {
                total_auctions: 0u64, total_bids: 0u64, total_payment_collected: 0u128
            });
            stats.set(0field, Stats {
                total_auctions:          s.total_auctions,
                total_bids:              s.total_bids + 1u64,
                total_payment_collected: s.total_payment_collected + amount_u128,
            });
            // ─────────────────────────────────────────────────────────────────────
        });
    }

    // =========================================================================
    // 5. place_bid_public_ref — public credits + referral attribution
    // =========================================================================

    fn place_bid_public_ref(
        public auction_id:     field,
        public payment_amount: u64,
        public code_id:        field,
    ) -> (RaiseBid, fairdrop_proof_v2.aleo::ParticipationReceipt, Final) {
        assert(payment_amount > 0u64);

        let signer: address = self.signer;

        let bidder_key: field = BHP256::hash_to_field(BidderKey {
            bidder:     self.signer,
            auction_id: auction_id,
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

        let bid: RaiseBid = RaiseBid {
            owner:          self.signer,
            auction_id:     auction_id,
            payment_amount: payment_amount as u128,
        };

        let amount_u128: u128 = payment_amount as u128;

        return (bid, receipt, final {
            assert(!fairdrop_config_v2.aleo::paused.get_or_use(0field, false));
            f_credits.run();
            f_gate.run();
            f_proof.run();
            f_ref.run();
            // ── shared bid validation and state updates ──────────────────────────
            let config: AuctionConfig = auction_configs.get(auction_id);
            let state:  AuctionState  = auction_states.get(auction_id);
            assert(!state.supply_met);
            assert(!state.cleared);
            assert(!state.voided);
            assert(block.height >= config.start_block);
            assert(block.height <  config.end_block);
            assert(amount_u128 >= config.min_bid_amount);
            let new_total_payments: u128 = state.total_payments + amount_u128;
            assert(new_total_payments <= config.raise_target);
            let current_total: u128    = bid_totals.get_or_use(bidder_key, 0u128);
            let new_bidder_total: u128 = current_total + amount_u128;
            let within_limit: bool = config.max_bid_amount == 0u128
                || new_bidder_total <= config.max_bid_amount;
            assert(within_limit);
            bid_totals.set(bidder_key, new_bidder_total);
            let is_supply_met: bool = new_total_payments >= config.raise_target;
            auction_states.set(auction_id, AuctionState {
                total_committed:  0u128,
                total_payments:   new_total_payments,
                supply_met:       is_supply_met,
                ended_at_block:   is_supply_met ? block.height : state.ended_at_block,
                cleared:          false,
                clearing_price:   0u128,
                creator_revenue:  0u128,
                protocol_fee:     0u128,
                voided:           false,
                referral_budget:  0u128,
                effective_supply: 0u128,
            });
            let escrow: u128 = escrow_payments.get_or_use(auction_id, 0u128);
            escrow_payments.set(auction_id, escrow + amount_u128);
            let s: Stats = stats.get_or_use(0field, Stats {
                total_auctions: 0u64, total_bids: 0u64, total_payment_collected: 0u128
            });
            stats.set(0field, Stats {
                total_auctions:          s.total_auctions,
                total_bids:              s.total_bids + 1u64,
                total_payment_collected: s.total_payment_collected + amount_u128,
            });
            // ─────────────────────────────────────────────────────────────────────
        });
    }

    // =========================================================================
    // 6. close_auction — permissionless
    // =========================================================================
    //
    // Anyone may call once auction ends (supply_met OR block.height >= end_block).
    // Caller receives closer_reward from protocol_treasury.
    //
    // Two outcomes at close:
    //   CLEARED: total_payments >= raise_target
    //     - clearing_price = raise_target * sale_scale / supply (implied fixed price)
    //     - total_committed set to supply (all tokens committed to pro-rata allocation)
    //     - Revenue accounting performed; referral_budget stored for push_referral_budget.
    //   VOIDED: total_payments < raise_target (target not met)
    //     - voided = true; no revenue computed.
    //     - Bidders call claim_voided; creator calls withdraw_unsold for supply.
    //
    // In both cases: closer_reward paid from protocol_treasury (funded by creation_fee).
    //
    // D11 params: creator, filled (supply_met), volume (total_payments), closer_reward.

    fn close_auction(
        public auction_id:    field,
        public creator:       address,
        public filled:        bool,
        public volume:        u128,
        public closer_reward: u128,
    ) -> Final {
        let signer: address = self.signer;

        let f_closer: Final =
            credits.aleo::transfer_public(self.signer, closer_reward as u64);

        let f_proof: Final =
            fairdrop_proof_v2.aleo::update_reputation(creator, filled, volume);

        return final {
            assert(!fairdrop_config_v2.aleo::paused.get_or_use(0field, false));
            f_closer.run();
            f_proof.run();

            let config: AuctionConfig = auction_configs.get(auction_id);
            let state:  AuctionState  = auction_states.get(auction_id);

            assert(!state.cleared);
            assert(!state.voided);

            // Compute minimum payments required for a partial or full success.
            // fill_min_bps = 0: require full raise_target (existing behaviour).
            // fill_min_bps > 0: partial fill succeeds if total_payments >= threshold.
            let min_payments: u128 = config.fill_min_bps > 0u16
                ? config.raise_target * (config.fill_min_bps as u128) / 10000u128
                : config.raise_target;

            // Allow early close when: supply fully met, end_block passed,
            // OR partial-fill threshold is already reached (fill_min_bps > 0).
            assert(state.supply_met || block.height >= config.end_block || state.total_payments >= min_payments);

            // D11 validations.
            assert_eq(creator,       config.creator);
            assert_eq(filled,        state.supply_met);
            assert_eq(volume,        state.total_payments);
            assert_eq(closer_reward, config.closer_reward);

            let treasury: u128 = protocol_treasury.get_or_use(0field, 0u128);
            assert(treasury >= closer_reward);
            let is_cleared: bool = state.total_payments >= min_payments;

            // effective_supply: scale down proportionally for partial fill; full supply for exact/over.
            // Bids are capped at raise_target so total_payments <= raise_target always.
            let effective_supply: u128 = is_cleared
                ? (state.total_payments >= config.raise_target
                    ? config.supply
                    : config.supply * state.total_payments / config.raise_target)
                : 0u128;

            // clearing_price = raise_target * sale_scale / supply (implied price per token unit).
            let clearing_price: u128 = is_cleared
                ? config.raise_target * config.sale_scale / config.supply
                : 0u128;

            // Revenue on total_payments — full amount received (no refunds).
            let total_cost: u128   = is_cleared ? state.total_payments : 0u128;
            let protocol_fee: u128 = total_cost * (config.fee_bps as u128) / 10000u128;
            let creator_rev: u128  = total_cost - protocol_fee;
            let ref_budget: u128   = protocol_fee * (config.referral_pool_bps as u128) / 10000u128;
            let net_fee: u128      = protocol_fee - ref_budget;

            // Treasury: +net_fee (0 when voided), −closer_reward.
            let treasury_add: u128 = is_cleared ? net_fee : 0u128;
            protocol_treasury.set(0field, treasury + treasury_add - closer_reward);

            let ended_block: u32 = state.supply_met ? state.ended_at_block : config.end_block;

            auction_states.set(auction_id, AuctionState {
                total_committed:  effective_supply,
                total_payments:   state.total_payments,
                supply_met:       state.supply_met,
                ended_at_block:   ended_block,
                cleared:          is_cleared,
                clearing_price:   clearing_price,
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
    // No paused check — referral settlement is not a risk vector during emergency pause.

    fn push_referral_budget(
        public auction_id: field,
        public budget:     u128,   // D11: state.referral_budget
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
    // 8. claim — redeem RaiseBid (non-vesting auctions)
    // =========================================================================
    //
    // Pro-rata allocation:
    //   actual_quantity = effective_supply * bid.payment_amount / total_payments
    //
    // No refund — bidder pays in full; creator keeps all payments minus protocol fee.
    // Works for partial fill (effective_supply < supply) and exact fill (effective_supply == supply).
    //
    // D11 params: total_payments, effective_supply, sale_token_id.
    // bid.owner is private — token recipient is hidden.
    // assert(actual_quantity > 0): tiny payments relative to supply round to 0 → reject.
    // Frontend should warn: payment_amount * effective_supply >= total_payments (min for >0 allocation).

    fn claim(
        bid:                      RaiseBid,
        public total_payments:    u128,    // D11: state.total_payments
        public effective_supply:  u128,    // D11: state.effective_supply
        public sale_token_id:     field,
    ) -> (token_registry.aleo::Token, Final) {
        // Capture record fields before final {}
        let bid_auction_id:     field = bid.auction_id;
        let bid_payment_amount: u128 = bid.payment_amount;

        // Pro-rata allocation: payment's share of effective_supply.
        let actual_quantity: u128 = effective_supply * bid.payment_amount / total_payments;

        let (sale_token, f_mint): (token_registry.aleo::Token, Final) =
            token_registry.aleo::mint_private(
                sale_token_id,
                bid.owner,
                actual_quantity,
                false,
                4294967295u32,
            );

        return (sale_token, final {
            assert(!fairdrop_config_v2.aleo::paused.get_or_use(0field, false));
            f_mint.run();

            let config: AuctionConfig = auction_configs.get(bid_auction_id);
            let state:  AuctionState  = auction_states.get(bid_auction_id);

            assert(state.cleared);
            assert(!state.voided);
            assert(!config.vest_enabled);

            // D11 validations.
            assert_eq(total_payments,   state.total_payments);
            assert_eq(effective_supply, state.effective_supply);
            assert_eq(sale_token_id,    config.sale_token_id);
            // Guard: payment too small relative to supply would round actual_quantity to 0.
            assert(actual_quantity > 0u128);

            // Deduct from mint budget.
            let sale_remaining: u128 = escrow_sales.get(bid_auction_id);
            assert(actual_quantity <= sale_remaining);
            escrow_sales.set(bid_auction_id, sale_remaining - actual_quantity);

            // Deduct full bid payment from payment escrow (no refund).
            let payment_remaining: u128 = escrow_payments.get(bid_auction_id);
            assert(bid_payment_amount <= payment_remaining);
            escrow_payments.set(bid_auction_id, payment_remaining - bid_payment_amount);
        });
    }

    // =========================================================================
    // 9. claim_vested — redeem RaiseBid (vest_enabled auctions)
    // =========================================================================
    //
    // Issues a VestedAllocation record instead of an immediate Token.
    // No refund — bidder pays in full; uses effective_supply for pro-rata allocation.
    // Only vest_enabled auctions may use this path.

    fn claim_vested(
        bid:                      RaiseBid,
        public total_payments:    u128,
        public effective_supply:  u128,    // D11: state.effective_supply
        public sale_token_id:     field,
        public ended_at_block:    u32,
        public cliff_blocks:      u32,
        public vest_end_blocks:   u32,
    ) -> (fairdrop_vest_v2.aleo::VestedAllocation, Final) {
        // Capture record fields before final {}
        let bid_auction_id:     field   = bid.auction_id;
        let bid_owner:          address = bid.owner;
        let bid_payment_amount: u128    = bid.payment_amount;

        let actual_quantity: u128 = effective_supply * bid.payment_amount / total_payments;

        let (vest, f_vest): (fairdrop_vest_v2.aleo::VestedAllocation, Final) =
            fairdrop_vest_v2.aleo::create_vest(
                bid.auction_id,
                bid.owner,
                sale_token_id,
                actual_quantity,
                ended_at_block,
                cliff_blocks,
                vest_end_blocks,
            );

        return (vest, final {
            assert(!fairdrop_config_v2.aleo::paused.get_or_use(0field, false));
            f_vest.run();

            let config: AuctionConfig = auction_configs.get(bid_auction_id);
            let state:  AuctionState  = auction_states.get(bid_auction_id);

            assert(state.cleared);
            assert(!state.voided);
            assert(config.vest_enabled);

            assert_eq(total_payments,   state.total_payments);
            assert_eq(effective_supply, state.effective_supply);
            assert_eq(sale_token_id,    config.sale_token_id);
            assert_eq(ended_at_block,   state.ended_at_block);
            assert_eq(cliff_blocks,     config.vest_cliff_blocks);
            assert_eq(vest_end_blocks,  config.vest_end_blocks);
            assert(actual_quantity > 0u128);

            let sale_remaining: u128 = escrow_sales.get(bid_auction_id);
            assert(actual_quantity <= sale_remaining);
            escrow_sales.set(bid_auction_id, sale_remaining - actual_quantity);

            let payment_remaining: u128 = escrow_payments.get(bid_auction_id);
            assert(bid_payment_amount <= payment_remaining);
            escrow_payments.set(bid_auction_id, payment_remaining - bid_payment_amount);
        });
    }

    // =========================================================================
    // 10. withdraw_payments — creator withdraws raise revenue
    // =========================================================================
    //
    // Capped at state.creator_revenue (raise_target - protocol_fee).
    // Cannot exceed remaining escrow_payments — prevents solvency issues.
    // Callable multiple times (partial withdrawals ok).

    fn withdraw_payments(
        public auction_id: field,
        public amount:     u128,
        public recipient:  address,
    ) -> Final {
        assert(amount > 0u128);
        let caller: address = self.signer;
        let f0: Final = credits.aleo::transfer_public(recipient, amount as u64);
        return final {
            assert(!fairdrop_config_v2.aleo::paused.get_or_use(0field, false));
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
    // 11. withdraw_unsold — creator reclaims supply
    // =========================================================================
    //
    // Available in TWO cases:
    //   CLEARED: escrow_sales remainder after all claims is rounding dust
    //            (tiny amount due to integer floor division across all bidders).
    //   VOIDED:  target not met, or creator cancelled — full supply (escrow_sales)
    //            is returned to creator.
    //
    // Allows state.cleared OR state.voided (unlike Dutch which requires cleared only).

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
            assert(!fairdrop_config_v2.aleo::paused.get_or_use(0field, false));
            f_mint.run();

            let config: AuctionConfig = auction_configs.get(auction_id);
            let state:  AuctionState  = auction_states.get(auction_id);

            // Allow both cleared (rounding dust) and voided (full supply reclaim).
            assert(state.cleared || state.voided);
            assert_eq(caller,        config.creator);
            assert_eq(sale_token_id, config.sale_token_id);

            let escrow: u128    = escrow_sales.get(auction_id);
            let withdrawn: u128 = unsold_withdrawn.get_or_use(auction_id, 0u128);
            assert(amount <= escrow);
            unsold_withdrawn.set(auction_id, withdrawn + amount);
            escrow_sales.set(auction_id, escrow - amount);
        });
    }

    // =========================================================================
    // 12. cancel_auction — creator escape hatch
    // =========================================================================
    //
    // Creator cancels any non-cleared, non-voided auction at any time.
    // Full supply is minted back to creator from escrow_sales budget.
    // Bidder credits remain in escrow_payments — recovered via claim_voided.
    // Creation_fee is NOT refunded (anti-spam).

    fn cancel_auction(
        public auction_id:    field,
        public sale_token_id: field,
        public supply:        u128,   // D11: config.supply
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
            assert(!fairdrop_config_v2.aleo::paused.get_or_use(0field, false));
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

            // Mark voided; bidders recover via claim_voided.
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
    // Consumes the RaiseBid record (single-spend UTXO) and refunds payment_amount.
    //
    // Voiding occurs when:
    //   1. Creator calls cancel_auction (escape hatch).
    //   2. close_auction determines total_payments < raise_target (target not met).
    //
    // No paused check — emergency pause must not trap bidder capital.
    // bid.owner is private — refund recipient is hidden on-chain.

    fn claim_voided(
        bid: RaiseBid,
    ) -> (credits.aleo::credits, Final) {
        // Capture record fields before final {}
        let bid_auction_id:     field = bid.auction_id;
        let bid_payment_amount: u128  = bid.payment_amount;

        let (refund, f_refund): (credits.aleo::credits, Final) =
            credits.aleo::transfer_public_to_private(bid.owner, bid.payment_amount as u64);

        return (refund, final {
            // No paused check — voided claims are a recovery path that must always work.
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
}
