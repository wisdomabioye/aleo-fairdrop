// fairdrop_multisig_v2.aleo — 3-of-5 multi-sig governance root for the Fairdrop protocol.
//
// Responsibility:
//   - Authorize upgrades for all 12 Fairdrop contracts via the @checksum pattern.
//   - Authorize runtime admin operations (config setters, set_allowed_caller
//     in gate/proof/ref/vest) via the two-phase approve_op pattern.
//   - Authorize treasury withdrawals from all 6 auction contracts.
//   - Rotate the admin set (one member at a time, 3-of-5 required).
//
// ── How governed contracts consume approvals ─────────────────────────────────
//
// UPGRADES (@checksum):
//   1. 3-of-5 admins call approve_upgrade(contract_key, checksum: [u8; 32], ...).
//      checksum is the compiled program's self.checksum value (from `leo build` output).
//   2. Deployer deploys the new program version — its @checksum constructor
//      reads approved_upgrades[contract_key] and asserts self.checksum matches.
//
// RUNTIME OPS (admin setters, treasury withdrawal):
//   1. Caller pre-computes op_hash = BHP256::hash_to_field(TypedOpStruct {..., nonce}).
//      TypedOpStruct is defined in the target contract (see op hash patterns below).
//   2. 3-of-5 admins sign BHP256::hash_to_field(ApproveOpMsg { op_hash, request_id }).
//   3. Executor calls approve_op(op_hash, sigs..., request_id).
//      → approved_ops[op_hash] = true written on-chain.
//   4. Executor calls target fn (e.g. config::set_fee_bps(new_value, nonce)):
//      → Target reads approved_ops[op_hash], asserts true, marks consumed locally.
//
// ── Op hash patterns (TypedOpStruct defined in each target contract) ─────────
//   config setters:     BHP256::hash_to_field(ConfigOp    { fn_key: field, op_value: field, nonce: u64 })
//   set_allowed_caller: BHP256::hash_to_field(AllowedOp   { caller: address, allowed: bool, nonce: u64 })
//   withdraw_treasury:  BHP256::hash_to_field(WithdrawalOp{ amount: u128, recipient: address, nonce: u64 })
//
// ── Contract key assignments for approved_upgrades ───────────────────────────
//   0field  fairdrop_multisig_v2.aleo (self — governs its own upgrades)
//   1field  fairdrop_config_v3.aleo
//   2field  fairdrop_gate_v3.aleo
//   3field  fairdrop_proof_v3.aleo
//   4field  fairdrop_ref_v3.aleo
//   5field  fairdrop_vest_v3.aleo
//   6field  fairdrop_ascending_v4.aleo
//   7field  fairdrop_dutch_v4.aleo
//   8field  fairdrop_lbp_v3.aleo
//   9field  fairdrop_quadratic_v3.aleo
//  10field  fairdrop_raise_v3.aleo
//  11field  fairdrop_sealed_v3.aleo
//  12field  fairswap_dex_v3.aleo
//  13field+ reserved for future contracts
//
// ── Upgrade governance for this contract ─────────────────────────────────────
// Uses @checksum pointing to its OWN approved_upgrades mapping (key=0field).
// First deployment always succeeds (edition=0 bypasses the checksum check).
// All future upgrades require 3-of-5 via approve_upgrade(0field, new_checksum).
// No single key controls this contract — the admin set governs itself.
//
// ── Pre-mainnet checklist ─────────────────────────────────────────────────────
//   [ ] Replace ADMIN_0..4 with real prod key addresses
//   [ ] Call initialize() as the first transaction after deployment
//   [ ] Call approve_upgrade for all 12 governed contracts before deploying them

program fairdrop_multisig_v2.aleo {
    @checksum(mapping="fairdrop_multisig_v2.aleo::approved_upgrades", key="0field")
    constructor() {}

    // =========================================================================
    // Admin set — replace with prod keys before mainnet deployment
    // =========================================================================

    const ADMIN_0: address = aleo1sn8ns4htf8ryj0dergclrg82fuuztzr67fqc3sakrktcxzc3dqxqm6utkv;
    const ADMIN_1: address = aleo1gnd8yy9fd28dt5hmpdt23wfuye3vrvf8c906k00lyjc4kqgl2cqssf6vte;
    const ADMIN_2: address = aleo1gaj4v8scfhv4r2nnym0vcdnvsljzlfh524emn2r4gdqvszcq4vxq93cm72;
    const ADMIN_3: address = aleo1u3xdxtc9t6rzjnwszxrq3c6ypepcdcgcwu6kwthv3q6fme29ggpsv4nt7q;
    const ADMIN_4: address = aleo14nsjwjqdv902ayqe2zyld0y3xjz554j06cvj6yy4u5475g4cjs9q9s6nmm;

    // =========================================================================
    // Contract keys for approved_upgrades (must match @checksum key= in each contract)
    // =========================================================================

    const KEY_MULTISIG:      field = 0field;  // self-governance key
    const KEY_CONFIG:        field = 1field;
    const KEY_GATE:          field = 2field;
    const KEY_PROOF:         field = 3field;
    const KEY_REF:           field = 4field;
    const KEY_VEST:          field = 5field;
    const KEY_ASCENDING:     field = 6field;
    const KEY_DUTCH:         field = 7field;
    const KEY_LBP:           field = 8field;
    const KEY_QUADRATIC:     field = 9field;
    const KEY_RAISE:         field = 10field;
    const KEY_SEALED:        field = 11field;
    const KEY_FAIRSWAP:   field = 12field;  // fairswap

    // =========================================================================
    // Mappings
    // =========================================================================

    // Read by @checksum constructors in all 11 governed contracts.
    // Value type must be [u8; 32] — same type as self.checksum in constructors.
    mapping approved_upgrades: field   => [u8; 32];

    // Read by runtime admin fns and withdraw_treasury_fees in all contracts.
    mapping approved_ops:      field   => bool;

    // Replay protection: each request_id may be used only once across all ops.
    mapping executed_ops:      u64     => bool;

    // The live admin set. Populated by initialize(); updated by update_admin().
    mapping admins:            address => bool;

    // One-time bootstrap flag. Set to true by initialize(); guards against re-runs.
    mapping initialized:       field   => bool;

    // =========================================================================
    // Operation structs — hashed by signers and verified in transitions
    // =========================================================================

    struct ApproveUpgradeOp {
        contract_key: field,
        checksum:     [u8; 32],
        request_id:   u64,
    }

    // approve_op signs over (op_hash, request_id) so signatures are bound to
    // a specific request and cannot be replayed with a different request_id.
    struct ApproveOpMsg {
        op_hash:    field,
        request_id: u64,
    }

    struct UpdateAdminOp {
        old_admin:  address,
        new_admin:  address,
        request_id: u64,
    }

    // =========================================================================
    // 1. initialize — one-time bootstrap
    // =========================================================================
    // Populates the admins mapping from ADMIN_0..4 constants.
    // Must be called once immediately after deployment.
    // Subsequent calls revert (guarded by initialized[0field]).

    fn initialize() -> Final {
        return final {
            let already: bool = initialized.get_or_use(0field, false);
            assert(!already);
            admins.set(ADMIN_0, true);
            admins.set(ADMIN_1, true);
            admins.set(ADMIN_2, true);
            admins.set(ADMIN_3, true);
            admins.set(ADMIN_4, true);
            initialized.set(0field, true);
        };
    }

    // =========================================================================
    // 2. approve_upgrade — authorize a new deployment of a governed contract
    // =========================================================================
    // Writes approved_upgrades[contract_key] = checksum.
    // The target contract's @checksum constructor reads this mapping at deploy time.
    //
    // Off-chain signing:
    //   op      = ApproveUpgradeOp { contract_key, checksum, request_id }
    //   op_hash = BHP256::hash_to_field(op)
    //   Each signer: signature = sign(private_key, op_hash)

    fn approve_upgrade(
        public contract_key: field,
        public checksum:     [u8; 32],
        public sig_1: signature, public admin_1: address,
        public sig_2: signature, public admin_2: address,
        public sig_3: signature, public admin_3: address,
        public request_id:   u64,
    ) -> Final {
        let op: ApproveUpgradeOp = ApproveUpgradeOp {
            contract_key,
            checksum,
            request_id,
        };
        let op_hash: field = BHP256::hash_to_field(op);

        // Verify each signature in proof context (sig.verify is not available in final {}).
        assert(sig_1.verify(admin_1, op_hash));
        assert(sig_2.verify(admin_2, op_hash));
        assert(sig_3.verify(admin_3, op_hash));

        // All three signers must be distinct.
        assert_neq(admin_1, admin_2);
        assert_neq(admin_1, admin_3);
        assert_neq(admin_2, admin_3);

        return final {
            // Verify each signer is a registered admin (on-chain double-check).
            assert(admins.get_or_use(admin_1, false));
            assert(admins.get_or_use(admin_2, false));
            assert(admins.get_or_use(admin_3, false));

            // Replay protection.
            let used: bool = executed_ops.get_or_use(request_id, false);
            assert(!used);
            executed_ops.set(request_id, true);

            // Write the approved checksum. Target contract reads this at deploy time.
            approved_upgrades.set(contract_key, checksum);
        };
    }

    // =========================================================================
    // 3. approve_op — authorize a runtime admin op or treasury withdrawal
    // =========================================================================
    // Writes approved_ops[op_hash] = true.
    // Target contracts read this mapping in their final {} blocks and consume
    // the approval locally via their own consumed_ops mapping.
    //
    // op_hash is pre-computed by the caller as:
    //   BHP256::hash_to_field(TypedOpStruct { ...params, nonce: u64 })
    // where TypedOpStruct is defined in the target contract.
    //
    // Off-chain signing:
    //   msg      = ApproveOpMsg { op_hash, request_id }
    //   msg_hash = BHP256::hash_to_field(msg)
    //   Each signer: signature = sign(private_key, msg_hash)

    fn approve_op(
        public op_hash:    field,
        public sig_1: signature, public admin_1: address,
        public sig_2: signature, public admin_2: address,
        public sig_3: signature, public admin_3: address,
        public request_id: u64,
    ) -> Final {
        let msg: ApproveOpMsg = ApproveOpMsg { op_hash, request_id };
        let msg_hash: field = BHP256::hash_to_field(msg);

        assert(sig_1.verify(admin_1, msg_hash));
        assert(sig_2.verify(admin_2, msg_hash));
        assert(sig_3.verify(admin_3, msg_hash));

        assert_neq(admin_1, admin_2);
        assert_neq(admin_1, admin_3);
        assert_neq(admin_2, admin_3);

        return final {
            assert(admins.get_or_use(admin_1, false));
            assert(admins.get_or_use(admin_2, false));
            assert(admins.get_or_use(admin_3, false));

            let used: bool = executed_ops.get_or_use(request_id, false);
            assert(!used);
            executed_ops.set(request_id, true);

            approved_ops.set(op_hash, true);
        };
    }

    // =========================================================================
    // 4. update_admin — rotate one member of the admin set
    // =========================================================================
    // Removes old_admin and adds new_admin. 3-of-5 required.
    // The admin being removed MAY be one of the 3 signers — the finalize block
    // checks the admins mapping before removal so old_admin is still valid then.
    // After the operation the set still has 5 members so the threshold is intact.
    //
    // Off-chain signing:
    //   op      = UpdateAdminOp { old_admin, new_admin, request_id }
    //   op_hash = BHP256::hash_to_field(op)
    //   Each signer: signature = sign(private_key, op_hash)

    fn update_admin(
        public old_admin:  address,
        public new_admin:  address,
        public sig_1: signature, public admin_1: address,
        public sig_2: signature, public admin_2: address,
        public sig_3: signature, public admin_3: address,
        public request_id: u64,
    ) -> Final {
        let op: UpdateAdminOp = UpdateAdminOp { old_admin, new_admin, request_id };
        let op_hash: field = BHP256::hash_to_field(op);

        assert(sig_1.verify(admin_1, op_hash));
        assert(sig_2.verify(admin_2, op_hash));
        assert(sig_3.verify(admin_3, op_hash));

        assert_neq(admin_1, admin_2);
        assert_neq(admin_1, admin_3);
        assert_neq(admin_2, admin_3);

        return final {
            assert(admins.get_or_use(admin_1, false));
            assert(admins.get_or_use(admin_2, false));
            assert(admins.get_or_use(admin_3, false));

            let used: bool = executed_ops.get_or_use(request_id, false);
            assert(!used);
            executed_ops.set(request_id, true);

            // old_admin must exist; new_admin must not.
            assert(admins.get_or_use(old_admin, false));
            admins.remove(old_admin);
            assert(!admins.get_or_use(new_admin, false));
            admins.set(new_admin, true);
        };
    }
}
