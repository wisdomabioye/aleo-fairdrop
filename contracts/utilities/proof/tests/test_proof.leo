// Tests for fairdrop_proof_v1.aleo
// ── Leo 4.0 migration notes ───────────────────────────────────────────────────
//   @test script → @test fn ... -> Final
//   f.await()    → return final { f.run(); };
//   Future       → Final
//   .aleo/       → .aleo::
//   async constructor → constructor
//   test_never_passes removed: @test fn are entry points; dummy stub no longer needed.
// ─────────────────────────────────────────────────────────────────────────────
import fairdrop_proof_v1.aleo;

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
    constructor() {}

    // -------------------------------------------------------------------------
    // issue_receipt — D12 caller guard (allowed_callers)
    // -------------------------------------------------------------------------
    // test_proof.aleo is not in allowed_callers.
    // finalize_issue_receipt asserts allowed_callers.get_or_use(caller, false).
    // caller = test_proof.aleo program address → not registered → assert(false).
    // bidder_key is dummy in all cases — D12 guard fires before it is used.

    // Non-sealed auction call (commitment_hash = 0field) — fails on caller guard.
    @test
    @should_fail
    fn test_receipt_unauth_no_commit() -> Final {
        let (receipt, f): (fairdrop_proof_v1.aleo::ParticipationReceipt, Final) =
            fairdrop_proof_v1.aleo::issue_receipt(
                1field,   // auction_id
                0field,   // commitment_hash (non-sealed auction style)
                0field,   // bidder_key — dummy; D12 guard fires before it is used
            );
        return final { f.run(); };
    }

    // Sealed-auction call (non-zero commitment_hash) — also fails on caller guard.
    @test
    @should_fail
    fn test_receipt_unauth_with_commit() -> Final {
        let (receipt, f): (fairdrop_proof_v1.aleo::ParticipationReceipt, Final) =
            fairdrop_proof_v1.aleo::issue_receipt(
                2field,
                12345field,  // dummy commitment_hash
                99field,     // bidder_key — dummy; D12 guard fires before it is used
            );
        return final { f.run(); };
    }

    // Zero auction_id — still fails on caller guard (not a special case).
    @test
    @should_fail
    fn test_receipt_unauth_zero_id() -> Final {
        let (receipt, f): (fairdrop_proof_v1.aleo::ParticipationReceipt, Final) =
            fairdrop_proof_v1.aleo::issue_receipt(0field, 0field, 0field);
        return final { f.run(); };
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
    fn test_reputation_unauth_unfilled() -> Final {
        let f: Final = fairdrop_proof_v1.aleo::update_reputation(
            aleo128wz89c78ur4mx378056yd9q7kqmphr07k0kfsmnwvqnv7g9syyqkg263r,  // creator
            false,     // not filled
            0u128,     // volume
        );
        return final { f.run(); };
    }

    // Filled auction with non-zero volume — also fails on caller guard.
    @test
    @should_fail
    fn test_reputation_unauth_filled() -> Final {
        let f: Final = fairdrop_proof_v1.aleo::update_reputation(
            aleo128wz89c78ur4mx378056yd9q7kqmphr07k0kfsmnwvqnv7g9syyqkg263r,
            true,
            1_000_000u128,  // 1 credit in microcredits
        );
        return final { f.run(); };
    }

    // Max-value volume — caller guard fires before any arithmetic.
    @test
    @should_fail
    fn test_reputation_unauth_max_vol() -> Final {
        let f: Final = fairdrop_proof_v1.aleo::update_reputation(
            aleo128wz89c78ur4mx378056yd9q7kqmphr07k0kfsmnwvqnv7g9syyqkg263r,
            true,
            340282366920938463463374607431768211455u128,  // u128::MAX
        );
        return final { f.run(); };
    }
}
