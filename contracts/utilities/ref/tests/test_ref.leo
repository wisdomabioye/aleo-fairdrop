// Tests for fairdrop_ref_v1.aleo
import fairdrop_ref_v1.aleo;

// ── Unit-test coverage scope ─────────────────────────────────────────────────
//   ✓ create_code       — bps within cap passes; bps above cap reverts (config CPI).
//   ✓ fund_reserve      — D12 caller guard rejects test program (not in allowed_callers).
//   ✓ record_referral   — D12 caller guard rejects test program.
//   ✓ credit_commission — unregistered bidder_key → .get() hard-fail reverts.
//
// ── Integration-test only (require admin key == INITIAL_ADMIN) ────────────────
//   - set_allowed_caller: admin signer guard cannot be satisfied in unit tests.
//   - create_code double-registration: assert(!code_registered[code_id])
//       fires on second call for same (signer, auction_id) pair.
//       Requires ordered transactions on real chain state.
//   - record_referral happy path: requires allowed_callers pre-set by admin.
//       Also exercises: fake code_id guard (G7), cross-auction injection (G6),
//       double-attribution sentinel (G5) — D12 guard fires before all of these.
//       On success: referral_records, referral_count, and referral_list are all
//       written atomically. Verify referral_count[code_id] == 1 and
//       referral_list[BHP256(RefListKey{code_id, 0})] == bidder_key after call.
//   - fund_reserve happy path + double-fund revert (G9): requires allowed_callers.
//   - credit_commission happy path: requires reserve_funded + referral_records
//       both set by prior auction CPI calls. Also tests: double-credit guard,
//       attribution mismatch guard, reserve cap (min via ternary).
//   - claim_commission: requires ReferralCode record + earned[code_id] > 0.
//       Cannot synthesise record in unit tests; needs real chain state.
//   - Referrer enumeration: after N bids, referral_count[code_id] == N and
//       referral_list[BHP256(RefListKey{code_id, i})] returns the i-th bidder_key.
//       Frontend can iterate 0..N without any indexer event history.
// ─────────────────────────────────────────────────────────────────────────────

program test_ref.aleo {
    @noupgrade
    async constructor() {}

    // -------------------------------------------------------------------------
    // create_code — bps cap enforcement (fairdrop_config CPI)
    // -------------------------------------------------------------------------
    // create_code is permissionless. The only unit-testable guard is the
    // commission_bps cap, enforced by fairdrop_config_v1.aleo/assert_ref_bps in
    // finalize. Default max_referral_bps = 2000u16 (config get_or_use default).
    //
    // code_id = BHP256(CodeKey { referrer: self.signer, auction_id }).
    // Each test uses a distinct auction_id so code_ids are guaranteed unique —
    // fresh state avoids the double-registration guard.

    // Within cap — should pass.
    @test
    script test_create_code_ok() {
        let (code, f): (fairdrop_ref_v1.aleo/ReferralCode, Future) =
            fairdrop_ref_v1.aleo/create_code(
                1field,  // auction_id
                500u16,  // commission_bps — below 2000 default cap
            );
        f.await();
    }

    // Exactly at cap — inclusive boundary should pass.
    @test
    script test_create_code_at_cap() {
        let (code, f): (fairdrop_ref_v1.aleo/ReferralCode, Future) =
            fairdrop_ref_v1.aleo/create_code(
                2field,
                2000u16,  // exactly equal to default max_referral_bps
            );
        f.await();
    }

    // Zero bps — technically within cap (0 ≤ 2000); functionally useless but valid.
    @test
    script test_create_code_zero_bps() {
        let (code, f): (fairdrop_ref_v1.aleo/ReferralCode, Future) =
            fairdrop_ref_v1.aleo/create_code(
                3field,
                0u16,
            );
        f.await();
    }

    // One bps above cap — assert_ref_bps CPI reverts.
    @test
    @should_fail
    script test_create_code_over_bps() {
        let (code, f): (fairdrop_ref_v1.aleo/ReferralCode, Future) =
            fairdrop_ref_v1.aleo/create_code(
                4field,
                2001u16,  // 1 above default cap — config CPI reverts in finalize
            );
        f.await();
    }

    // u16::MAX — well above cap; same revert path.
    @test
    @should_fail
    script test_create_code_max_bps() {
        let (code, f): (fairdrop_ref_v1.aleo/ReferralCode, Future) =
            fairdrop_ref_v1.aleo/create_code(
                5field,
                65535u16,
            );
        f.await();
    }

    // -------------------------------------------------------------------------
    // fund_reserve — D12 caller guard (allowed_callers)
    // -------------------------------------------------------------------------
    // test_ref.aleo is not in allowed_callers. finalize_fund_reserve asserts:
    //   assert(allowed_callers.get_or_use(self.caller, false))
    //   → assert(false) → revert.
    //
    // amount and auction_id values are irrelevant — D12 guard fires first before
    // the reserve_funded idempotency check (G9).

    // Zero amount — D12 fires before any amount processing.
    @test
    @should_fail
    script test_fund_reserve_unauth() {
        let f: Future = fairdrop_ref_v1.aleo/fund_reserve(
            1field,  // auction_id
            0u128,   // amount — irrelevant; caller guard fires first
        );
        f.await();
    }

    // Non-zero amount — still D12 rejection.
    @test
    @should_fail
    script test_fund_reserve_unauth_nz() {
        let f: Future = fairdrop_ref_v1.aleo/fund_reserve(
            2field,
            1_000_000u128,  // 1 credit in microcredits — irrelevant
        );
        f.await();
    }

    // -------------------------------------------------------------------------
    // record_referral — D12 caller guard (allowed_callers)
    // -------------------------------------------------------------------------
    // test_ref.aleo is not in allowed_callers.
    // finalize_record_referral asserts allowed_callers.get_or_use(caller, false)
    // before any code_registered (G7), auction_id (G6), or sentinel (G5) checks.
    //
    // The code_id, bidder_key, and payment_amount values are irrelevant —
    // the D12 guard reverts before any of the input validation guards execute.
    // Those guards are only reachable in integration tests after set_allowed_caller.

    // Dummy code_id = 0field — still fails on D12 before code_registered check.
    @test
    @should_fail
    script test_record_ref_unauth() {
        let f: Future = fairdrop_ref_v1.aleo/record_referral(
            0field,  // code_id — D12 fires before code_registered[code_id] check
            1field,  // auction_id
            0field,  // bidder_key
            0u128,   // payment_amount
        );
        f.await();
    }

    // Non-zero values — same D12 rejection regardless of inputs.
    @test
    @should_fail
    script test_record_ref_unauth_nz() {
        let f: Future = fairdrop_ref_v1.aleo/record_referral(
            12345field,
            99field,
            888field,
            500_000u128,
        );
        f.await();
    }

    // -------------------------------------------------------------------------
    // credit_commission — unregistered bidder_key hard-fail
    // -------------------------------------------------------------------------
    // credit_commission is permissionless (no D12 guard). However:
    //   referral_records.get(bidder_key) uses .get(), not .get_or_use().
    // For any bidder_key not previously written by record_referral (which
    // requires an allowed_caller), .get() causes an immediate finalize revert.
    //
    // This validates the core invariant: commission credit cannot be triggered
    // for a bidder who was never attributed by an authorised auction program.
    // An adversary cannot invent bidder_keys to drain the reserve.

    // Completely unknown bidder_key → referral_records.get() hard-fail.
    @test
    @should_fail
    script test_credit_no_record() {
        let f: Future = fairdrop_ref_v1.aleo/credit_commission(
            1field,  // code_id
            1field,  // bidder_key — never set by record_referral → .get() reverts
        );
        f.await();
    }

    // Zero keys — sentinel does not bypass the missing-record check.
    @test
    @should_fail
    script test_credit_no_record_zero() {
        let f: Future = fairdrop_ref_v1.aleo/credit_commission(
            0field,
            0field,
        );
        f.await();
    }

    // Different unregistered pair — same hard-fail behaviour.
    @test
    @should_fail
    script test_credit_no_record_alt() {
        let f: Future = fairdrop_ref_v1.aleo/credit_commission(
            999field,
            888field,
        );
        f.await();
    }

    // -------------------------------------------------------------------------
    // Leo requires at least one transition per program.
    // -------------------------------------------------------------------------
    @test
    @should_fail
    transition test_never_passes() {
        assert_eq(1u32, 2u32);
    }
}
