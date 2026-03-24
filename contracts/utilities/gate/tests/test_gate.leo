// Tests for fairdrop_gate_v1.aleo
import fairdrop_gate_v1.aleo;

// ── Unit-test coverage scope ─────────────────────────────────────────────────
//   ✓ check_admission   — unregistered auction_id defaults to GATE_OPEN; always passes.
//   ✓ verify_merkle     — mode guard rejects non-MERKLE auctions (default GATE_OPEN).
//   ✓ register_gate     — D12 caller guard rejects the test program (not in allowed_callers).
//
// ── Integration-test only (require admin key == INITIAL_ADMIN) ────────────────
//   - set_allowed_caller: admin signer guard cannot be satisfied in unit tests.
//   - register_gate happy paths: require allowed_callers pre-set by admin.
//   - register_gate guard tests (zero root, zero issuer, invalid mode, double-reg):
//       need the allowed_callers guard to pass first.
//   - verify_merkle happy path: requires a registered MERKLE gate.
//   - verify_credential: requires a valid signature from the test account key;
//       additionally needs a registered CREDENTIAL gate.
//   - check_admission gated + verified / gated + unverified:
//       both require a registered gate set up via register_gate.
// ─────────────────────────────────────────────────────────────────────────────

program test_gate.aleo {
    @noupgrade
    async constructor() {}

    // -------------------------------------------------------------------------
    // check_admission — unregistered auction defaults to GATE_OPEN
    // -------------------------------------------------------------------------
    // gate_modes.get_or_use(auction_id, GATE_OPEN) returns 0u8 for any
    // unregistered auction_id. The assertion becomes:
    //   assert(GATE_OPEN == GATE_OPEN || false)  →  assert(true)  →  passes.
    //
    // This is the critical invariant: open (unregistered) auctions never
    // block bidders regardless of whether they called verify_*.

    // Primary open-auction pass test.
    @test
    script test_admission_open_default() {
        let f: Future = fairdrop_gate_v1.aleo/check_admission(1field);
        f.await();
    }

    // Different auction_id — same GATE_OPEN default.
    @test
    script test_admission_open_any_id() {
        let f: Future = fairdrop_gate_v1.aleo/check_admission(999field);
        f.await();
    }

    // auction_id = 0field is valid — the zero field has no special sentinel meaning
    // in the gate contract (gate_registered keys are arbitrary auction IDs).
    @test
    script test_admission_open_zero_id() {
        let f: Future = fairdrop_gate_v1.aleo/check_admission(0field);
        f.await();
    }

    // Large auction_id (near field boundary) — still unregistered, still passes.
    @test
    script test_admission_open_large_id() {
        let f: Future = fairdrop_gate_v1.aleo/check_admission(
            8444461749428370424248824938781546531375899335154063827935233455917409239040field
        );
        f.await();
    }

    // -------------------------------------------------------------------------
    // verify_merkle — mode guard: rejects non-MERKLE auctions
    // -------------------------------------------------------------------------
    // finalize_verify_merkle first asserts:
    //   assert_eq(gate_modes.get_or_use(auction_id, GATE_OPEN), GATE_MERKLE)
    //   → assert_eq(0u8, 1u8) for any unregistered auction_id → revert.
    //
    // proof and path_bits are irrelevant — the mode guard fires before any
    // Merkle computation and before the allowlists.get() call.

    // Unregistered auction_id → GATE_OPEN default → mode != GATE_MERKLE → revert.
    @test
    @should_fail
    script test_merkle_open_auction() {
        let f: Future = fairdrop_gate_v1.aleo/verify_merkle(
            1field,       // unregistered auction_id
            [0field; 20], // proof values irrelevant — mode guard fires first
            0u32,         // path_bits
        );
        f.await();
    }

    // auction_id = 0field — also unregistered, same mode rejection.
    @test
    @should_fail
    script test_merkle_open_zero_id() {
        let f: Future = fairdrop_gate_v1.aleo/verify_merkle(
            0field,
            [0field; 20],
            0u32,
        );
        f.await();
    }

    // All-ones path_bits — direction encoding is irrelevant when mode guard fires.
    @test
    @should_fail
    script test_merkle_open_all_right() {
        let f: Future = fairdrop_gate_v1.aleo/verify_merkle(
            2field,
            [0field; 20],
            4294967295u32, // 0xFFFFFFFF — all right-child bits
        );
        f.await();
    }

    // -------------------------------------------------------------------------
    // register_gate — D12 caller guard (allowed_callers)
    // -------------------------------------------------------------------------
    // test_gate.aleo is not registered in allowed_callers (it was never added
    // via set_allowed_caller). finalize_register_gate asserts:
    //   assert(allowed_callers.get_or_use(self.caller, false))
    //   → assert(false) → revert.
    //
    // This validates the D12 pattern: only whitelisted auction programs may
    // call register_gate. The issuer/root/mode values are irrelevant — the
    // caller guard fires first.

    // GATE_OPEN with dummy root + ZERO_ADDRESS issuer — fails on caller guard.
    @test
    @should_fail
    script test_register_unauth_open() {
        let f: Future = fairdrop_gate_v1.aleo/register_gate(
            42field,  // auction_id
            0u8,      // gate_mode = GATE_OPEN
            0field,   // root (unused for GATE_OPEN)
            aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc, // ZERO_ADDRESS
        );
        f.await();
    }

    // GATE_MERKLE with non-zero root — still fails on caller guard before mode guards.
    @test
    @should_fail
    script test_register_unauth_merkle() {
        let f: Future = fairdrop_gate_v1.aleo/register_gate(
            43field,
            1u8,      // gate_mode = GATE_MERKLE
            1field,   // non-zero root
            aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc,
        );
        f.await();
    }

    // GATE_CREDENTIAL with non-zero issuer — still fails on caller guard.
    @test
    @should_fail
    script test_register_unauth_cred() {
        let f: Future = fairdrop_gate_v1.aleo/register_gate(
            44field,
            2u8,      // gate_mode = GATE_CREDENTIAL
            0field,
            // Use the INITIAL_ADMIN address as a stand-in non-zero issuer.
            // The caller guard fires before the issuer validation guard.
            aleo128wz89c78ur4mx378056yd9q7kqmphr07k0kfsmnwvqnv7g9syyqkg263r,
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
