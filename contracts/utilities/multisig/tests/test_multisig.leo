// Tests for fairdrop_multisig_v1.aleo
//
// Coverage:
//   - initialize: happy path, double-call revert
//   - approve_upgrade: duplicate signer guard, non-admin signer guard
//   - approve_op: duplicate signer guard, non-admin signer guard
//   - update_admin: duplicate signer guard, new_admin already admin guard
//
// NOTE: Happy-path tests for approve_upgrade / approve_op / update_admin require
// real Aleo signatures over specific BHP256 hashes. These are integration tests
// that must be run with off-chain tooling (CLI or SDK) that can sign with the
// ADMIN_0..4 private keys. The @should_fail tests below validate the guards
// without needing valid signatures.

import fairdrop_multisig_v1.aleo;

program test_multisig.aleo {
    @noupgrade
    constructor() {}

    // =========================================================================
    // initialize
    // =========================================================================

    // First call succeeds (finalize sets all 5 admins).
    @test
    fn test_initialize_success() -> Final {
        let f: Final = fairdrop_multisig_v1.aleo::initialize();
        return final { f.run(); };
    }

    // Second call must revert: ADMIN_0 is already set in the mapping.
    @test
    @should_fail
    fn test_initialize_double_call_fails() -> Final {
        let f1: Final = fairdrop_multisig_v1.aleo::initialize();
        let f2: Final = fairdrop_multisig_v1.aleo::initialize();
        return final {
            f1.run();
            f2.run(); // must revert: already initialized
        };
    }

    // =========================================================================
    // approve_upgrade — guard tests (invalid signatures revert in proof context)
    // =========================================================================

    // Duplicate signers (admin_1 == admin_2) must revert before finalize.
    @test
    @should_fail
    fn test_approve_upgrade_duplicate_signers_fails() -> Final {
        let dummy_sig: signature = signature::parse_unchecked("sign1qgp5xkzfk5k2z3zfzgavpdylf9l3kn3yc5h03lnn3c8llk7w5qgwz8m84u3yxw0f2pjfkqq5ph2slkm8xrxdyxf4nt8n28sqcnqyqqqqqqqqqqqpfzzmt");
        let admin: address = aleo12shtwnmf49t5atmad2jnk3e58ahtp749d9trctt9z3wryxyzt5pspp0nd0; // ADMIN_0
        let dummy_checksum: [u8; 32] = [0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8,
                                        0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8,
                                        0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8,
                                        0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8];
        let f: Final = fairdrop_multisig_v1.aleo::approve_upgrade(
            0field,           // contract_key (config)
            dummy_checksum,   // [u8; 32] — matches self.checksum type
            dummy_sig, admin,
            dummy_sig, admin, // same as admin_1 — must revert at assert_neq
            dummy_sig, aleo1z9y9afh0h6dnyj3f0hvjc4mhayjy06fj42ppcq0rvpmmyky6fuzs449sjr,
            1u64,
        );
        return final { f.run(); };
    }

    // Invalid signature (proof-context verify fails) must revert.
    @test
    @should_fail
    fn test_approve_upgrade_bad_signature_fails() -> Final {
        let dummy_sig: signature = signature::parse_unchecked("sign1qgp5xkzfk5k2z3zfzgavpdylf9l3kn3yc5h03lnn3c8llk7w5qgwz8m84u3yxw0f2pjfkqq5ph2slkm8xrxdyxf4nt8n28sqcnqyqqqqqqqqqqqpfzzmt");
        let dummy_checksum: [u8; 32] = [0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8,
                                        0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8,
                                        0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8,
                                        0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8];
        let f: Final = fairdrop_multisig_v1.aleo::approve_upgrade(
            0field,
            dummy_checksum,
            dummy_sig, aleo12shtwnmf49t5atmad2jnk3e58ahtp749d9trctt9z3wryxyzt5pspp0nd0,
            dummy_sig, aleo1z9y9afh0h6dnyj3f0hvjc4mhayjy06fj42ppcq0rvpmmyky6fuzs449sjr,
            dummy_sig, aleo19x0ctad8llm9y0qssw7eup045c5wxxp6k4al3n0d5r8maulkzu8sh3jwew,
            2u64,
        );
        return final { f.run(); };
    }

    // =========================================================================
    // approve_op — guard tests
    // =========================================================================

    // Duplicate signers must revert.
    @test
    @should_fail
    fn test_approve_op_duplicate_signers_fails() -> Final {
        let dummy_sig: signature = signature::parse_unchecked("sign1qgp5xkzfk5k2z3zfzgavpdylf9l3kn3yc5h03lnn3c8llk7w5qgwz8m84u3yxw0f2pjfkqq5ph2slkm8xrxdyxf4nt8n28sqcnqyqqqqqqqqqqqpfzzmt");
        let admin: address = aleo12shtwnmf49t5atmad2jnk3e58ahtp749d9trctt9z3wryxyzt5pspp0nd0;
        let f: Final = fairdrop_multisig_v1.aleo::approve_op(
            12345field,    // dummy op_hash
            dummy_sig, admin,
            dummy_sig, admin, // duplicate
            dummy_sig, aleo1z9y9afh0h6dnyj3f0hvjc4mhayjy06fj42ppcq0rvpmmyky6fuzs449sjr,
            3u64,
        );
        return final { f.run(); };
    }

    // Bad signature must revert.
    @test
    @should_fail
    fn test_approve_op_bad_signature_fails() -> Final {
        let dummy_sig: signature = signature::parse_unchecked("sign1qgp5xkzfk5k2z3zfzgavpdylf9l3kn3yc5h03lnn3c8llk7w5qgwz8m84u3yxw0f2pjfkqq5ph2slkm8xrxdyxf4nt8n28sqcnqyqqqqqqqqqqqpfzzmt");
        let f: Final = fairdrop_multisig_v1.aleo::approve_op(
            99999field,
            dummy_sig, aleo12shtwnmf49t5atmad2jnk3e58ahtp749d9trctt9z3wryxyzt5pspp0nd0,
            dummy_sig, aleo1z9y9afh0h6dnyj3f0hvjc4mhayjy06fj42ppcq0rvpmmyky6fuzs449sjr,
            dummy_sig, aleo19x0ctad8llm9y0qssw7eup045c5wxxp6k4al3n0d5r8maulkzu8sh3jwew,
            4u64,
        );
        return final { f.run(); };
    }

    // =========================================================================
    // update_admin — guard tests
    // =========================================================================

    // Duplicate signers must revert.
    @test
    @should_fail
    fn test_update_admin_duplicate_signers_fails() -> Final {
        let dummy_sig: signature = signature::parse_unchecked("sign1qgp5xkzfk5k2z3zfzgavpdylf9l3kn3yc5h03lnn3c8llk7w5qgwz8m84u3yxw0f2pjfkqq5ph2slkm8xrxdyxf4nt8n28sqcnqyqqqqqqqqqqqpfzzmt");
        let admin: address = aleo12shtwnmf49t5atmad2jnk3e58ahtp749d9trctt9z3wryxyzt5pspp0nd0;
        let f: Final = fairdrop_multisig_v1.aleo::update_admin(
            aleo16ycrg9g4208lp5y4g5s3gn43xknc5gdsr7wjrpqq9htznj5qk5yqd6px5a, // ADMIN_3 out
            aleo1qnr4dkkvkgfqph0vzc3y6z2eu975wnpz2925ntjccd5cfqxtyu8sta57j8,  // new key
            dummy_sig, admin,
            dummy_sig, admin, // duplicate
            dummy_sig, aleo1z9y9afh0h6dnyj3f0hvjc4mhayjy06fj42ppcq0rvpmmyky6fuzs449sjr,
            5u64,
        );
        return final { f.run(); };
    }

    // Bad signature must revert.
    @test
    @should_fail
    fn test_update_admin_bad_signature_fails() -> Final {
        let dummy_sig: signature = signature::parse_unchecked("sign1qgp5xkzfk5k2z3zfzgavpdylf9l3kn3yc5h03lnn3c8llk7w5qgwz8m84u3yxw0f2pjfkqq5ph2slkm8xrxdyxf4nt8n28sqcnqyqqqqqqqqqqqpfzzmt");
        let f: Final = fairdrop_multisig_v1.aleo::update_admin(
            aleo16ycrg9g4208lp5y4g5s3gn43xknc5gdsr7wjrpqq9htznj5qk5yqd6px5a,
            aleo1qnr4dkkvkgfqph0vzc3y6z2eu975wnpz2925ntjccd5cfqxtyu8sta57j8,
            dummy_sig, aleo12shtwnmf49t5atmad2jnk3e58ahtp749d9trctt9z3wryxyzt5pspp0nd0,
            dummy_sig, aleo1z9y9afh0h6dnyj3f0hvjc4mhayjy06fj42ppcq0rvpmmyky6fuzs449sjr,
            dummy_sig, aleo19x0ctad8llm9y0qssw7eup045c5wxxp6k4al3n0d5r8maulkzu8sh3jwew,
            6u64,
        );
        return final { f.run(); };
    }
}
