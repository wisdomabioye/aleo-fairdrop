// Tests for fairdrop_gate_v2.aleo
// ── Leo 4.0 migration notes ───────────────────────────────────────────────────
//   @test script → @test fn ... -> Final
//   f.await()    → return final { f.run(); };
//   Future       → Final
//   .aleo/       → .aleo::
//   async constructor → constructor
//   test_never_passes removed: @test fn are entry points; dummy stub no longer needed.
// ─────────────────────────────────────────────────────────────────────────────
import fairdrop_gate_v2.aleo;

// ── Unit-test coverage scope ─────────────────────────────────────────────────
//   ✓ set_allowed_caller — unapproved op guard: approved_ops defaults false → revert.
//   ✓ check_admission   — unregistered auction_id defaults to GATE_OPEN; always passes.
//   ✓ verify_merkle     — mode guard rejects non-MERKLE auctions (default GATE_OPEN).
//   ✓ register_gate     — D12 caller guard rejects the test program (not in allowed_callers).
//
// ── Integration-test only (require prior multisig approve_op on-chain) ─────────
//   - set_allowed_caller happy path: requires prior fairdrop_multisig_v1.aleo::approve_op
//       to write approved_ops[op_hash] = true. Only testable on real chain state.
//   - register_gate happy paths: require allowed_callers pre-set via multisig.
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
    constructor() {}

    // -------------------------------------------------------------------------
    // set_allowed_caller — unapproved op guard
    // -------------------------------------------------------------------------
    // No multisig approval exists in test state.
    // finalize reads approved_ops.get_or_use(op_hash, false) → false → assert fails.
    // Happy path requires a prior fairdrop_multisig_v1.aleo::approve_op on-chain.

    @test
    @should_fail
    fn test_set_allowed_caller_unapproved() -> Final {
        let f: Final = fairdrop_gate_v2.aleo::set_allowed_caller(
            aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc,  // any program address
            true,
            1u64,  // op_nonce — no approved_ops entry for this hash → assert fails
        );
        return final { f.run(); };
    }

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
    fn test_admission_open_default() -> Final {
        let f: Final = fairdrop_gate_v2.aleo::check_admission(1field);
        return final { f.run(); };
    }

    // Different auction_id — same GATE_OPEN default.
    @test
    fn test_admission_open_any_id() -> Final {
        let f: Final = fairdrop_gate_v2.aleo::check_admission(999field);
        return final { f.run(); };
    }

    // auction_id = 0field is valid — the zero field has no special sentinel meaning
    // in the gate contract (gate_registered keys are arbitrary auction IDs).
    @test
    fn test_admission_open_zero_id() -> Final {
        let f: Final = fairdrop_gate_v2.aleo::check_admission(0field);
        return final { f.run(); };
    }

    // Large auction_id (near field boundary) — still unregistered, still passes.
    @test
    fn test_admission_open_large_id() -> Final {
        let f: Final = fairdrop_gate_v2.aleo::check_admission(
            8444461749428370424248824938781546531375899335154063827935233455917409239040field
        );
        return final { f.run(); };
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
    fn test_merkle_open_auction() -> Final {
        let f: Final = fairdrop_gate_v2.aleo::verify_merkle(
            1field,       // unregistered auction_id
            [0field; 20], // proof values irrelevant — mode guard fires first
            0u32,         // path_bits
        );
        return final { f.run(); };
    }

    // auction_id = 0field — also unregistered, same mode rejection.
    @test
    @should_fail
    fn test_merkle_open_zero_id() -> Final {
        let f: Final = fairdrop_gate_v2.aleo::verify_merkle(
            0field,
            [0field; 20],
            0u32,
        );
        return final { f.run(); };
    }

    // All-ones path_bits — direction encoding is irrelevant when mode guard fires.
    @test
    @should_fail
    fn test_merkle_open_all_right() -> Final {
        let f: Final = fairdrop_gate_v2.aleo::verify_merkle(
            2field,
            [0field; 20],
            4294967295u32, // 0xFFFFFFFF — all right-child bits
        );
        return final { f.run(); };
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
    fn test_register_unauth_open() -> Final {
        let f: Final = fairdrop_gate_v2.aleo::register_gate(
            42field,  // auction_id
            0u8,      // gate_mode = GATE_OPEN
            0field,   // root (unused for GATE_OPEN)
            aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc, // ZERO_ADDRESS
        );
        return final { f.run(); };
    }

    // GATE_MERKLE with non-zero root — still fails on caller guard before mode guards.
    @test
    @should_fail
    fn test_register_unauth_merkle() -> Final {
        let f: Final = fairdrop_gate_v2.aleo::register_gate(
            43field,
            1u8,      // gate_mode = GATE_MERKLE
            1field,   // non-zero root
            aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc,
        );
        return final { f.run(); };
    }

    // GATE_CREDENTIAL with non-zero issuer — still fails on caller guard.
    @test
    @should_fail
    fn test_register_unauth_cred() -> Final {
        let f: Final = fairdrop_gate_v2.aleo::register_gate(
            44field,
            2u8,      // gate_mode = GATE_CREDENTIAL
            0field,
            // Use the INITIAL_ADMIN address as a stand-in non-zero issuer.
            // The caller guard fires before the issuer validation guard.
            aleo128wz89c78ur4mx378056yd9q7kqmphr07k0kfsmnwvqnv7g9syyqkg263r,
        );
        return final { f.run(); };
    }
}
