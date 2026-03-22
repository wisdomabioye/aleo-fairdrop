// fairdrop_ascending.aleo — Privacy-preserving ascending-price auction.
//
// Mechanism: price rises from floor_price toward ceiling_price in discrete steps.
// Early bidders pay less; late bidders pay more (pay-what-you-bid, no uniform clearing).
// No clearing-price refund at claim — bidders pay their bid-time cost exactly.
//
// Payment token : credits.aleo — private record OR public balance.
// Sale tokens   : token_registry.aleo/Token. Burned at create, re-minted at claim.
//
// Roles required:
//   fairdrop_ascending.aleo — SUPPLY_MANAGER_ROLE on sale token (burn + mint).
//   fairdrop_vest.aleo      — SUPPLY_MANAGER_ROLE on sale token (mint at release),
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
//   Distinct PROGRAM_SALT prevents cross-type ID collision with fairdrop_dutch.aleo.
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

import credits.aleo;
import token_registry.aleo;
import fairdrop_config.aleo;
import fairdrop_gate.aleo;
import fairdrop_proof.aleo;
import fairdrop_ref.aleo;
import fairdrop_vest.aleo;

program fairdrop_ascending.aleo {
    @admin(address="aleo128wz89c78ur4mx378056yd9q7kqmphr07k0kfsmnwvqnv7g9syyqkg263r")
    async constructor() {}

    // =========================================================================
    // Constants
    // =========================================================================

    const CREDITS_RESERVED_TOKEN_ID: field =
        3443843282313283355522573239085696902919850365217539366784739393210722344986field;

    const SUPPLY_MANAGER_ROLE: u8 = 3u8;

    // Distinguishes ascending auction_ids from other program types.
    // MUST differ from fairdrop_dutch (1field) and fairdrop_sealed (3field).
    const PROGRAM_SALT: field = 2field;

    // =========================================================================
    // Structs
    // =========================================================================

    struct TokenOwner { account: address, token_id: field }

    struct AuctionKey { creator: address, nonce: u64, program_salt: field }

    struct BidderKey { bidder: address, auction_id: field }

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
    }

    struct AuctionState {
        total_committed: u128,
        total_payments:  u128,
        supply_met:      bool,
        ended_at_block:  u32,
        cleared:         bool,
        clearing_price:  u128,  // always 0u128 for ascending (pay-what-you-bid)
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

    // Input struct: ascending-specific price parameters.
    struct AscendingParams {
        floor_price:       u128,
        ceiling_price:     u128,
        price_rise_blocks: u32,
        price_rise_amount: u128,
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

    // =========================================================================
    // 1. create_auction
    // =========================================================================

    async transition create_auction(
        token:                 token_registry.aleo/Token,
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

        let f_cfg: Future = fairdrop_config.aleo/assert_config(
            snapshot.fee_bps,
            snapshot.creation_fee,
            snapshot.closer_reward,
            snapshot.slash_reward_bps,
            snapshot.referral_pool_bps,
            start_block,
            end_block,
        );

        let f_gate: Future = fairdrop_gate.aleo/register_gate(
            auction_id,
            gate.gate_mode,
            gate.merkle_root,
            gate.issuer,
        );

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
        assert(!fairdrop_config.aleo/paused.get_or_use(0field, false));
        f_burn.await();
        f_creation.await();
        f_cfg.await();
        f_gate.await();

        assert_eq(config.payment_token_id, CREDITS_RESERVED_TOKEN_ID);
        assert(config.sale_token_id != CREDITS_RESERVED_TOKEN_ID);
        assert(config.start_block >= block.height);
        assert(config.floor_price > 0u128);
        assert(config.ceiling_price > config.floor_price);
        assert(config.price_rise_blocks > 0u32);
        assert(config.price_rise_amount > 0u128);
        assert(config.min_bid_amount > 0u128);
        assert(config.max_bid_amount == 0u128 || config.max_bid_amount >= config.min_bid_amount);

        // D11 nonce validation.
        assert_eq(nonce, creator_nonces.get_or_use(creator, 0u64));

        let expected_id: field = BHP256::hash_to_field(AuctionKey {
            creator:      creator,
            nonce:        nonce,
            program_salt: PROGRAM_SALT,
        });
        assert_eq(auction_id, expected_id);
        assert_eq(config.auction_id, auction_id);

        // Verify fairdrop_ascending.aleo has SUPPLY_MANAGER_ROLE on the sale token.
        let asc_role_key: field = BHP256::hash_to_field(TokenOwner {
            account:  fairdrop_ascending.aleo,
            token_id: config.sale_token_id,
        });
        assert_eq(
            token_registry.aleo/roles.get_or_use(asc_role_key, 0u8),
            SUPPLY_MANAGER_ROLE
        );

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
    // 2. place_bid_private — private credits UTXO
    // =========================================================================

    async transition place_bid_private(
        payment:               credits.aleo/credits,
        public auction_id:     field,
        public quantity:       u128,
        public payment_amount: u64,
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

        let bid: Bid = Bid {
            owner:          self.signer,
            auction_id:     auction_id,
            quantity:       quantity,
            payment_amount: payment_amount as u128,
        };

        return (change, bid, receipt, finalize_place_bid_private(
            f_credits, f_gate, f_proof,
            auction_id, bidder_key, quantity, payment_amount as u128,
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
        // ── shared ascending bid validation and state updates ─────────────────
        let config: AuctionConfig = auction_configs.get(auction_id);
        let state:  AuctionState  = auction_states.get(auction_id);
        assert(!state.supply_met);
        assert(!state.cleared);
        assert(!state.voided);
        assert(block.height >= config.start_block);
        assert(block.height <  config.end_block);
        let blocks_elapsed: u32  = block.height - config.start_block;
        let price_steps: u128    = (blocks_elapsed / config.price_rise_blocks) as u128;
        let rise: u128           = price_steps * config.price_rise_amount;
        let price_room: u128     = config.ceiling_price - config.floor_price;
        let current_price: u128  = rise < price_room
            ? config.floor_price + rise : config.ceiling_price;
        assert(payment_amount * config.sale_scale >= quantity * current_price);
        assert(quantity >= config.min_bid_amount);
        let new_committed: u128    = state.total_committed + quantity;
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
    // 3. place_bid_public — public credits balance
    // =========================================================================

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
            f_credits, f_gate, f_proof,
            auction_id, bidder_key, quantity, payment_amount as u128,
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
        // ── shared ascending bid validation and state updates ─────────────────
        let config: AuctionConfig = auction_configs.get(auction_id);
        let state:  AuctionState  = auction_states.get(auction_id);
        assert(!state.supply_met);
        assert(!state.cleared);
        assert(!state.voided);
        assert(block.height >= config.start_block);
        assert(block.height <  config.end_block);
        let blocks_elapsed: u32  = block.height - config.start_block;
        let price_steps: u128    = (blocks_elapsed / config.price_rise_blocks) as u128;
        let rise: u128           = price_steps * config.price_rise_amount;
        let price_room: u128     = config.ceiling_price - config.floor_price;
        let current_price: u128  = rise < price_room
            ? config.floor_price + rise : config.ceiling_price;
        assert(payment_amount * config.sale_scale >= quantity * current_price);
        assert(quantity >= config.min_bid_amount);
        let new_committed: u128    = state.total_committed + quantity;
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

    async transition place_bid_private_ref(
        payment:               credits.aleo/credits,
        public auction_id:     field,
        public quantity:       u128,
        public payment_amount: u64,
        public code_id:        field,
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
            f_credits, f_gate, f_proof, f_ref,
            auction_id, bidder_key, quantity, payment_amount as u128,
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
        // ── shared ascending bid validation and state updates ─────────────────
        let config: AuctionConfig = auction_configs.get(auction_id);
        let state:  AuctionState  = auction_states.get(auction_id);
        assert(!state.supply_met);
        assert(!state.cleared);
        assert(!state.voided);
        assert(block.height >= config.start_block);
        assert(block.height <  config.end_block);
        let blocks_elapsed: u32  = block.height - config.start_block;
        let price_steps: u128    = (blocks_elapsed / config.price_rise_blocks) as u128;
        let rise: u128           = price_steps * config.price_rise_amount;
        let price_room: u128     = config.ceiling_price - config.floor_price;
        let current_price: u128  = rise < price_room
            ? config.floor_price + rise : config.ceiling_price;
        assert(payment_amount * config.sale_scale >= quantity * current_price);
        assert(quantity >= config.min_bid_amount);
        let new_committed: u128    = state.total_committed + quantity;
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
            f_credits, f_gate, f_proof, f_ref,
            auction_id, bidder_key, quantity, payment_amount as u128,
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
        // ── shared ascending bid validation and state updates ─────────────────
        let config: AuctionConfig = auction_configs.get(auction_id);
        let state:  AuctionState  = auction_states.get(auction_id);
        assert(!state.supply_met);
        assert(!state.cleared);
        assert(!state.voided);
        assert(block.height >= config.start_block);
        assert(block.height <  config.end_block);
        let blocks_elapsed: u32  = block.height - config.start_block;
        let price_steps: u128    = (blocks_elapsed / config.price_rise_blocks) as u128;
        let rise: u128           = price_steps * config.price_rise_amount;
        let price_room: u128     = config.ceiling_price - config.floor_price;
        let current_price: u128  = rise < price_room
            ? config.floor_price + rise : config.ceiling_price;
        assert(payment_amount * config.sale_scale >= quantity * current_price);
        assert(quantity >= config.min_bid_amount);
        let new_committed: u128    = state.total_committed + quantity;
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
    // Revenue = total_payments (pay-what-you-bid — no uniform clearing price).
    // Caller receives closer_reward from protocol_treasury.
    //
    // D11 params: creator, filled, volume, closer_reward validated in finalize.

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
            fairdrop_proof.aleo/update_reputation(creator, filled, volume);

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
        assert(!fairdrop_config.aleo/paused.get_or_use(0field, false));
        f_closer.await();
        f_proof.await();

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
    }

    // =========================================================================
    // 7. push_referral_budget — permissionless; call after close_auction
    // =========================================================================

    async transition push_referral_budget(
        public auction_id: field,
        public budget:     u128,
    ) -> Future {
        let f_credits: Future =
            credits.aleo/transfer_public(fairdrop_ref.aleo, budget as u64);

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
    // 8. claim — redeem Bid record (non-vesting ascending auctions)
    // =========================================================================
    //
    // No clearing-price refund: bidders paid their bid-time price; payment_amount
    // stays in escrow and is settled via creator_revenue + protocol_fee accounting.
    // bid.owner is private — token recipient is hidden on-chain.

    async transition claim(
        bid:                  Bid,
        public sale_token_id: field,
    ) -> (token_registry.aleo/Token, Future) {
        let sale_amount: u128 = bid.quantity;

        let (sale_token, f_mint): (token_registry.aleo/Token, Future) =
            token_registry.aleo/mint_private(
                sale_token_id,
                bid.owner,
                sale_amount,
                false,
                4294967295u32,
            );

        return (sale_token, finalize_claim(
            f_mint, bid.auction_id, sale_token_id, sale_amount,
        ));
    }

    async function finalize_claim(
        f_mint:        Future,
        auction_id:    field,
        sale_token_id: field,
        sale_amount:   u128,
    ) {
        assert(!fairdrop_config.aleo/paused.get_or_use(0field, false));
        f_mint.await();

        let config: AuctionConfig = auction_configs.get(auction_id);
        let state:  AuctionState  = auction_states.get(auction_id);

        assert(state.cleared);
        assert(!state.voided);
        assert(!config.vest_enabled);
        assert_eq(sale_token_id, config.sale_token_id);

        let sale_remaining: u128 = escrow_sales.get(auction_id);
        assert(sale_amount <= sale_remaining);
        escrow_sales.set(auction_id, sale_remaining - sale_amount);
    }

    // =========================================================================
    // 9. claim_vested — redeem Bid record (vest_enabled ascending auctions)
    // =========================================================================

    async transition claim_vested(
        bid:                    Bid,
        public sale_token_id:   field,
        public ended_at_block:  u32,
        public cliff_blocks:    u32,
        public vest_end_blocks: u32,
    ) -> (fairdrop_vest.aleo/VestedAllocation, Future) {
        let sale_amount: u128 = bid.quantity;

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

        return (vest, finalize_claim_vested(
            f_vest, bid.auction_id, sale_token_id, sale_amount,
            ended_at_block, cliff_blocks, vest_end_blocks,
        ));
    }

    async function finalize_claim_vested(
        f_vest:          Future,
        auction_id:      field,
        sale_token_id:   field,
        sale_amount:     u128,
        ended_at_block:  u32,
        cliff_blocks:    u32,
        vest_end_blocks: u32,
    ) {
        assert(!fairdrop_config.aleo/paused.get_or_use(0field, false));
        f_vest.await();

        let config: AuctionConfig = auction_configs.get(auction_id);
        let state:  AuctionState  = auction_states.get(auction_id);

        assert(state.cleared);
        assert(!state.voided);
        assert(config.vest_enabled);
        assert_eq(sale_token_id,  config.sale_token_id);
        assert_eq(ended_at_block,  state.ended_at_block);
        assert_eq(cliff_blocks,    config.vest_cliff_blocks);
        assert_eq(vest_end_blocks, config.vest_end_blocks);

        let sale_remaining: u128 = escrow_sales.get(auction_id);
        assert(sale_amount <= sale_remaining);
        escrow_sales.set(auction_id, sale_remaining - sale_amount);
    }

    // =========================================================================
    // 10. withdraw_payments — creator withdraws revenue
    // =========================================================================
    //
    // Capped at state.creator_revenue = total_payments - protocol_fee.
    // protocol_fee portion remains in escrow_payments for the protocol.

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
        assert(!fairdrop_config.aleo/paused.get_or_use(0field, false));
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
    // 12. cancel_auction — creator escape hatch
    // =========================================================================
    //
    // Mints full supply back to creator. Bidder payments remain in escrow;
    // bidders recover via claim_voided. creation_fee is NOT refunded.

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
        assert(!fairdrop_config.aleo/paused.get_or_use(0field, false));
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
    // 13. claim_voided — bidder recovers payment from a voided auction
    // =========================================================================
    //
    // No paused check — emergency pause must not trap bidder capital.
    // Full payment_amount refunded (pay-what-you-bid: no partial recovery).

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
}
