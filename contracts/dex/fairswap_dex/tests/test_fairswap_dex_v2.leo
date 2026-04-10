// test_fairswap_dex_v2.leo
//
// ── Unit-test coverage scope ──────────────────────────────────────────────────
//   Group 1 — Pure math helpers (local replicas tested in proof context):
//     ✓ canonical_pair  — lower-first ordering, swap-order case.
//     ✓ make_pool_key   — commutativity.
//     ✓ swap_out        — zero fee, 30bps fee, large pool, large imbalanced.
//     ✓ lp_for_add      — equal ratio, imbalanced pool.
//     ✓ sqrt_u128       — perfect square, floor, large value, floor correctness.
//   Group 2 — Pool creation proof-context assertions:
//     ✓ create_pool — same-token pair, fee_bps > 100.
//   Group 3 — Liquidity proof-context assertions:
//     ✓ add_liquidity    — zero amount_a, zero amount_b, same-token pair.
//     ✓ remove_liquidity — zero lp_amount.
//     ✗ add_liquidity_cpi_private_in — requires private Token records; integration only.
//     ✗ swap_cpi_private_in          — requires private Token records; integration only.
//   Group 4 — Swap proof-context assertions:
//     ✓ swap — zero amount_in, zero min_out, same-token pair.
//   Group 5 — Governance (two-phase approve_op pattern):
//     ✓ update_fee            — fee_bps > MAX_FEE_BPS fires transition assert.
//     ✓ update_fee            — unapproved op fires final {} assert.
//     ✓ withdraw_protocol_fees— zero amount fires transition assert.
//     ✓ withdraw_protocol_fees— unapproved op fires final {} assert.
//     ✓ toggle_protocol_fee   — unapproved op fires final {} assert.
//     ✓ toggle_paused         — unapproved op fires final {} assert.
//   Total: 27 @test functions (limit: 31).
//
// ── Integration-test only (require devnet) ────────────────────────────────────
//   Finalization: reserves, LP mint/burn, TWAP, protocol fee split.
//   Governance happy paths: require fairdrop_multisig_v1.aleo::approve_op first.
//   add_liquidity_cpi_private_in / swap_cpi_private_in: require caller to construct
//     private Token records via transfer_public_to_private(dex_address, amount, false)
//     or to hold real private Token records from token_registry.aleo.

import fairswap_dex_v3.aleo;

// =============================================================================
// Local replicas of module-level proof helpers
// =============================================================================

fn local_canonical_pair(ta: field, tb: field) -> (field, field) {
    let a: field = ta < tb ? ta : tb;
    let b: field = ta < tb ? tb : ta;
    return (a, b);
}

fn local_make_pool_key(tx: field, ty: field) -> field {
    let a: field = tx < ty ? tx : ty;
    let b: field = tx < ty ? ty : tx;
    return BHP256::hash_to_field(PoolKey { token_a: a, token_b: b });
}

struct PoolKey { token_a: field, token_b: field }

fn local_swap_out(reserve_in: u128, reserve_out: u128, amount_in: u128, fee_bps: u16) -> u128 {
    let factor:      u128 = 10000u128 - (fee_bps as u128);
    let amt_in_fee:  u128 = amount_in * factor;
    let numerator:   u128 = reserve_out * amt_in_fee;
    let denominator: u128 = reserve_in * 10000u128 + amt_in_fee;
    return numerator / denominator;
}

fn local_lp_for_add(reserve_a: u128, reserve_b: u128, lp_supply: u128, amount_a: u128, amount_b: u128) -> u128 {
    let mint_a: u128 = amount_a * lp_supply / reserve_a;
    let mint_b: u128 = amount_b * lp_supply / reserve_b;
    return mint_a < mint_b ? mint_a : mint_b;
}

fn local_sqrt(n: u128) -> u128 {
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
    let s64: u128 = (s63 + n / s63) / 2u128;
    return s64 < s63 ? s64 : s63;
}

program test_fairswap_dex_v3.aleo {

    @noupgrade
    constructor() {}

    // =========================================================================
    // Group 1: Math helpers — proof-context unit tests
    // =========================================================================

    @test
    fn test_canonical_pair_lower_first() {
        let (a, b): (field, field) = local_canonical_pair(1field, 5field);
        assert_eq(a, 1field);
        assert_eq(b, 5field);
    }

    @test
    fn test_canonical_pair_swap_order() {
        let (a, b): (field, field) = local_canonical_pair(9field, 2field);
        assert_eq(a, 2field);
        assert_eq(b, 9field);
    }

    @test
    fn test_make_pool_key_commutative() {
        let k1: field = local_make_pool_key(3field, 7field);
        let k2: field = local_make_pool_key(7field, 3field);
        assert_eq(k1, k2);
    }

    @test
    fn test_swap_out_zero_fee() {
        // reserve=1000/1000, in=100, fee=0 → out = 1000*100/(1000+100) = 90
        let out: u128 = local_swap_out(1000u128, 1000u128, 100u128, 0u16);
        assert_eq(out, 90u128);
    }

    @test
    fn test_swap_out_thirty_bps() {
        // 0.3% fee; same inputs → still 90 at this scale
        let out: u128 = local_swap_out(1000u128, 1000u128, 100u128, 30u16);
        assert_eq(out, 90u128);
    }

    @test
    fn test_swap_out_larger_pool() {
        // 1M/1M, 10K in, 30bps: result slightly below 10000
        let out: u128 = local_swap_out(1_000_000u128, 1_000_000u128, 10_000u128, 30u16);
        assert(out < 10000u128);
        assert(out > 9800u128);
    }

    @test
    fn test_swap_out_imbalanced() {
        // reserve 500K/2M, 1K in, 0 fee → 3992
        let out: u128 = local_swap_out(500_000u128, 2_000_000u128, 1_000u128, 0u16);
        assert_eq(out, 3992u128);
    }

    @test
    fn test_lp_for_add_equal_ratio() {
        let lp: u128 = local_lp_for_add(1000u128, 1000u128, 1000u128, 100u128, 100u128);
        assert_eq(lp, 100u128);
    }

    @test
    fn test_lp_for_add_imbalanced_pool() {
        // reserve 500/2000, perfect-ratio add 50:200 → lp = 100
        let lp: u128 = local_lp_for_add(500u128, 2000u128, 1000u128, 50u128, 200u128);
        assert_eq(lp, 100u128);
    }

    @test
    fn test_sqrt_perfect_square_100() {
        let s: u128 = local_sqrt(100u128);
        assert_eq(s, 10u128);
    }

    @test
    fn test_sqrt_non_perfect_floor() {
        let s: u128 = local_sqrt(2u128);
        assert_eq(s, 1u128);
    }

    @test
    fn test_sqrt_large_value() {
        // sqrt(u64::MAX): verify s^2 <= n < (s+1)^2
        let n: u128 = 18_446_744_073_709_551_615u128;
        let s: u128 = local_sqrt(n);
        assert(s * s <= n);
        assert((s + 1u128) * (s + 1u128) > n);
    }

    // =========================================================================
    // Group 2: Pool creation — proof-context assertion checks
    // =========================================================================

    @test
    @should_fail
    fn test_create_pool_same_token() {
        fairswap_dex_v3.aleo::create_pool(1field, 1field, 30u16);
    }

    @test
    @should_fail
    fn test_create_pool_fee_too_high() {
        fairswap_dex_v3.aleo::create_pool(1field, 2field, 101u16);
    }

    // =========================================================================
    // Group 3: Liquidity — proof-context assertion checks
    // =========================================================================

    @test
    @should_fail
    fn test_add_liq_zero_amt_a() {
        let dummy: address = aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc;
        fairswap_dex_v3.aleo::add_liquidity(1field, 2field, 0u128, 100u128, 30u16, 0u128, dummy);
    }

    @test
    @should_fail
    fn test_add_liq_zero_amt_b() {
        let dummy: address = aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc;
        fairswap_dex_v3.aleo::add_liquidity(1field, 2field, 100u128, 0u128, 30u16, 0u128, dummy);
    }

    @test
    @should_fail
    fn test_add_liq_same_token() {
        let dummy: address = aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc;
        fairswap_dex_v3.aleo::add_liquidity(3field, 3field, 100u128, 100u128, 30u16, 0u128, dummy);
    }

    @test
    @should_fail
    fn test_remove_liq_zero_lp() {
        let dummy: address = aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc;
        fairswap_dex_v3.aleo::remove_liquidity(1field, 2field, 0u128, 0u128, 0u128, dummy);
    }

    // =========================================================================
    // Group 4: Swap — proof-context assertion checks
    // =========================================================================

    @test
    @should_fail
    fn test_swap_zero_amount_in_fails() {
        let dummy: address = aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc;
        fairswap_dex_v3.aleo::swap(1field, 2field, 0u128, 1u128, dummy);
    }

    @test
    @should_fail
    fn test_swap_zero_min_out_fails() {
        let dummy: address = aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc;
        fairswap_dex_v3.aleo::swap(1field, 2field, 100u128, 0u128, dummy);
    }

    @test
    @should_fail
    fn test_swap_same_token_fails() {
        let dummy: address = aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc;
        fairswap_dex_v3.aleo::swap(4field, 4field, 100u128, 1u128, dummy);
    }

    // =========================================================================
    // Group 5: Governance — proof-context assertion tests
    // =========================================================================
    // Two-phase approve_op pattern: no inline signatures. All testable here.

    @test
    @should_fail
    fn test_update_fee_bps_too_high() -> Final {
        let f: Final = fairswap_dex_v3.aleo::update_fee(
            1field, 101u16, 1u64,
        );
        return final { f.run(); };
    }

    @test
    @should_fail
    fn test_withdraw_fees_zero_amount() -> Final {
        let f: Final = fairswap_dex_v3.aleo::withdraw_protocol_fees(
            1field,  // pool_key
            2field,  // token_id — dummy; assert(amount > 0) fires first
            0u128,   // amount — ZERO triggers assert(amount > 0)
            aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc,
            1u64,
        );
        return final { f.run(); };
    }

    @test
    @should_fail
    fn test_withdraw_fees_unapproved() -> Final {
        let f: Final = fairswap_dex_v3.aleo::withdraw_protocol_fees(
            1field,  // pool_key
            2field,  // token_id — dummy; approved_ops check fires
            1u128,   // amount — nonzero; unapproved op fires in final {}
            aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc,
            1u64,
        );
        return final { f.run(); };
    }

    @test
    @should_fail
    fn test_toggle_proto_unapproved() -> Final {
        let f: Final = fairswap_dex_v3.aleo::toggle_protocol_fee(true, 1u64);
        return final { f.run(); };
    }

    @test
    @should_fail
    fn test_toggle_paused_unapproved() -> Final {
        let f: Final = fairswap_dex_v3.aleo::toggle_paused(true, 1u64);
        return final { f.run(); };
    }

    @test
    @should_fail
    fn test_update_fee_unapproved() -> Final {
        let f: Final = fairswap_dex_v3.aleo::update_fee(1field, 30u16, 1u64);
        return final { f.run(); };
    }

    // =========================================================================
    // Invariant / integration notes (not Leo @test — documented here)
    // =========================================================================
    //
    // create_pool:
    //   INV-1: Cannot create duplicate pool (pools.contains check).
    //   INV-2: pause check; paused contract rejects all state-changing calls.
    //   INV-3: Canonical ordering (token_a < token_b) stored in PoolState.
    //
    // add_liquidity / add_liquidity_private:
    //   INV-4: Initial mint: LP = sqrt(amt_a * amt_b) - MIN_LIQUIDITY.
    //   INV-5: MIN_LIQUIDITY credited to ZERO_ADDRESS permanently.
    //   INV-6: Subsequent mint: LP = min(a*S/rA, b*S/rB); proportional.
    //   INV-7: Private snapshot: lp_to_mint <= max_lp; stale snapshot reverts.
    //   INV-8: Slippage guard: lp_out >= min_lp.
    //
    // swap / swap_private:
    //   INV-9:  amount_out = reserve_out * amt_in_fee / denom (constant product).
    //   INV-10: amount_out >= min_out (public path).
    //   INV-11: amount_out <= actual_out (private path; prevents over-mint).
    //   INV-12: TWAP price cumulatives updated before reserve change.
    //   INV-13: Protocol fee split (1/6 to protocol_fees) when enabled.
    //
    // remove_liquidity / remove_liquidity_private:
    //   INV-14: out_x = lp_amount * reserve_x / lp_supply (both tokens).
    //   INV-15: Slippage guards: out_a >= min_a, out_b >= min_b.
    //   INV-16: Private snapshot: committed <= actual; stale snapshot reverts.
    //   INV-17: lp_supply decreases by lp_amount.
    //
    // Governance (two-phase approve_op pattern):
    //   INV-18: approved_ops[op_hash] must be true (multisig pre-approval).
    //   INV-19: consumed_ops[op_hash] must be false (replay protection).
    //   INV-20: update_fee: fee_bps <= MAX_FEE_BPS (100bps = 1%).
    //   INV-21: withdraw_protocol_fees: available >= amount (no overdraw).
}
