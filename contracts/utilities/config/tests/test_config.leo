// Tests for fairdrop_config.aleo
import fairdrop_config.aleo;

program test_config.aleo {
    @noupgrade
    async constructor() {}

    // -------------------------------------------------------------------------
    // assert_config — snapshot validation + duration enforcement
    // -------------------------------------------------------------------------

    // Happy path: all defaults, valid block range above minimum.
    @test
    script test_assert_config_defaults() {
        let f: Future = fairdrop_config.aleo/assert_config(
            250u16,       // DEFAULT_FEE_BPS
            10_000u128,   // DEFAULT_CREATION_FEE
            10_000u128,   // DEFAULT_CLOSER_REWARD
            2000u16,      // DEFAULT_SLASH_REWARD_BPS
            100u32,       // start_block
            820u32,       // end_block — duration 720 blocks, above default minimum (360)
        );
        f.await();
    }

    // Duration exactly at minimum — should pass.
    @test
    script test_assert_config_min_duration_exact() {
        let f: Future = fairdrop_config.aleo/assert_config(
            250u16,
            10_000u128,
            10_000u128,
            2000u16,
            100u32,
            460u32,   // duration exactly 360 = DEFAULT_MIN_AUCTION_DURATION
        );
        f.await();
    }

    // Duration below minimum — should revert with clear assert, not u32 underflow.
    @test
    @should_fail
    script test_assert_config_duration_too_short() {
        let f: Future = fairdrop_config.aleo/assert_config(
            250u16,
            10_000u128,
            10_000u128,
            2000u16,
            100u32,
            200u32,   // duration 100 — below 360 minimum
        );
        f.await();
    }

    // Reversed block range (end_block <= start_block) — should revert clearly,
    // not panic with a u32 underflow.
    @test
    @should_fail
    script test_assert_config_reversed_blocks() {
        let f: Future = fairdrop_config.aleo/assert_config(
            250u16,
            10_000u128,
            10_000u128,
            2000u16,
            500u32,   // start_block
            100u32,   // end_block < start_block — reversed range
        );
        f.await();
    }

    // Equal blocks (zero duration) — should also revert.
    @test
    @should_fail
    script test_assert_config_equal_blocks() {
        let f: Future = fairdrop_config.aleo/assert_config(
            250u16,
            10_000u128,
            10_000u128,
            2000u16,
            500u32,
            500u32,   // end_block == start_block — zero duration
        );
        f.await();
    }

    // Wrong fee_bps snapshot — should revert.
    @test
    @should_fail
    script test_assert_config_wrong_fee_bps() {
        let f: Future = fairdrop_config.aleo/assert_config(
            300u16,       // wrong — stored is 250
            10_000u128,
            10_000u128,
            2000u16,
            100u32,
            820u32,
        );
        f.await();
    }

    // Wrong creation_fee snapshot — should revert.
    @test
    @should_fail
    script test_assert_config_wrong_creation_fee() {
        let f: Future = fairdrop_config.aleo/assert_config(
            250u16,
            5_000u128,    // wrong — stored is 10_000
            10_000u128,
            2000u16,
            100u32,
            820u32,
        );
        f.await();
    }

    // -------------------------------------------------------------------------
    // assert_ref_bps — referral commission cap enforcement
    // -------------------------------------------------------------------------

    // At the default cap (2000 bps) — should pass.
    @test
    script test_assert_ref_bps_at_cap() {
        let f: Future = fairdrop_config.aleo/assert_ref_bps(2000u16);
        f.await();
    }

    // Below the cap — should pass.
    @test
    script test_assert_ref_bps_below_cap() {
        let f: Future = fairdrop_config.aleo/assert_ref_bps(500u16);
        f.await();
    }

    // One bps over the default cap — should revert.
    @test
    @should_fail
    script test_assert_ref_bps_exceeds_cap() {
        let f: Future = fairdrop_config.aleo/assert_ref_bps(2001u16);
        f.await();
    }

    // -------------------------------------------------------------------------
    // check_not_paused — passes when paused mapping is unset (default false)
    // -------------------------------------------------------------------------

    @test
    script test_check_not_paused_default() {
        let f: Future = fairdrop_config.aleo/check_not_paused();
        f.await();
    }
}
