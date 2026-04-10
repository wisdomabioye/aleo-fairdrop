// fairdrop_config_v3.aleo — Protocol configuration root contract.
// Leo 4.0 migration: fn/Final/final/:: — no behavioural changes.
//
// Root dependency of the entire Fairdrop protocol. Deployed first.
// All other Fairdrop contracts import this to read or validate protocol params.
//
// Responsibility:
//   - Store all mutable protocol parameters (fee rates, rewards, limits).
//   - Provide admin-gated setters (with range guards) so params can be updated
//     without redeploying any auction contract.
//   - Provide assert_config() for auction contracts to validate their snapshotted
//     params at create_auction time (D16 in DESIGN.md).
//   - Provide assert_ref_bps() for fairdrop_ref_v2.aleo to enforce the referral cap
//     at create_code time.
//   - Provide check_not_paused() as a CPI guard for all auction finalize functions.
//
// No money flows through this contract. No records. No escrow.
//
// ── GOVERNANCE ───────────────────────────────────────────────────────────────
// All admin setters use the two-phase approve_op pattern via fairdrop_multisig_v1.aleo.
// Off-chain workflow for any setter:
//   1. Compute op_hash = BHP256::hash_to_field(ConfigOp { fn_key, op_value, nonce })
//      using the OP_* constant for that setter and the intended new_value.
//   2. 3-of-5 admins sign BHP256::hash_to_field(ApproveOpMsg { op_hash, request_id }).
//   3. Call fairdrop_multisig_v1.aleo::approve_op(op_hash, sigs..., request_id).
//   4. Call the setter (e.g. set_fee_bps(300u16, nonce)).
// Upgrades require 3-of-5 via fairdrop_multisig_v1.aleo::approve_upgrade (key=0field).
//
// ── Leo 4.0 migration notes ───────────────────────────────────────────────────
//   async constructor → constructor
//   async transition  → fn; async function finalize_* → deleted, inlined as final {}
//   Future → Final, .aleo/ → .aleo::
// ─────────────────────────────────────────────────────────────────────────────

import fairdrop_multisig_v1.aleo;

program fairdrop_config_v3.aleo {
    // Upgrade governance: 3-of-5 multi-sig must call fairdrop_multisig_v1.aleo::approve_upgrade
    // with contract_key=1field and this program's compiled checksum before deployment.
    @checksum(mapping="fairdrop_multisig_v1.aleo::approved_upgrades", key="1field")
    constructor() {}

    // =========================================================================
    // Constants — default values active before any set_* call
    // =========================================================================

    const CONFIG_KEY: field = 0field;

    const DEFAULT_FEE_BPS: u16            = 250u16;
    const MAX_FEE_BPS: u16                = 1000u16;

    const DEFAULT_CREATION_FEE: u128      = 10_000u128;
    const MAX_CREATION_FEE: u128          = 1_000_000_000u128;

    const DEFAULT_CLOSER_REWARD: u128     = 10_000u128;
    const MAX_CLOSER_REWARD: u128         = 1_000_000_000u128;

    const DEFAULT_SLASH_REWARD_BPS: u16   = 2000u16;
    const MAX_SLASH_REWARD_BPS: u16       = 5000u16;

    const DEFAULT_MAX_REFERRAL_BPS: u16   = 2000u16;
    const MAX_REFERRAL_BPS_CAP: u16       = 5000u16;

    const DEFAULT_REFERRAL_POOL_BPS: u16  = 500u16;
    const MAX_REFERRAL_POOL_BPS: u16      = 2000u16;

    const DEFAULT_MIN_AUCTION_DURATION: u32 = 360u32;

    // ── Op function keys — unique per setter, used in ConfigOp hash ──────────
    const OP_SET_FEE_BPS:              field = 1field;
    const OP_SET_CREATION_FEE:         field = 2field;
    const OP_SET_CLOSER_REWARD:        field = 3field;
    const OP_SET_SLASH_REWARD_BPS:     field = 4field;
    const OP_SET_MAX_REFERRAL_BPS:     field = 5field;
    const OP_SET_REFERRAL_POOL_BPS:    field = 6field;
    const OP_SET_MIN_AUCTION_DURATION: field = 7field;
    const OP_SET_PAUSED:               field = 8field;

    // =========================================================================
    // Mappings
    // =========================================================================

    mapping fee_bps:              field => u16;
    mapping creation_fee:         field => u128;
    mapping closer_reward:        field => u128;
    mapping slash_reward_bps:     field => u16;
    mapping max_referral_bps:     field => u16;
    mapping referral_pool_bps:    field => u16;
    mapping min_auction_duration: field => u32;
    mapping paused:               field => bool;

    // Consumed op hashes — prevents the same multisig approval from executing twice.
    mapping consumed_ops:         field => bool;

    // =========================================================================
    // Op struct — hashed by callers to compute op_hash for approve_op
    // =========================================================================
    // op_hash = BHP256::hash_to_field(ConfigOp { fn_key: OP_SET_*, value, nonce })
    // op_value: cast new_value to field (u16/u128/u32 as field; bool: true→1field, false→0field)

    struct ConfigOp {
        fn_key:   field,
        op_value: field,
        nonce:    u64,
    }

    // =========================================================================
    // 1. Admin setters — multisig two-phase approval + range guards
    // Pattern: compute op_hash in transition → check approved_ops + consumed_ops
    //          in final {} → consume → assert range → set value.
    // =========================================================================

    fn set_fee_bps(public new_value: u16, public op_nonce: u64) -> Final {
        let op_hash: field = BHP256::hash_to_field(ConfigOp {
            fn_key: OP_SET_FEE_BPS,
            op_value: new_value as field,
            nonce:  op_nonce,
        });
        return final {
            assert(fairdrop_multisig_v1.aleo::approved_ops.get_or_use(op_hash, false));
            assert(!consumed_ops.get_or_use(op_hash, false));
            consumed_ops.set(op_hash, true);
            assert(new_value <= MAX_FEE_BPS);
            fee_bps.set(CONFIG_KEY, new_value);
        };
    }

    fn set_creation_fee(public new_value: u128, public op_nonce: u64) -> Final {
        let op_hash: field = BHP256::hash_to_field(ConfigOp {
            fn_key: OP_SET_CREATION_FEE,
            op_value: new_value as field,
            nonce:  op_nonce,
        });
        return final {
            assert(fairdrop_multisig_v1.aleo::approved_ops.get_or_use(op_hash, false));
            assert(!consumed_ops.get_or_use(op_hash, false));
            consumed_ops.set(op_hash, true);
            assert(new_value <= MAX_CREATION_FEE);
            creation_fee.set(CONFIG_KEY, new_value);
        };
    }

    fn set_closer_reward(public new_value: u128, public op_nonce: u64) -> Final {
        let op_hash: field = BHP256::hash_to_field(ConfigOp {
            fn_key: OP_SET_CLOSER_REWARD,
            op_value: new_value as field,
            nonce:  op_nonce,
        });
        return final {
            assert(fairdrop_multisig_v1.aleo::approved_ops.get_or_use(op_hash, false));
            assert(!consumed_ops.get_or_use(op_hash, false));
            consumed_ops.set(op_hash, true);
            assert(new_value <= MAX_CLOSER_REWARD);
            closer_reward.set(CONFIG_KEY, new_value);
        };
    }

    fn set_slash_reward_bps(public new_value: u16, public op_nonce: u64) -> Final {
        let op_hash: field = BHP256::hash_to_field(ConfigOp {
            fn_key: OP_SET_SLASH_REWARD_BPS,
            op_value: new_value as field,
            nonce:  op_nonce,
        });
        return final {
            assert(fairdrop_multisig_v1.aleo::approved_ops.get_or_use(op_hash, false));
            assert(!consumed_ops.get_or_use(op_hash, false));
            consumed_ops.set(op_hash, true);
            assert(new_value <= MAX_SLASH_REWARD_BPS);
            slash_reward_bps.set(CONFIG_KEY, new_value);
        };
    }

    fn set_max_referral_bps(public new_value: u16, public op_nonce: u64) -> Final {
        let op_hash: field = BHP256::hash_to_field(ConfigOp {
            fn_key: OP_SET_MAX_REFERRAL_BPS,
            op_value: new_value as field,
            nonce:  op_nonce,
        });
        return final {
            assert(fairdrop_multisig_v1.aleo::approved_ops.get_or_use(op_hash, false));
            assert(!consumed_ops.get_or_use(op_hash, false));
            consumed_ops.set(op_hash, true);
            assert(new_value <= MAX_REFERRAL_BPS_CAP);
            max_referral_bps.set(CONFIG_KEY, new_value);
        };
    }

    fn set_referral_pool_bps(public new_value: u16, public op_nonce: u64) -> Final {
        let op_hash: field = BHP256::hash_to_field(ConfigOp {
            fn_key: OP_SET_REFERRAL_POOL_BPS,
            op_value: new_value as field,
            nonce:  op_nonce,
        });
        return final {
            assert(fairdrop_multisig_v1.aleo::approved_ops.get_or_use(op_hash, false));
            assert(!consumed_ops.get_or_use(op_hash, false));
            consumed_ops.set(op_hash, true);
            assert(new_value <= MAX_REFERRAL_POOL_BPS);
            referral_pool_bps.set(CONFIG_KEY, new_value);
        };
    }

    fn set_min_auction_duration(public new_value: u32, public op_nonce: u64) -> Final {
        let op_hash: field = BHP256::hash_to_field(ConfigOp {
            fn_key: OP_SET_MIN_AUCTION_DURATION,
            op_value: new_value as field,
            nonce:  op_nonce,
        });
        return final {
            assert(fairdrop_multisig_v1.aleo::approved_ops.get_or_use(op_hash, false));
            assert(!consumed_ops.get_or_use(op_hash, false));
            consumed_ops.set(op_hash, true);
            min_auction_duration.set(CONFIG_KEY, new_value);
        };
    }

    fn set_paused(public new_value: bool, public op_nonce: u64) -> Final {
        let value_field: field = new_value ? 1field : 0field;
        let op_hash: field = BHP256::hash_to_field(ConfigOp {
            fn_key: OP_SET_PAUSED,
            op_value: value_field,
            nonce:  op_nonce,
        });
        return final {
            assert(fairdrop_multisig_v1.aleo::approved_ops.get_or_use(op_hash, false));
            assert(!consumed_ops.get_or_use(op_hash, false));
            consumed_ops.set(op_hash, true);
            paused.set(CONFIG_KEY, new_value);
        };
    }

    // =========================================================================
    // 2. assert_config — CPI called by auction contracts at create_auction
    // =========================================================================
    // Validates that the protocol params snapshotted into AuctionConfig match
    // current on-chain values (D16 pattern). If any drifted, the create_auction tx
    // reverts. Also validates auction duration.

    fn assert_config(
        public snapshot_fee_bps:           u16,
        public snapshot_creation_fee:      u128,
        public snapshot_closer_reward:     u128,
        public snapshot_slash_reward_bps:  u16,
        public snapshot_referral_pool_bps: u16,
        public start_block: u32,
        public end_block:   u32,
    ) -> Final {
        return final {
            assert_eq(snapshot_fee_bps,           fee_bps.get_or_use(CONFIG_KEY, DEFAULT_FEE_BPS));
            assert_eq(snapshot_creation_fee,      creation_fee.get_or_use(CONFIG_KEY, DEFAULT_CREATION_FEE));
            assert_eq(snapshot_closer_reward,     closer_reward.get_or_use(CONFIG_KEY, DEFAULT_CLOSER_REWARD));
            assert_eq(snapshot_slash_reward_bps,  slash_reward_bps.get_or_use(CONFIG_KEY, DEFAULT_SLASH_REWARD_BPS));
            assert_eq(snapshot_referral_pool_bps, referral_pool_bps.get_or_use(CONFIG_KEY, DEFAULT_REFERRAL_POOL_BPS));
            assert(end_block > start_block);
            assert(end_block - start_block >= min_auction_duration.get_or_use(CONFIG_KEY, DEFAULT_MIN_AUCTION_DURATION));
        };
    }

    // =========================================================================
    // 3. assert_ref_bps — CPI called by fairdrop_ref_v2.aleo at create_code
    // =========================================================================

    fn assert_ref_bps(public commission_bps: u16) -> Final {
        return final {
            assert(commission_bps <= max_referral_bps.get_or_use(CONFIG_KEY, DEFAULT_MAX_REFERRAL_BPS));
        };
    }

    // =========================================================================
    // 4. check_not_paused — CPI guard for all auction finalize functions
    // =========================================================================

    fn check_not_paused() -> Final {
        return final {
            assert(!paused.get_or_use(CONFIG_KEY, false));
        };
    }
}
