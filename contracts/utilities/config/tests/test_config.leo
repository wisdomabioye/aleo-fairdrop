// Tests for fairdrop_config_v3.aleo
// ── Leo 4.0 migration notes ───────────────────────────────────────────────────
//   @test script → @test fn ... -> Final
//   f.await()    → return final { f.run(); };
//   Future       → Final
//   .aleo/       → .aleo::
//   async constructor → constructor
//   test_never_passes removed: @test fn are entry points; dummy stub no longer needed.
// ─────────────────────────────────────────────────────────────────────────────
import fairdrop_config_v3.aleo;

program test_config.aleo {
    @noupgrade
    constructor() {}

    // -------------------------------------------------------------------------
    // assert_config — snapshot validation + duration enforcement
    // -------------------------------------------------------------------------

    // Happy path: all defaults, valid block range above minimum.
    @test
    fn test_assert_config_defaults() -> Final {
        let f: Final = fairdrop_config_v3.aleo::assert_config(
            250u16,       // DEFAULT_FEE_BPS
            10_000u128,   // DEFAULT_CREATION_FEE
            10_000u128,   // DEFAULT_CLOSER_REWARD
            2000u16,      // DEFAULT_SLASH_REWARD_BPS
            500u16,       // DEFAULT_REFERRAL_POOL_BPS
            100u32,       // start_block
            820u32,       // end_block — duration 720 blocks, above default minimum (360)
        );
        return final { f.run(); };
    }

    // Duration exactly at minimum — should pass.
    @test
    fn test_cfg_min_duration_exact() -> Final {
        let f: Final = fairdrop_config_v3.aleo::assert_config(
            250u16,
            10_000u128,
            10_000u128,
            2000u16,
            500u16,
            100u32,
            460u32,   // duration exactly 360 = DEFAULT_MIN_AUCTION_DURATION
        );
        return final { f.run(); };
    }

    // Duration below minimum — should revert with clear assert, not u32 underflow.
    @test
    @should_fail
    fn test_cfg_duration_too_short() -> Final {
        let f: Final = fairdrop_config_v3.aleo::assert_config(
            250u16,
            10_000u128,
            10_000u128,
            2000u16,
            500u16,
            100u32,
            200u32,   // duration 100 — below 360 minimum
        );
        return final { f.run(); };
    }

    // Reversed block range (end_block <= start_block) — should revert clearly,
    // not panic with a u32 underflow.
    @test
    @should_fail
    fn test_cfg_reversed_blocks() -> Final {
        let f: Final = fairdrop_config_v3.aleo::assert_config(
            250u16,
            10_000u128,
            10_000u128,
            2000u16,
            500u16,
            500u32,   // start_block
            100u32,   // end_block < start_block — reversed range
        );
        return final { f.run(); };
    }

    // Equal blocks (zero duration) — should also revert.
    @test
    @should_fail
    fn test_assert_config_equal_blocks() -> Final {
        let f: Final = fairdrop_config_v3.aleo::assert_config(
            250u16,
            10_000u128,
            10_000u128,
            2000u16,
            500u16,
            500u32,
            500u32,   // end_block == start_block — zero duration
        );
        return final { f.run(); };
    }

    // Wrong fee_bps snapshot — should revert.
    @test
    @should_fail
    fn test_cfg_wrong_fee_bps() -> Final {
        let f: Final = fairdrop_config_v3.aleo::assert_config(
            300u16,       // wrong — stored is 250
            10_000u128,
            10_000u128,
            2000u16,
            500u16,
            100u32,
            820u32,
        );
        return final { f.run(); };
    }

    // Wrong creation_fee snapshot — should revert.
    @test
    @should_fail
    fn test_cfg_wrong_creation_fee() -> Final {
        let f: Final = fairdrop_config_v3.aleo::assert_config(
            250u16,
            5_000u128,    // wrong — stored is 10_000
            10_000u128,
            2000u16,
            500u16,
            100u32,
            820u32,
        );
        return final { f.run(); };
    }

    // -------------------------------------------------------------------------
    // assert_ref_bps — referral commission cap enforcement
    // -------------------------------------------------------------------------

    // At the default cap (2000 bps) — should pass.
    @test
    fn test_assert_ref_bps_at_cap() -> Final {
        let f: Final = fairdrop_config_v3.aleo::assert_ref_bps(2000u16);
        return final { f.run(); };
    }

    // Below the cap — should pass.
    @test
    fn test_assert_ref_bps_below_cap() -> Final {
        let f: Final = fairdrop_config_v3.aleo::assert_ref_bps(500u16);
        return final { f.run(); };
    }

    // One bps over the default cap — should revert.
    @test
    @should_fail
    fn test_assert_ref_bps_exceeds_cap() -> Final {
        let f: Final = fairdrop_config_v3.aleo::assert_ref_bps(2001u16);
        return final { f.run(); };
    }

    // -------------------------------------------------------------------------
    // check_not_paused — passes when paused mapping is unset (default false)
    // -------------------------------------------------------------------------

    @test
    fn test_check_not_paused_default() -> Final {
        let f: Final = fairdrop_config_v3.aleo::check_not_paused();
        return final { f.run(); };
    }
}
