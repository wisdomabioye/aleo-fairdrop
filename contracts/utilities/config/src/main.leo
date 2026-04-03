// fairdrop_config_v1.aleo — Protocol configuration root contract.
// Leo 4.0 migration: fn/Final/final/:: — no behavioural changes.
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
//   - Provide assert_ref_bps() for fairdrop_ref_v1.aleo to enforce the referral cap
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
//
// ── Leo 4.0 migration notes ───────────────────────────────────────────────────
//   async constructor → constructor
//   async transition  → fn; async function finalize_* → deleted, inlined as final {}
//   self.signer captured before final {} (self.* is proof-context only)
//   Future → Final, .aleo/ → .aleo::
// ─────────────────────────────────────────────────────────────────────────────

program fairdrop_config_v1.aleo {
    @admin(address="aleo128wz89c78ur4mx378056yd9q7kqmphr07k0kfsmnwvqnv7g9syyqkg263r")
    constructor() {}

    // =========================================================================
    // Constants — default values active before any set_* call
    // =========================================================================

    const CONFIG_KEY: field = 0field;

    const INITIAL_ADMIN: address = aleo128wz89c78ur4mx378056yd9q7kqmphr07k0kfsmnwvqnv7g9syyqkg263r;

    const DEFAULT_FEE_BPS: u16            = 250u16;
    const MAX_FEE_BPS: u16                = 1000u16;

    const DEFAULT_CREATION_FEE: u128      = 10_000u128;
    const MAX_CREATION_FEE: u128          = 1_000_000_000u128;

    const DEFAULT_CLOSER_REWARD: u128     = 10_000u128;
    const MAX_CLOSER_REWARD: u128         = 1_000_000_000u128;

    const DEFAULT_SLASH_REWARD_BPS: u16   = 2000u16;
    const MAX_SLASH_REWARD_BPS: u16       = 5000u16;

    const DEFAULT_MAX_REFERRAL_BPS: u16   = 2000u16;
    const MAX_REFERRAL_BPS_CAP: u16       = 5000u16;

    const DEFAULT_REFERRAL_POOL_BPS: u16  = 500u16;
    const MAX_REFERRAL_POOL_BPS: u16      = 2000u16;

    const DEFAULT_MIN_AUCTION_DURATION: u32 = 360u32;

    // =========================================================================
    // Mappings (all keyed by CONFIG_KEY = 0field)
    // =========================================================================

    mapping fee_bps:              field => u16;
    mapping protocol_admin:       field => address;
    mapping creation_fee:         field => u128;
    mapping closer_reward:        field => u128;
    mapping slash_reward_bps:     field => u16;
    mapping max_referral_bps:     field => u16;
    mapping referral_pool_bps:    field => u16;
    mapping min_auction_duration: field => u32;
    mapping paused:               field => bool;

    // =========================================================================
    // 1. Admin setters — range-guarded
    // Pattern: assert admin, assert range, set value.
    // Leo 4.0: self.signer captured before final {} (proof-context only).
    // =========================================================================

    fn set_fee_bps(public new_value: u16) -> Final {
        let caller: address = self.signer;
        return final {
            assert_eq(caller, protocol_admin.get_or_use(CONFIG_KEY, INITIAL_ADMIN));
            assert(new_value <= MAX_FEE_BPS);
            fee_bps.set(CONFIG_KEY, new_value);
        };
    }

    // WARNING: single-step transfer — see risk note at top of file.
    fn set_protocol_admin(public new_admin: address) -> Final {
        let caller: address = self.signer;
        return final {
            assert_eq(caller, protocol_admin.get_or_use(CONFIG_KEY, INITIAL_ADMIN));
            protocol_admin.set(CONFIG_KEY, new_admin);
        };
    }

    fn set_creation_fee(public new_value: u128) -> Final {
        let caller: address = self.signer;
        return final {
            assert_eq(caller, protocol_admin.get_or_use(CONFIG_KEY, INITIAL_ADMIN));
            assert(new_value <= MAX_CREATION_FEE);
            creation_fee.set(CONFIG_KEY, new_value);
        };
    }

    fn set_closer_reward(public new_value: u128) -> Final {
        let caller: address = self.signer;
        return final {
            assert_eq(caller, protocol_admin.get_or_use(CONFIG_KEY, INITIAL_ADMIN));
            assert(new_value <= MAX_CLOSER_REWARD);
            closer_reward.set(CONFIG_KEY, new_value);
        };
    }

    fn set_slash_reward_bps(public new_value: u16) -> Final {
        let caller: address = self.signer;
        return final {
            assert_eq(caller, protocol_admin.get_or_use(CONFIG_KEY, INITIAL_ADMIN));
            assert(new_value <= MAX_SLASH_REWARD_BPS);
            slash_reward_bps.set(CONFIG_KEY, new_value);
        };
    }

    fn set_max_referral_bps(public new_value: u16) -> Final {
        let caller: address = self.signer;
        return final {
            assert_eq(caller, protocol_admin.get_or_use(CONFIG_KEY, INITIAL_ADMIN));
            assert(new_value <= MAX_REFERRAL_BPS_CAP);
            max_referral_bps.set(CONFIG_KEY, new_value);
        };
    }

    fn set_referral_pool_bps(public new_value: u16) -> Final {
        let caller: address = self.signer;
        return final {
            assert_eq(caller, protocol_admin.get_or_use(CONFIG_KEY, INITIAL_ADMIN));
            assert(new_value <= MAX_REFERRAL_POOL_BPS);
            referral_pool_bps.set(CONFIG_KEY, new_value);
        };
    }

    fn set_min_auction_duration(public new_value: u32) -> Final {
        let caller: address = self.signer;
        return final {
            assert_eq(caller, protocol_admin.get_or_use(CONFIG_KEY, INITIAL_ADMIN));
            min_auction_duration.set(CONFIG_KEY, new_value);
        };
    }

    fn set_paused(public new_value: bool) -> Final {
        let caller: address = self.signer;
        return final {
            assert_eq(caller, protocol_admin.get_or_use(CONFIG_KEY, INITIAL_ADMIN));
            paused.set(CONFIG_KEY, new_value);
        };
    }

    // =========================================================================
    // 2. assert_config — CPI called by auction contracts at create_auction
    // =========================================================================
    // Validates that the protocol params snapshotted into AuctionConfig match
    // current on-chain values (D16 pattern). If any drifted, the create_auction tx
    // reverts. Also validates auction duration.
    //
    // Usage in auction entry point:
    //   let f_cfg: Final = fairdrop_config_v1.aleo::assert_config(
    //       fee_bps, creation_fee, closer_reward, slash_reward_bps,
    //       referral_pool_bps, start_block, end_block,
    //   );
    //   // then in final {}: f_cfg.run();

    fn assert_config(
        public snapshot_fee_bps:           u16,
        public snapshot_creation_fee:      u128,
        public snapshot_closer_reward:     u128,
        public snapshot_slash_reward_bps:  u16,
        public snapshot_referral_pool_bps: u16,
        public start_block: u32,
        public end_block:   u32,
    ) -> Final {
        return final {
            assert_eq(snapshot_fee_bps,           fee_bps.get_or_use(CONFIG_KEY, DEFAULT_FEE_BPS));
            assert_eq(snapshot_creation_fee,      creation_fee.get_or_use(CONFIG_KEY, DEFAULT_CREATION_FEE));
            assert_eq(snapshot_closer_reward,     closer_reward.get_or_use(CONFIG_KEY, DEFAULT_CLOSER_REWARD));
            assert_eq(snapshot_slash_reward_bps,  slash_reward_bps.get_or_use(CONFIG_KEY, DEFAULT_SLASH_REWARD_BPS));
            assert_eq(snapshot_referral_pool_bps, referral_pool_bps.get_or_use(CONFIG_KEY, DEFAULT_REFERRAL_POOL_BPS));
            // Safe duration check: assert ordering first, then subtract.
            assert(end_block > start_block);
            assert(end_block - start_block >= min_auction_duration.get_or_use(CONFIG_KEY, DEFAULT_MIN_AUCTION_DURATION));
        };
    }

    // =========================================================================
    // 3. assert_ref_bps — CPI called by fairdrop_ref_v1.aleo at create_code
    // =========================================================================
    // Validates that commission_bps does not exceed the protocol ceiling.
    //
    // Usage in fairdrop_ref_v1.aleo entry point:
    //   let f_ref: Final = fairdrop_config_v1.aleo::assert_ref_bps(commission_bps);
    //   // then in final {}: f_ref.run();

    fn assert_ref_bps(public commission_bps: u16) -> Final {
        return final {
            assert(commission_bps <= max_referral_bps.get_or_use(CONFIG_KEY, DEFAULT_MAX_REFERRAL_BPS));
        };
    }

    // =========================================================================
    // 4. check_not_paused — CPI guard for all auction finalize functions
    // =========================================================================
    // A single set_paused(true) halts all auction activity simultaneously.
    // Auction contracts read paused directly via mapping access instead of CPI
    // (more efficient). This entry point is provided for external/future use.

    fn check_not_paused() -> Final {
        return final {
            assert(!paused.get_or_use(CONFIG_KEY, false));
        };
    }
}
