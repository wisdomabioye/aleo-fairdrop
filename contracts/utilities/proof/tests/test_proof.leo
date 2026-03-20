// Tests for fairdrop_proof.aleo
import fairdrop_proof.aleo;

// ── Unit-test coverage scope ─────────────────────────────────────────────────
//   ✓ issue_receipt     — D12 caller guard rejects the test program.
//   ✓ update_reputation — D12 caller guard rejects the test program.
//
// ── Integration-test only (require admin key == INITIAL_ADMIN) ────────────────
//   - set_allowed_caller: admin signer guard cannot be satisfied in unit tests.
//   - issue_receipt happy path: requires allowed_callers pre-set by admin.
//     Verify: participated mapping set, receipt record issued to bidder.
//   - issue_receipt idempotency: second call on same (bidder, auction_id)
//     should succeed (participated already true — set again, harmless).
//   - update_reputation first call: get_or_use default (0/0/0) → incremented.
//   - update_reputation filled=false: only auctions_run increments, not filled.
//   - update_reputation filled=true: both auctions_run and filled increment.
//   - update_reputation accumulation: multiple close_auction calls accumulate
//     correctly across different volume amounts.
// ─────────────────────────────────────────────────────────────────────────────

program test_proof.aleo {
    @noupgrade
    async constructor() {}

    // -------------------------------------------------------------------------
    // issue_receipt — D12 caller guard (allowed_callers)
    // -------------------------------------------------------------------------
    // test_proof.aleo is not in allowed_callers.
    // finalize_issue_receipt asserts allowed_callers.get_or_use(caller, false).
    // caller = test_proof.aleo program address → not registered → assert(false).

    // Non-sealed auction call (commitment_hash = 0field) — fails on caller guard.
    @test
    @should_fail
    script test_receipt_unauth_no_commit() {
        let (receipt, f): (fairdrop_proof.aleo/ParticipationReceipt, Future) =
            fairdrop_proof.aleo/issue_receipt(
                1field,   // auction_id
                0field,   // commitment_hash (non-sealed auction style)
            );
        f.await();
    }

    // Sealed-auction call (non-zero commitment_hash) — also fails on caller guard.
    @test
    @should_fail
    script test_receipt_unauth_with_commit() {
        let (receipt, f): (fairdrop_proof.aleo/ParticipationReceipt, Future) =
            fairdrop_proof.aleo/issue_receipt(
                2field,
                12345field,  // dummy commitment_hash
            );
        f.await();
    }

    // Zero auction_id — still fails on caller guard (not a special case).
    @test
    @should_fail
    script test_receipt_unauth_zero_id() {
        let (receipt, f): (fairdrop_proof.aleo/ParticipationReceipt, Future) =
            fairdrop_proof.aleo/issue_receipt(0field, 0field);
        f.await();
    }

    // -------------------------------------------------------------------------
    // update_reputation — D12 caller guard (allowed_callers)
    // -------------------------------------------------------------------------
    // test_proof.aleo is not in allowed_callers.
    // finalize_update_reputation asserts allowed_callers.get_or_use(caller, false).
    // volume and filled values are irrelevant — caller guard fires first.

    // Unfilled auction, zero volume — fails on caller guard.
    @test
    @should_fail
    script test_reputation_unauth_unfilled() {
        let f: Future = fairdrop_proof.aleo/update_reputation(
            aleo128wz89c78ur4mx378056yd9q7kqmphr07k0kfsmnwvqnv7g9syyqkg263r,  // creator
            false,     // not filled
            0u128,     // volume
        );
        f.await();
    }

    // Filled auction with non-zero volume — also fails on caller guard.
    @test
    @should_fail
    script test_reputation_unauth_filled() {
        let f: Future = fairdrop_proof.aleo/update_reputation(
            aleo128wz89c78ur4mx378056yd9q7kqmphr07k0kfsmnwvqnv7g9syyqkg263r,
            true,
            1_000_000u128,  // 1 credit in microcredits
        );
        f.await();
    }

    // Max-value volume — caller guard fires before any arithmetic.
    @test
    @should_fail
    script test_reputation_unauth_max_vol() {
        let f: Future = fairdrop_proof.aleo/update_reputation(
            aleo128wz89c78ur4mx378056yd9q7kqmphr07k0kfsmnwvqnv7g9syyqkg263r,
            true,
            340282366920938463463374607431768211455u128,  // u128::MAX
        );
        f.await();
    }

    // Leo requires at least one transition per program. Satisfies the requirement.
    @test
    @should_fail
    transition test_never_passes() {
        assert_eq(1u32, 2u32);
    }
}
