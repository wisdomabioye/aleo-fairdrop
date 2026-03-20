// Fairdrop v2 - Privacy-preserving descending-price auction on Aleo.
//
// Payment token : Aleo Credits (credits.aleo), private record OR public balance.
// Sale tokens   : token_registry.aleo/Token, deposited as private record at auction creation.
//                 Fairdrop burns the deposit (freeing max_supply headroom), then re-mints
//                 privately to winners at claim time. Net supply change = 0.
// Roles required: fairdrop_v4.aleo must hold SUPPLY_MANAGER_ROLE (3) on the sale token.
//                 This covers both burn_private (deposit) and mint_private (claim/withdraw).
// Privacy model :
//   - Bid amount  : public (unavoidable - required for on-chain supply accounting).
//   - Bid source  : hidden when using place_bid_private (private UTXO consumed).
//   - Claim recipient : private - bid.owner comes from the private Bid record and
//                       never appears in any finalize function.
//   - Sale tokens received  : private (mint_private CPI, recipient hidden).
//   - Refund received       : private (transfer_public_to_private CPI, recipient hidden).
//   - Recommended for max privacy: use a fresh address funded via private transfer for bidding.

import credits.aleo;
import token_registry.aleo;

program fairdrop_dutch.aleo {
    @admin(address="aleo128wz89c78ur4mx378056yd9q7kqmphr07k0kfsmnwvqnv7g9syyqkg263r")
    async constructor() {}

    // =========================================================================
    // Shadowed structs (From external programs)
    // =========================================================================

    // From token_registry.aleo - used for BHP256 role-key hashing.
    struct TokenOwner {
        account: address,
        token_id: field,
    }

    // =========================================================================
    // Records (Private - encrypted to owner)
    // =========================================================================

    // Private bid receipt. Consumed once at claim time - no double claims.
    record Bid {
        owner: address,
        auction_id: field,
        quantity: u128,
        payment_amount: u128,   // microcredits paid (u64 range, stored as u128)
    }

    // =========================================================================
    // Structs
    // =========================================================================

    // Immutable auction parameters set by the creator.
    struct AuctionConfig {
        auction_id: field,
        creator: address,
        sale_token_id: field,
        payment_token_id: field,    // always CREDITS_RESERVED_TOKEN_ID in v2; kept for future ARC-20 stablecoin support
        supply: u128,               // raw on-chain token units
        start_price: u128,          // microcredits per human-readable token unit
        floor_price: u128,          // microcredits per human-readable token unit
        start_block: u32,
        end_block: u32,
        price_decay_blocks: u32,
        price_decay_amount: u128,   // microcredits per human-readable token unit per step
        max_bid_amount: u128,       // raw token units; 0 = unlimited per bidder
        min_bid_amount: u128,       // raw token units
        sale_scale: u128,           // 10^sale_token_decimals, passed at creation by creator
    }

    // Mutable auction state updated during the lifecycle.
    struct AuctionState {
        total_committed: u128,      // total sale tokens bid for
        total_payments: u128,       // total microcredits collected
        supply_met: bool,
        ended_at_block: u32,        // block when supply was exhausted (0 if not yet)
        cleared: bool,
        clearing_price: u128,       // uniform price all winners pay
        creator_revenue: u128,      // total_committed * clearing_price / sale_scale (microcredits)
    }

    // Used to hash (bidder, auction_id) → pseudonymous key for per-bidder limits.
    struct BidderKey {
        bidder: address,
        auction_id: field,
    }

    // Used to derive auction_id = hash(creator, nonce).
    struct AuctionKey {
        creator: address,
        nonce: u64,
    }

    struct Stats {
        total_auctions: u64,
        total_bids: u64,
        total_payment_collected: u128, // Total microcredits collected
    }

    // =========================================================================
    // Constants
    // =========================================================================

    // ALEO credits registered in token_registry.aleo.
    const CREDITS_RESERVED_TOKEN_ID: field =
        3443843282313283355522573239085696902919850365217539366784739393210722344986field;

    const MINTER_ROLE: u8 = 1u8;
    const BURNER_ROLE: u8 = 2u8;
    const SUPPLY_MANAGER_ROLE: u8 = 3u8;

    // =========================================================================
    // Mappings (Public - on-chain state)
    // =========================================================================

    mapping auction_configs: field => AuctionConfig;
    mapping auction_states: field => AuctionState;

    // Cumulative bid quantity per hash(BidderKey) - enforces max_bid_amount.
    // Bidder identity is pseudonymous: only the BHP256 hash reaches finalize.
    mapping bid_totals: field => u128;

    // Burn-backed token budget per auction (decremented at each claim and withdraw_unsold).
    // Initialised to the amount burned at create_auction. mint_private at claim/withdraw
    // re-creates tokens within this budget — net supply change across the lifecycle is zero.
    mapping escrow_sales: field => u128;

    // Microcredits held per auction (decremented at each claim refund and creator withdrawal).
    // Actual credits live in fairdrop's credits.aleo/account public balance.
    mapping escrow_payments: field => u128;

    mapping creator_withdrawn: field => u128;
    mapping unsold_withdrawn: field => u128;

    mapping stats: field => Stats;

    // Global sequential index: total_auctions_at_creation → auction_id.
    mapping auction_index: u64 => field;

    // Per-creator count + linked list for O(K) creator auction discovery.
    mapping creator_auction_count: address => u64;
    mapping creator_latest_auction: address => field;
    mapping auction_prev_by_creator: field => field;

    // =========================================================================
    // 1. Create Auction
    // =========================================================================

    // Creator deposits a private Token record as auction supply.
    // fairdrop burns the deposit immediately (burn_private CPI), freeing max_supply
    // headroom so that claim (mint_private) is always guaranteed to succeed.
    // Change (token.amount - supply) is returned to the creator as a private record.
    // Requires fairdrop_v4.aleo to hold SUPPLY_MANAGER_ROLE on the sale token.
    async transition create_auction(
        token: token_registry.aleo/Token,   // private deposit — consumed and burned
        public sale_token_id: field,
        public payment_token_id: field,
        public supply: u128,                // auction portion (≤ token.amount), raw token units
        public start_price: u128,
        public floor_price: u128,
        public start_block: u32,
        public end_block: u32,
        public price_decay_blocks: u32,
        public price_decay_amount: u128,
        public max_bid_amount: u128,
        public min_bid_amount: u128,
        public sale_scale: u128,            // 10^sale_token_decimals
    ) -> (token_registry.aleo/Token, Future) {
        assert(supply > 0u128);
        assert(token.amount >= supply);
        assert_eq(token.token_id, sale_token_id);

        // Burn exactly `supply` tokens. Remainder (token.amount - supply) returned to creator.
        // burn_private requires BURNER_ROLE or SUPPLY_MANAGER_ROLE for self.caller.
        let (remainder, f_burn): (token_registry.aleo/Token, Future) =
            token_registry.aleo/burn_private(token, supply);

        return (remainder, finalize_create_auction(
            f_burn,
            self.signer,
            sale_token_id,
            supply,
            payment_token_id,
            start_price,
            floor_price,
            start_block,
            end_block,
            price_decay_blocks,
            price_decay_amount,
            max_bid_amount,
            min_bid_amount,
            sale_scale,
        ));
    }

    async function finalize_create_auction(
        f_burn: Future,
        creator: address,
        sale_token_id: field,
        supply: u128,
        payment_token_id: field,
        start_price: u128,
        floor_price: u128,
        start_block: u32,
        end_block: u32,
        price_decay_blocks: u32,
        price_decay_amount: u128,
        max_bid_amount: u128,
        min_bid_amount: u128,
        sale_scale: u128,
    ) {
        f_burn.await();

        // Only ALEO credits supported as payment token in v2.
        assert_eq(payment_token_id, CREDITS_RESERVED_TOKEN_ID);
        assert(sale_token_id != CREDITS_RESERVED_TOKEN_ID);

        // Validate auction parameters.
        assert(start_block >= block.height);
        assert(floor_price > 0u128);
        assert(start_price > floor_price);
        assert(end_block > start_block);
        assert(price_decay_blocks > 0u32);
        assert(price_decay_amount > 0u128);
        assert(supply > 0u128);
        assert(min_bid_amount > 0u128);
        assert(max_bid_amount == 0u128 || max_bid_amount >= min_bid_amount);

        // Verify fairdrop_v4.aleo has SUPPLY_MANAGER_ROLE on the sale token.
        // SUPPLY_MANAGER_ROLE covers both burn_private (deposit) and mint_private (claim).
        let role_owner: TokenOwner = TokenOwner {
            account: fairdrop_v4.aleo,
            token_id: sale_token_id,
        };
        let role_owner_hash: field = BHP256::hash_to_field(role_owner);
        let role: u8 = token_registry.aleo/roles.get_or_use(role_owner_hash, 0u8);
        assert(role == SUPPLY_MANAGER_ROLE);

        // Derive auction_id from creator + sequential nonce.
        let current_stats: Stats = stats.get_or_use(0field, Stats {
            total_auctions: 0u64,
            total_bids: 0u64,
            total_payment_collected: 0u128
        });

        let auction_id: field = BHP256::hash_to_field(
            AuctionKey { creator: creator, nonce: current_stats.total_auctions }
        );

        auction_configs.set(auction_id, AuctionConfig {
            auction_id: auction_id,
            creator: creator,
            sale_token_id: sale_token_id,
            payment_token_id: payment_token_id,
            supply: supply,
            start_price: start_price,
            floor_price: floor_price,
            start_block: start_block,
            end_block: end_block,
            price_decay_blocks: price_decay_blocks,
            price_decay_amount: price_decay_amount,
            max_bid_amount: max_bid_amount,
            min_bid_amount: min_bid_amount,
            sale_scale: sale_scale,
        });

        auction_states.set(auction_id, AuctionState {
            total_committed: 0u128,
            total_payments: 0u128,
            supply_met: false,
            ended_at_block: 0u32,
            cleared: false,
            clearing_price: 0u128,
            creator_revenue: 0u128,
        });

        // Set mint budget. No tokens are held - this tracks how many can still be minted.
        escrow_sales.set(auction_id, supply);

        // Register in global sequential index.
        auction_index.set(current_stats.total_auctions, auction_id);

        // Update per-creator count and linked list.
        let creator_count: u64 = creator_auction_count.get_or_use(creator, 0u64);
        creator_auction_count.set(creator, creator_count + 1u64);
        let prev_head: field = creator_latest_auction.get_or_use(creator, 0field);
        auction_prev_by_creator.set(auction_id, prev_head);
        creator_latest_auction.set(creator, auction_id);

        stats.set(0field, Stats {
            total_auctions: current_stats.total_auctions + 1u64,
            total_bids: current_stats.total_bids,
            total_payment_collected: current_stats.total_payment_collected
        });
    }

    // =========================================================================
    // 2. Place Bid - Private Credits
    // =========================================================================

    // Bidder provides a private credits.aleo/credits record.
    // payment_amount microcredits are transferred to fairdrop's public credits balance;
    // a change record is returned to the bidder.
    //
    // What is hidden  : which UTXO was consumed (input record serial number).
    // Maximum privacy tip : use a fresh address funded via private transfer for bidding.
    async transition place_bid_private(
        payment: credits.aleo/credits,
        public auction_id: field,
        public quantity: u128,
        public payment_amount: u64,
    ) -> (credits.aleo/credits, Bid, Future) {
        assert(quantity > 0u128);
        assert(payment_amount > 0u64);

        // Consume the private credits record. Deposits payment_amount to fairdrop's
        // public credits.aleo/account balance. Returns change record to caller.
        let (change, f0): (credits.aleo/credits, Future) =
            credits.aleo/transfer_private_to_public(payment, self.address, payment_amount);

        let bid: Bid = Bid {
            owner: self.signer,
            auction_id: auction_id,
            quantity: quantity,
            payment_amount: payment_amount as u128,
        };

        let bid_total_key: field = BHP256::hash_to_field(
            BidderKey { bidder: self.signer, auction_id: auction_id }
        );

        return (change, bid, finalize_place_bid_private(
            f0,
            auction_id,
            bid_total_key,
            quantity,
            payment_amount as u128,
        ));
    }

    async function finalize_place_bid_private(
        f0: Future,
        auction_id: field,
        bid_total_key: field,
        quantity: u128,
        payment_amount: u128,
    ) {
        f0.await();

        let config: AuctionConfig = auction_configs.get(auction_id);
        let state: AuctionState = auction_states.get(auction_id);

        assert(!state.supply_met);
        assert(!state.cleared);
        assert(block.height >= config.start_block);
        assert(block.height < config.end_block);

        let blocks_elapsed: u32 = block.height - config.start_block;
        let decay_steps: u128 = (blocks_elapsed / config.price_decay_blocks) as u128;
        let total_decay: u128 = decay_steps * config.price_decay_amount;
        let price_range: u128 = config.start_price - config.floor_price;
        let current_price: u128 = total_decay < price_range
            ? config.start_price - total_decay
            : config.floor_price;

        assert(payment_amount * config.sale_scale >= quantity * current_price);
        assert(quantity >= config.min_bid_amount);
        assert(state.total_committed + quantity <= config.supply);

        let current_total: u128 = bid_totals.get_or_use(bid_total_key, 0u128);
        let new_total: u128 = current_total + quantity;
        let within_limit: bool = config.max_bid_amount == 0u128
            || new_total <= config.max_bid_amount;
        assert(within_limit);
        bid_totals.set(bid_total_key, new_total);

        let new_committed: u128 = state.total_committed + quantity;
        let is_supply_met: bool = new_committed >= config.supply;

        auction_states.set(auction_id, AuctionState {
            total_committed: new_committed,
            total_payments: state.total_payments + payment_amount,
            supply_met: is_supply_met,
            ended_at_block: is_supply_met ? block.height : state.ended_at_block,
            cleared: false,
            clearing_price: 0u128,
            creator_revenue: 0u128, // payment_amount not revenue yet until cleared
        });

        let current_escrow: u128 = escrow_payments.get_or_use(auction_id, 0u128);
        escrow_payments.set(auction_id, current_escrow + payment_amount);

        let current_stats: Stats = stats.get(0field);
        stats.set(0field, Stats {
            total_auctions: current_stats.total_auctions,
            total_bids: current_stats.total_bids + 1u64,
            total_payment_collected: current_stats.total_payment_collected + payment_amount
        });
    }

    // =========================================================================
    // 3. Place Bid - Public Credits
    // =========================================================================

    // Bidder pays from their public credits.aleo/account mapping balance.
    // transfer_public_as_signer pulls from self.signer (the original tx initiator),
    // not self.caller (fairdrop_v4.aleo), so no pre-approval is needed.
    async transition place_bid_public(
        public auction_id: field,
        public quantity: u128,
        public payment_amount: u64,
    ) -> (Bid, Future) {
        assert(quantity > 0u128);
        assert(payment_amount > 0u64);

        let f0: Future = credits.aleo/transfer_public_as_signer(self.address, payment_amount);

        let bid: Bid = Bid {
            owner: self.signer,
            auction_id: auction_id,
            quantity: quantity,
            payment_amount: payment_amount as u128,
        };

        let bid_total_key: field = BHP256::hash_to_field(
            BidderKey { bidder: self.signer, auction_id: auction_id }
        );

        return (bid, finalize_place_bid_public(
            f0,
            auction_id,
            bid_total_key,
            quantity,
            payment_amount as u128,
        ));
    }

    async function finalize_place_bid_public(
        f0: Future,
        auction_id: field,
        bid_total_key: field,
        quantity: u128,
        payment_amount: u128,
    ) {
        f0.await();

        let config: AuctionConfig = auction_configs.get(auction_id);
        let state: AuctionState = auction_states.get(auction_id);

        assert(!state.supply_met);
        assert(!state.cleared);
        assert(block.height >= config.start_block);
        assert(block.height < config.end_block);

        let blocks_elapsed: u32 = block.height - config.start_block;
        let decay_steps: u128 = (blocks_elapsed / config.price_decay_blocks) as u128;
        let total_decay: u128 = decay_steps * config.price_decay_amount;
        let price_range: u128 = config.start_price - config.floor_price;
        let current_price: u128 = total_decay < price_range
            ? config.start_price - total_decay
            : config.floor_price;

        assert(payment_amount * config.sale_scale >= quantity * current_price);
        assert(quantity >= config.min_bid_amount);
        assert(state.total_committed + quantity <= config.supply);

        let current_total: u128 = bid_totals.get_or_use(bid_total_key, 0u128);
        let new_total: u128 = current_total + quantity;
        let within_limit: bool = config.max_bid_amount == 0u128
            || new_total <= config.max_bid_amount;
        assert(within_limit);
        bid_totals.set(bid_total_key, new_total);

        let new_committed: u128 = state.total_committed + quantity;
        let is_supply_met: bool = new_committed >= config.supply;

        auction_states.set(auction_id, AuctionState {
            total_committed: new_committed,
            total_payments: state.total_payments + payment_amount,
            supply_met: is_supply_met,
            ended_at_block: is_supply_met ? block.height : state.ended_at_block,
            cleared: false,
            clearing_price: 0u128,
            creator_revenue: 0u128,
        });

        let current_escrow: u128 = escrow_payments.get_or_use(auction_id, 0u128);
        escrow_payments.set(auction_id, current_escrow + payment_amount);

        let current_stats: Stats = stats.get(0field);
        stats.set(0field, Stats {
            total_auctions: current_stats.total_auctions,
            total_bids: current_stats.total_bids + 1u64,
            total_payment_collected: current_stats.total_payment_collected + payment_amount
        });
    }

    // =========================================================================
    // 4. Close Auction (Permissionless)
    // =========================================================================

    // Anyone can call once the auction has ended (supply met OR past end_block).
    // Determines the clearing price and locks it permanently.
    //
    // Clearing price:
    //   Supply met     → price at the block when supply was exhausted
    //   Supply not met → floor_price (market did not clear above floor)
    async transition close_auction(public auction_id: field) -> Future {
        return finalize_close_auction(auction_id);
    }

    async function finalize_close_auction(auction_id: field) {
        let config: AuctionConfig = auction_configs.get(auction_id);
        let state: AuctionState = auction_states.get(auction_id);

        assert(!state.cleared);
        assert(state.supply_met || block.height >= config.end_block);

        if (state.supply_met) {
            let blocks_elapsed: u32 = state.ended_at_block - config.start_block;
            let decay_steps: u128 = (blocks_elapsed / config.price_decay_blocks) as u128;
            let total_decay: u128 = decay_steps * config.price_decay_amount;
            let price_range: u128 = config.start_price - config.floor_price;
            let clearing_price: u128 = total_decay < price_range
                ? config.start_price - total_decay
                : config.floor_price;
            let revenue: u128 = state.total_committed * clearing_price / config.sale_scale;

            auction_states.set(auction_id, AuctionState {
                total_committed: state.total_committed,
                total_payments: state.total_payments,
                supply_met: state.supply_met,
                ended_at_block: state.ended_at_block,
                cleared: true,
                clearing_price: clearing_price,
                creator_revenue: revenue,
            });
        } else {
            let clearing_price: u128 = config.floor_price;
            let revenue: u128 = state.total_committed * clearing_price / config.sale_scale;

            auction_states.set(auction_id, AuctionState {
                total_committed: state.total_committed,
                total_payments: state.total_payments,
                supply_met: state.supply_met,
                ended_at_block: state.ended_at_block,
                cleared: true,
                clearing_price: clearing_price,
                creator_revenue: revenue,
            });
        }
    }

    // =========================================================================
    // 5. Claim
    // =========================================================================

    // Bidder redeems their Bid record after the auction is cleared.
    // Returns two private outputs:
    //   1. token_registry.aleo/Token  - sale tokens, minted via MINTER_ROLE CPI.
    //   2. credits.aleo/credits       - overpayment refund above clearing price.
    //
    // Both recipients are bid.owner - a private field from the consumed Bid record.
    // bid.owner never appears in any finalize function, so neither recipient
    // nor the amounts they receive are linked on-chain.
    //
    // Note: refund_amount is visible in finalize.
    // The recipient of the refund is NOT visible.
    async transition claim(
        bid: Bid,
        public clearing_price: u128,
        public sale_token_id: field,
        public sale_scale: u128,
    ) -> (token_registry.aleo/Token, credits.aleo/credits, Future) {
        let sale_amount: u128 = bid.quantity;
        let cost_at_clearing: u128 = bid.quantity * clearing_price / sale_scale;
        let refund_amount: u64 = (bid.payment_amount - cost_at_clearing) as u64;

        // CPI: mint sale tokens privately to bidder.
        // bid.owner is private (from Bid record) - never exposed in finalize.
        let (sale_token, f_mint): (token_registry.aleo/Token, Future) =
            token_registry.aleo/mint_private(
                sale_token_id,
                bid.owner,
                sale_amount,
                false,          // external_authorization_required
                4294967295u32   // authorized_until - no expiry
            );

        // CPI: return refund privately from fairdrop's public credits balance.
        // transfer_public_to_private takes recipient as address.private - stays hidden.
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
        f_mint: Future,
        f_refund: Future,
        auction_id: field,
        clearing_price: u128,
        sale_token_id: field,
        sale_scale: u128,
        sale_amount: u128,
        refund_amount: u128,
    ) {
        f_mint.await();
        f_refund.await();

        let config: AuctionConfig = auction_configs.get(auction_id);
        let state: AuctionState = auction_states.get(auction_id);

        assert(state.cleared);
        assert_eq(clearing_price, state.clearing_price);
        assert_eq(sale_token_id, config.sale_token_id);
        assert_eq(sale_scale, config.sale_scale);

        // Deduct from mint budget.
        let sale_remaining: u128 = escrow_sales.get(auction_id);
        assert(sale_amount <= sale_remaining);
        escrow_sales.set(auction_id, sale_remaining - sale_amount);

        // Deduct refund from credits escrow.
        let payment_remaining: u128 = escrow_payments.get(auction_id);
        assert(refund_amount <= payment_remaining);
        escrow_payments.set(auction_id, payment_remaining - refund_amount);
    }

    // =========================================================================
    // 6. Creator Withdrawals
    // =========================================================================

    // Creator withdraws earned revenue (microcredits) after clearing.
    // Transfers from fairdrop's public credits.aleo/account balance to creator.
    // Capped at creator_revenue to protect the bidder refund pool.
    async transition withdraw_payments(
        public auction_id: field,
        public amount: u128,
    ) -> Future {
        assert(amount > 0u128);

        // transfer_public pulls from self.caller's (fairdrop_v4.aleo) public balance.
        let f0: Future = credits.aleo/transfer_public(self.signer, amount as u64);

        return finalize_withdraw_payments(f0, auction_id, self.signer, amount);
    }

    async function finalize_withdraw_payments(
        f0: Future,
        auction_id: field,
        caller: address,
        amount: u128,
    ) {
        f0.await();

        let config: AuctionConfig = auction_configs.get(auction_id);
        let state: AuctionState = auction_states.get(auction_id);

        assert(state.cleared);
        assert_eq(caller, config.creator);

        let withdrawn: u128 = creator_withdrawn.get_or_use(auction_id, 0u128);
        let new_withdrawn: u128 = withdrawn + amount;
        assert(new_withdrawn <= state.creator_revenue);
        creator_withdrawn.set(auction_id, new_withdrawn);

        let escrow: u128 = escrow_payments.get(auction_id);
        assert(amount <= escrow);
        escrow_payments.set(auction_id, escrow - amount);
    }

    // Creator mints remaining unsold tokens to themselves after clearing.
    // Only available when supply was not fully committed.
    // Returns a private token_registry.aleo/Token record to the creator.
    async transition withdraw_unsold(
        public auction_id: field,
        public amount: u128,
        public sale_token_id: field,
    ) -> (token_registry.aleo/Token, Future) {
        assert(amount > 0u128);

        let (token, f_mint): (token_registry.aleo/Token, Future) =
            token_registry.aleo/mint_private(
                sale_token_id,
                self.signer,
                amount,
                false,
                4294967295u32
            );

        return (token, finalize_withdraw_unsold(
            f_mint, auction_id, self.signer, amount, sale_token_id
        ));
    }

    async function finalize_withdraw_unsold(
        f_mint: Future,
        auction_id: field,
        caller: address,
        amount: u128,
        sale_token_id: field,
    ) {
        f_mint.await();

        let config: AuctionConfig = auction_configs.get(auction_id);
        let state: AuctionState = auction_states.get(auction_id);

        assert(state.cleared);
        assert_eq(caller, config.creator);
        assert_eq(sale_token_id, config.sale_token_id);

        // Unsold = supply - total_committed. Creator can only withdraw this amount.
        let unsold: u128 = config.supply - state.total_committed;
        let withdrawn: u128 = unsold_withdrawn.get_or_use(auction_id, 0u128);
        let new_withdrawn: u128 = withdrawn + amount;
        assert(new_withdrawn <= unsold);
        unsold_withdrawn.set(auction_id, new_withdrawn);

        // Deduct from mint budget.
        let escrow: u128 = escrow_sales.get(auction_id);
        assert(amount <= escrow);
        escrow_sales.set(auction_id, escrow - amount);
    }
}
