// fairdrop_config.aleo — Protocol configuration root contract.
//
// Root dependency of the entire Fairdrop protocol. Deployed first.
// All other Fairdrop contracts import this to read or validate protocol params.
//
// Responsibility:
//   - Store all mutable protocol parameters (fee rates, rewards, limits).
//   - Provide admin-gated setters (with range guards) so params can be updated
//     without redeploying any auction contract.
//   - Provide assert_config() for auction contracts to validate their snapshotted
//     params at create_auction time (D16 in DESIGN.md).
//   - Provide assert_ref_bps() for fairdrop_ref.aleo to enforce the referral cap
//     at create_code time.
//   - Provide check_not_paused() as a CPI guard for all auction finalize functions.
//
// No money flows through this contract. No records. No escrow.
// Admin authority: protocol_admin mapping (defaults to INITIAL_ADMIN constant).
//
// ── KNOWN OPERATIONAL RISK ──────────────────────────────────────────────────
// set_protocol_admin() is a single-step immediate transfer. Calling it with a
// wrong address permanently locks out the current admin — the only recovery path
// is a contract upgrade via the @admin mechanism (which is a nuclear option and
// requires the deployer key, not the protocol_admin key).
//
// PLAN: before mainnet, replace INITIAL_ADMIN with a multisig address and call
// set_protocol_admin(multisig) as the first post-deploy transaction.
// Tracked: pre-mainnet checklist item — "Transfer protocol_admin to multisig".
// ────────────────────────────────────────────────────────────────────────────

program fairdrop_config.aleo {
    // Upgradeable by the deployer address.
    @admin(address="aleo128wz89c78ur4mx378056yd9q7kqmphr07k0kfsmnwvqnv7g9syyqkg263r")
    async constructor() {}

    // =========================================================================
    // Constants — default values active before any set_* call
    // =========================================================================

    // Canonical key for all single-value mappings.
    const CONFIG_KEY: field = 0field;

    // Initial protocol admin. Overridable via set_protocol_admin.
    // Must match the @admin address above so the deployer controls both
    // contract upgrades and operational parameters from day one.
    const INITIAL_ADMIN: address = aleo128wz89c78ur4mx378056yd9q7kqmphr07k0kfsmnwvqnv7g9syyqkg263r;

    // Protocol fee rate on total_payments at close_auction. 250 bps = 2.5%.
    const DEFAULT_FEE_BPS: u16 = 250u16;
    // Hard ceiling: fee cannot exceed 10% regardless of what admin sets.
    const MAX_FEE_BPS: u16 = 1000u16;

    // Microcredits deducted from creator at create_auction (anti-spam deposit).
    const DEFAULT_CREATION_FEE: u128 = 10_000u128;
    // Hard ceiling: 1_000_000_000 microcredits = 1000 credits.
    // Prevents a misconfigured fee from halting all auction creation (DoS window
    // between bad set_* tx and corrective tx). 100,000× the default — generous
    // headroom while keeping the value operationally sane.
    const MAX_CREATION_FEE: u128 = 1_000_000_000u128;

    // Microcredits rewarded to the permissionless close_auction caller.
    const DEFAULT_CLOSER_REWARD: u128 = 10_000u128;
    // Hard ceiling: same 1000 credits as creation_fee for the same reason.
    // A closer reward that exceeds the protocol fee collected would drain the
    // treasury — this cap prevents that even under admin misconfiguration.
    const MAX_CLOSER_REWARD: u128 = 1_000_000_000u128;

    // Slasher's share of a forfeited sealed-bid payment, in bps. 2000 = 20%.
    const DEFAULT_SLASH_REWARD_BPS: u16 = 2000u16;
    // Hard ceiling: slasher cannot receive more than 50% of the forfeited payment.
    const MAX_SLASH_REWARD_BPS: u16 = 5000u16;

    // Maximum commission_bps allowed on a ReferralCode. 2000 = 20% of fee.
    const DEFAULT_MAX_REFERRAL_BPS: u16 = 2000u16;
    // Hard ceiling: referral share cannot exceed 100% of the protocol fee.
    const MAX_REFERRAL_BPS_CAP: u16 = 10000u16;

    // Minimum end_block - start_block enforced at create_auction.
    // 360 blocks ≈ 1 hour at ~10 s/block. Set to 0 to disable (e.g. testnet).
    const DEFAULT_MIN_AUCTION_DURATION: u32 = 360u32;

    // =========================================================================
    // Mappings (all keyed by CONFIG_KEY = 0field — one value per param)
    // =========================================================================

    // Protocol fee rate in bps. Default: 250 (2.5%). Hard cap: 1000 (10%).
    mapping fee_bps: field => u16;

    // Operational admin address. Default: INITIAL_ADMIN.
    // See risk note at top of file. Transfer to multisig before mainnet.
    mapping protocol_admin: field => address;

    // Anti-spam deposit at create_auction in microcredits. Default: 10_000.
    // Hard cap: 1_000_000_000 (1000 credits).
    mapping creation_fee: field => u128;

    // Reward to close_auction caller in microcredits. Default: 10_000.
    // Hard cap: 1_000_000_000 (1000 credits).
    mapping closer_reward: field => u128;

    // Slasher reward share in bps. Default: 2000 (20%). Hard cap: 5000 (50%).
    mapping slash_reward_bps: field => u16;

    // Max referral commission in bps. Default: 2000. Hard cap: 10000 (100% of fee).
    mapping max_referral_bps: field => u16;

    // Minimum auction duration in blocks. Default: 360. 0 = no minimum (testnet).
    mapping min_auction_duration: field => u32;

    // Emergency circuit breaker. When true, check_not_paused() reverts.
    // Default: false.
    mapping paused: field => bool;

    // =========================================================================
    // 1. Admin setters — range-guarded
    // Pattern: assert admin, assert range, set value.
    // =========================================================================

    async transition set_fee_bps(public new_value: u16) -> Future {
        return finalize_set_fee_bps(self.signer, new_value);
    }
    async function finalize_set_fee_bps(caller: address, new_value: u16) {
        assert_eq(caller, protocol_admin.get_or_use(CONFIG_KEY, INITIAL_ADMIN));
        assert(new_value <= MAX_FEE_BPS); // hard ceiling: 10%
        fee_bps.set(CONFIG_KEY, new_value);
    }

    // WARNING: single-step transfer — see risk note at top of file.
    async transition set_protocol_admin(public new_admin: address) -> Future {
        return finalize_set_protocol_admin(self.signer, new_admin);
    }
    async function finalize_set_protocol_admin(caller: address, new_admin: address) {
        assert_eq(caller, protocol_admin.get_or_use(CONFIG_KEY, INITIAL_ADMIN));
        protocol_admin.set(CONFIG_KEY, new_admin);
    }

    async transition set_creation_fee(public new_value: u128) -> Future {
        return finalize_set_creation_fee(self.signer, new_value);
    }
    async function finalize_set_creation_fee(caller: address, new_value: u128) {
        assert_eq(caller, protocol_admin.get_or_use(CONFIG_KEY, INITIAL_ADMIN));
        assert(new_value <= MAX_CREATION_FEE); // hard ceiling: 1000 credits
        creation_fee.set(CONFIG_KEY, new_value);
    }

    async transition set_closer_reward(public new_value: u128) -> Future {
        return finalize_set_closer_reward(self.signer, new_value);
    }
    async function finalize_set_closer_reward(caller: address, new_value: u128) {
        assert_eq(caller, protocol_admin.get_or_use(CONFIG_KEY, INITIAL_ADMIN));
        assert(new_value <= MAX_CLOSER_REWARD); // hard ceiling: 1000 credits
        closer_reward.set(CONFIG_KEY, new_value);
    }

    async transition set_slash_reward_bps(public new_value: u16) -> Future {
        return finalize_set_slash_reward_bps(self.signer, new_value);
    }
    async function finalize_set_slash_reward_bps(caller: address, new_value: u16) {
        assert_eq(caller, protocol_admin.get_or_use(CONFIG_KEY, INITIAL_ADMIN));
        assert(new_value <= MAX_SLASH_REWARD_BPS); // hard ceiling: 50%
        slash_reward_bps.set(CONFIG_KEY, new_value);
    }

    async transition set_max_referral_bps(public new_value: u16) -> Future {
        return finalize_set_max_referral_bps(self.signer, new_value);
    }
    async function finalize_set_max_referral_bps(caller: address, new_value: u16) {
        assert_eq(caller, protocol_admin.get_or_use(CONFIG_KEY, INITIAL_ADMIN));
        assert(new_value <= MAX_REFERRAL_BPS_CAP); // hard ceiling: 100% of fee
        max_referral_bps.set(CONFIG_KEY, new_value);
    }

    async transition set_min_auction_duration(public new_value: u32) -> Future {
        return finalize_set_min_duration(self.signer, new_value);
    }
    async function finalize_set_min_duration(caller: address, new_value: u32) {
        assert_eq(caller, protocol_admin.get_or_use(CONFIG_KEY, INITIAL_ADMIN));
        min_auction_duration.set(CONFIG_KEY, new_value);
    }

    async transition set_paused(public new_value: bool) -> Future {
        return finalize_set_paused(self.signer, new_value);
    }
    async function finalize_set_paused(caller: address, new_value: bool) {
        assert_eq(caller, protocol_admin.get_or_use(CONFIG_KEY, INITIAL_ADMIN));
        paused.set(CONFIG_KEY, new_value);
    }

    // =========================================================================
    // 2. assert_config — CPI called by auction contracts at create_auction
    // =========================================================================
    // Validates that the protocol params snapshotted into AuctionConfig match
    // current on-chain values. If any drifted (admin updated between the frontend
    // read and finalize execution), the entire create_auction tx reverts.
    //
    // start_block and end_block are passed separately (not pre-subtracted) so
    // that finalize can assert end_block > start_block itself, producing a clear
    // failure instead of a u32 underflow if the caller passed a bad range.
    //
    // Usage in auction finalize_create_auction:
    //   let f_cfg: Future = fairdrop_config.aleo/assert_config(
    //       fee_bps, creation_fee, closer_reward, slash_reward_bps,
    //       start_block, end_block,
    //   );
    //   f_cfg.await();

    async transition assert_config(
        public snapshot_fee_bps: u16,
        public snapshot_creation_fee: u128,
        public snapshot_closer_reward: u128,
        public snapshot_slash_reward_bps: u16,
        public start_block: u32,
        public end_block: u32,
    ) -> Future {
        return finalize_assert_config(
            snapshot_fee_bps,
            snapshot_creation_fee,
            snapshot_closer_reward,
            snapshot_slash_reward_bps,
            start_block,
            end_block,
        );
    }
    async function finalize_assert_config(
        snapshot_fee_bps: u16,
        snapshot_creation_fee: u128,
        snapshot_closer_reward: u128,
        snapshot_slash_reward_bps: u16,
        start_block: u32,
        end_block: u32,
    ) {
        assert_eq(snapshot_fee_bps,          fee_bps.get_or_use(CONFIG_KEY, DEFAULT_FEE_BPS));
        assert_eq(snapshot_creation_fee,     creation_fee.get_or_use(CONFIG_KEY, DEFAULT_CREATION_FEE));
        assert_eq(snapshot_closer_reward,    closer_reward.get_or_use(CONFIG_KEY, DEFAULT_CLOSER_REWARD));
        assert_eq(snapshot_slash_reward_bps, slash_reward_bps.get_or_use(CONFIG_KEY, DEFAULT_SLASH_REWARD_BPS));
        // Safe duration check: assert ordering first, then subtract.
        // A reversed range produces a clear assertion failure, not a u32 underflow.
        assert(end_block > start_block);
        assert(end_block - start_block >= min_auction_duration.get_or_use(CONFIG_KEY, DEFAULT_MIN_AUCTION_DURATION));
    }

    // =========================================================================
    // 3. assert_ref_bps — CPI called by fairdrop_ref.aleo at create_code
    // =========================================================================
    // Validates that the commission_bps on a new ReferralCode does not exceed
    // the protocol's max_referral_bps ceiling. Prevents self-referral drain.
    //
    // Usage in fairdrop_ref.aleo finalize_create_code:
    //   let f_ref: Future = fairdrop_config.aleo/assert_ref_bps(commission_bps);
    //   f_ref.await();

    async transition assert_ref_bps(public commission_bps: u16) -> Future {
        return finalize_assert_ref_bps(commission_bps);
    }
    async function finalize_assert_ref_bps(commission_bps: u16) {
        assert(commission_bps <= max_referral_bps.get_or_use(CONFIG_KEY, DEFAULT_MAX_REFERRAL_BPS));
    }

    // =========================================================================
    // 4. check_not_paused — CPI guard for all auction finalize functions
    // =========================================================================
    // A single set_paused(true) by protocol_admin halts all auction activity
    // across all 6 auction programs simultaneously.
    //
    // Usage in any auction finalize function:
    //   let f_pause: Future = fairdrop_config.aleo/check_not_paused();
    //   f_pause.await();

    async transition check_not_paused() -> Future {
        return finalize_check_not_paused();
    }
    async function finalize_check_not_paused() {
        assert(!paused.get_or_use(CONFIG_KEY, false));
    }
}
