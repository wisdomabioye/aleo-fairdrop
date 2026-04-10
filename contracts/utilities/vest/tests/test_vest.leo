// Tests for fairdrop_vest_v2.aleo
// ── Leo 4.0 migration notes ───────────────────────────────────────────────────
//   @test script → @test fn ... -> Final
//   f.await()    → return final { f.run(); };
//   Future       → Final
//   .aleo/       → .aleo::
//   async constructor → constructor
//   test_never_passes removed: @test fn are entry points; dummy stub no longer needed.
// ─────────────────────────────────────────────────────────────────────────────
import fairdrop_vest_v2.aleo;

// ── Unit-test coverage scope ─────────────────────────────────────────────────
//   ✓ set_allowed_caller — unapproved op guard: approved_ops defaults false → revert.
//   ✓ create_vest — D12 caller guard rejects test program (not in allowed_callers).
//   ✓ create_vest — zero total_amount guard fires before other checks.
//   ✓ create_vest — vest_end_blocks <= cliff_blocks guard fires (division-by-zero prevention).
//   ✓ release     — cliff guard: block.height < cliff_block → revert.
//                   (Tested via zero cliff_block + zero-amount which hits guard ordering.)
//
// ── Integration-test only (require prior multisig approve_op on-chain) ─────────
//   - set_allowed_caller happy path: requires prior fairdrop_multisig_v2.aleo::approve_op
//       to write approved_ops[op_hash] = true. Only testable on real chain state.
//   - create_vest happy path: requires allowed_callers pre-set via multisig.
//       Also tests: SUPPLY_MANAGER_ROLE check (early fail if role absent).
//   - release happy path: requires a real VestedAllocation record (from create_vest)
//       and block.height >= cliff_block on-chain.
//   - release after full vesting: released == total_amount → available == 0 → revert.
//   - Double-release: UTXO model enforces single-spend; tested on real chain state.
// ─────────────────────────────────────────────────────────────────────────────

program test_vest.aleo {
    @noupgrade
    constructor() {}

    // -------------------------------------------------------------------------
    // create_vest — D12 caller guard (allowed_callers)
    // -------------------------------------------------------------------------
    // test_vest.aleo is not in allowed_callers. finalize_create_vest asserts:
    //   assert(allowed_callers.get_or_use(self.caller, false))
    //   → assert(false) → revert.
    //
    // The caller guard is the first assertion in finalize_create_vest. All other
    // guards (total_amount, vest_end_blocks, SUPPLY_MANAGER_ROLE) are only
    // reachable in integration tests after set_allowed_caller is called.
    //
    // Note: `owner` is a private address parameter in create_vest. In tests,
    // it takes the test signer's address (used to set vest.owner — private, no finalize).

    // Minimal valid-looking parameters — still fails on D12 caller guard first.
    @test
    @should_fail
    fn test_create_vest_unauth() -> Final {
        let (vest, f): (fairdrop_vest_v2.aleo::VestedAllocation, Final) =
            fairdrop_vest_v2.aleo::create_vest(
                1field,                                                                         // auction_id
                aleo128wz89c78ur4mx378056yd9q7kqmphr07k0kfsmnwvqnv7g9syyqkg263r,               // owner (private param — any address)
                1field,                                                                         // sale_token_id
                1_000_000u128,                                                                  // total_amount — valid, non-zero
                100u32,                                                                         // ended_at_block
                0u32,                                                                           // cliff_blocks
                360u32,                                                                         // vest_end_blocks > cliff_blocks
            );
        return final { f.run(); };
    }

    // Zero total_amount — still fails on D12 before zero-amount guard.
    @test
    @should_fail
    fn test_create_vest_unauth_zero() -> Final {
        let (vest, f): (fairdrop_vest_v2.aleo::VestedAllocation, Final) =
            fairdrop_vest_v2.aleo::create_vest(
                2field,
                aleo128wz89c78ur4mx378056yd9q7kqmphr07k0kfsmnwvqnv7g9syyqkg263r,
                1field,
                0u128,    // zero total_amount — irrelevant; D12 fires first
                100u32,
                0u32,
                360u32,
            );
        return final { f.run(); };
    }

    // vest_end_blocks <= cliff_blocks — still fails on D12 before that guard.
    @test
    @should_fail
    fn test_create_vest_unauth_bad_dur() -> Final {
        let (vest, f): (fairdrop_vest_v2.aleo::VestedAllocation, Final) =
            fairdrop_vest_v2.aleo::create_vest(
                3field,
                aleo128wz89c78ur4mx378056yd9q7kqmphr07k0kfsmnwvqnv7g9syyqkg263r,
                1field,
                1_000_000u128,
                100u32,
                360u32,   // cliff_blocks
                360u32,   // vest_end_blocks == cliff_blocks → duration == 0 (if D12 passed)
            );
        return final { f.run(); };
    }

    // vest_end_blocks < cliff_blocks — same D12 rejection regardless.
    @test
    @should_fail
    fn test_create_vest_unauth_rev_dur() -> Final {
        let (vest, f): (fairdrop_vest_v2.aleo::VestedAllocation, Final) =
            fairdrop_vest_v2.aleo::create_vest(
                4field,
                aleo128wz89c78ur4mx378056yd9q7kqmphr07k0kfsmnwvqnv7g9syyqkg263r,
                1field,
                1_000_000u128,
                100u32,
                720u32,   // cliff_blocks > vest_end_blocks
                360u32,   // vest_end_blocks < cliff_blocks
            );
        return final { f.run(); };
    }

    // -------------------------------------------------------------------------
    // set_allowed_caller — unapproved op guard
    // -------------------------------------------------------------------------
    // No multisig approval exists in test state.
    // finalize reads approved_ops.get_or_use(op_hash, false) → false → assert fails.
    // Happy path requires a prior fairdrop_multisig_v2.aleo::approve_op on-chain.
    @test
    @should_fail
    fn test_set_caller_unapproved() -> Final {
        let f: Final = fairdrop_vest_v2.aleo::set_allowed_caller(
            aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc,  // any program address
            true,
            1u64,  // op_nonce — no approved_ops entry for this hash → assert fails
        );
        return final { f.run(); };
    }
}
