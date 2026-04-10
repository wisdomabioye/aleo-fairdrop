// fairdrop_ref_v3.aleo — Referral code creation, tracking, and commission distribution.
// Leo 4.0 migration: fn/Final/final/:: — no behavioural changes.
//
// Lifecycle:
//   1. create_code(auction_id, commission_bps) → ReferralCode (private record)
//   2. Auction calls record_referral(code_id, auction_id, bidder_key, payment_amount) via CPI.
//   3. At push_referral_budget, auction calls fund_reserve(auction_id, referral_budget) via CPI.
//   4. credit_commission(code_id, bidder_key) — permissionless, after auction closes.
//   5. claim_commission(code: ReferralCode, claimed_amount) → private credits.
//
// ── Privacy guarantees ───────────────────────────────────────────────────────
// referral_records stores pseudonymous bidder_key (BHP256(bidder, auction_id)).
// Bidder's raw address never reaches any finalize function.
//
// ── GOVERNANCE ───────────────────────────────────────────────────────────────
// set_allowed_caller is governed by fairdrop_multisig_v2.aleo (two-phase approve_op).
// Admin rotation requires 3-of-5 multi-sig via fairdrop_multisig_v2.aleo::update_admin.
//
// ── Leo 4.0 migration notes ───────────────────────────────────────────────────
//   async constructor → constructor
//   async transition  → fn; async function finalize_* → deleted, inlined as final {}
//   self.caller captured before final {} for D12 guards (fund_reserve, record_referral)
//   self.signer captured before final {} where needed (set_allowed_caller, create_code)
//   record fields captured before final {} in claim_commission (code.code_id, code.owner)
//   structs moved outside program {}; ReferralCode record stays inside
//   Future → Final, .aleo/ → .aleo::
// ─────────────────────────────────────────────────────────────────────────────

import fairdrop_multisig_v2.aleo;
import fairdrop_config_v3.aleo;
import credits.aleo;

// ═════════════════════════════════════════════════════════════════════════════
// Module-level struct definitions
// ═════════════════════════════════════════════════════════════════════════════

// BHP256 input for code_id derivation.
struct CodeKey { referrer: address, auction_id: field }

// Stored in registrations[code_id]. Immutable after create_code.
struct ReferralConfig { auction_id: field, bps: u16 }

// Stored in referral_records[bidder_key].
// code_id == 0field is the sentinel for "not yet attributed."
struct ReferralRecord {
    code_id:        field,
    payment_amount: u128,
    credited:       bool,
}

// BHP256 input for the referral list index key.
struct RefListKey { code_id: field, index: u64 }

// Op struct for set_allowed_caller two-phase multisig approval.
// op_hash = BHP256::hash_to_field(AllowedCallerOp { caller, allowed, nonce })
struct AllowedCallerOp { caller: address, allowed: bool, nonce: u64 }

// =============================================================================
// Program interface
// =============================================================================

program fairdrop_ref_v3.aleo {
    // Upgrade governance: 3-of-5 multi-sig must call fairdrop_multisig_v2.aleo::approve_upgrade
    // with contract_key=4field and this program's compiled checksum before deployment.
    @checksum(mapping="fairdrop_multisig_v2.aleo::approved_upgrades", key="4field")
    constructor() {}

    // =========================================================================
    // Records
    // =========================================================================

    // Private to the referrer. Consumed at claim_commission.
    record ReferralCode {
        owner:          address,
        code_id:        field,
        auction_id:     field,
        commission_bps: u16,
    }

    // =========================================================================
    // Mappings
    // =========================================================================

    mapping allowed_callers:  address => bool;
    // Consumed op hashes — prevents the same multisig approval from executing twice.
    mapping consumed_ops:     field   => bool;
    mapping code_registered:  field   => bool;
    mapping registrations:    field   => ReferralConfig;
    mapping referral_reserve: field   => u128;
    mapping reserve_funded:   field   => bool;
    mapping earned:           field   => u128;
    mapping referral_records: field   => ReferralRecord;
    mapping referral_count:   field   => u64;
    mapping referral_list:    field   => field;

    // =========================================================================
    // 1. set_allowed_caller — admin only (two-phase multisig)
    // =========================================================================

    fn set_allowed_caller(
        public program_addr: address,
        public allowed:      bool,
        public op_nonce:     u64,
    ) -> Final {
        let op_hash: field = BHP256::hash_to_field(AllowedCallerOp {
            caller:  program_addr,
            allowed: allowed,
            nonce:   op_nonce,
        });
        return final {
            assert(fairdrop_multisig_v2.aleo::approved_ops.get_or_use(op_hash, false));
            assert(!consumed_ops.get_or_use(op_hash, false));
            consumed_ops.set(op_hash, true);
            allowed_callers.set(program_addr, allowed);
        };
    }

    // =========================================================================
    // 2. create_code — referrer or creator creates a referral code
    // =========================================================================
    // code_id = BHP256(CodeKey { referrer: self.signer, auction_id }).
    // Re-registration permanently rejected.
    // commission_bps validated against fairdrop_config_v3.aleo::assert_ref_bps.

    fn create_code(
        public auction_id:     field,
        public commission_bps: u16,
    ) -> (ReferralCode, Final) {
        let code_id: field = BHP256::hash_to_field(CodeKey {
            referrer:   self.signer,
            auction_id: auction_id,
        });
        let code: ReferralCode = ReferralCode {
            owner:          self.signer,
            code_id:        code_id,
            auction_id:     auction_id,
            commission_bps: commission_bps,
        };
        // Validate commission_bps against protocol max_referral_bps.
        let f_config: Final = fairdrop_config_v3.aleo::assert_ref_bps(commission_bps);
        return (code, final {
            f_config.run();
            assert(!code_registered.get_or_use(code_id, false));
            code_registered.set(code_id, true);
            registrations.set(code_id, ReferralConfig {
                auction_id: auction_id,
                bps:        commission_bps,
            });
        });
    }

    // =========================================================================
    // 3. fund_reserve — CPI from auction push_referral_budget
    // =========================================================================
    // Records the referral budget and marks the auction as closed for referrals.
    // One call per auction enforced (reserve_funded guard).
    //
    // Leo 4.0: self.caller captured before final {} for D12 guard.

    fn fund_reserve(
        public auction_id: field,
        public amount:     u128,
    ) -> Final {
        // Capture self.caller — the calling auction program address for D12.
        let caller: address = self.caller;
        return final {
            assert(allowed_callers.get_or_use(caller, false));
            assert(!reserve_funded.get_or_use(auction_id, false));
            referral_reserve.set(auction_id, amount);
            reserve_funded.set(auction_id, true);
        };
    }

    // =========================================================================
    // 4. record_referral — CPI from auction place_bid or commit_bid
    // =========================================================================
    // Attributes a bidder to a referral code and stores their bid-time payment.
    //
    // Leo 4.0: self.caller captured before final {} for D12 guard.

    fn record_referral(
        public code_id:        field,
        public auction_id:     field,
        public bidder_key:     field,
        public payment_amount: u128,
    ) -> Final {
        // Capture self.caller — the calling auction program address for D12.
        let caller: address = self.caller;
        return final {
            assert(allowed_callers.get_or_use(caller, false));
            assert(code_registered.get_or_use(code_id, false));
            let config: ReferralConfig = registrations.get(code_id);
            assert_eq(config.auction_id, auction_id);
            let existing: ReferralRecord = referral_records.get_or_use(
                bidder_key,
                ReferralRecord { code_id: 0field, payment_amount: 0u128, credited: false }
            );
            assert_eq(existing.code_id, 0field);
            referral_records.set(bidder_key, ReferralRecord {
                code_id:        code_id,
                payment_amount: payment_amount,
                credited:       false,
            });
            // Append bidder_key to the per-code enumeration index.
            let count: u64 = referral_count.get_or_use(code_id, 0u64);
            let list_key: field = BHP256::hash_to_field(RefListKey { code_id: code_id, index: count });
            referral_list.set(list_key, bidder_key);
            referral_count.set(code_id, count + 1u64);
        };
    }

    // =========================================================================
    // 5. credit_commission — permissionless, after auction closes
    // =========================================================================
    // Credits commission for one referred bidder to earned[code_id].
    // payment_amount read from referral_records (stored at bid time — not caller-supplied).
    // reserve_funded is proxy for state.cleared.

    fn credit_commission(
        public code_id:    field,
        public bidder_key: field,
    ) -> Final {
        return final {
            let rec: ReferralRecord = referral_records.get(bidder_key);
            assert_eq(rec.code_id, code_id);
            assert(!rec.credited);

            let config: ReferralConfig = registrations.get(code_id);
            let auction_id: field      = config.auction_id;

            assert(reserve_funded.get_or_use(auction_id, false));

            let bps_u128: u128   = config.bps as u128;
            let commission: u128 = rec.payment_amount * bps_u128 / 10000u128;

            let reserve: u128    = referral_reserve.get_or_use(auction_id, 0u128);
            let actual: u128     = commission <= reserve ? commission : reserve;

            let prev: u128       = earned.get_or_use(code_id, 0u128);
            earned.set(code_id, prev + actual);
            referral_reserve.set(auction_id, reserve - actual);

            referral_records.set(bidder_key, ReferralRecord {
                code_id:        rec.code_id,
                payment_amount: rec.payment_amount,
                credited:       true,
            });
        };
    }

    // =========================================================================
    // 6. claim_commission — referrer claims all accrued earnings
    // =========================================================================
    // Consumes the private ReferralCode record (only owner can spend it).
    // Delivers earned[code_id] credits via transfer_public_to_private.
    // D11: claimed_amount validated against earned[code_id].
    //
    // Leo 4.0: capture code.code_id and code.owner before final {} —
    // record fields are proof-context only (private UTXO data).

    // !! COMMENTED OUT — Leo 4.0 compiler bug: "Finalization not found"
    // credits.aleo::transfer_public_to_private returns a Final. When this function is enabled,
    // any program that imports fairdrop_ref_v3.aleo AND independently calls
    // credits.aleo::transfer_public_to_private (or any other Final-returning CPI) fails to build
    // with "Finalization not found: credits.aleo::transfer_public_to_private".
    // Root cause: Leo compiler panics when the same Final-returning CPI appears in multiple
    // programs in the import tree. ReferralCode is a record of this program and earned is a
    // mapping of this program — claim_commission cannot be moved elsewhere.
    // Re-enable once Leo fixes the finalization deduplication bug.
    // Tracked in: docs/leo_bug_finalization_not_found.md | https://github.com/ProvableHQ/leo/issues/29297
    //
    fn claim_commission(
        code:                  ReferralCode,
        public claimed_amount: u128,
    ) -> (credits.aleo::credits, Final) {
        // Capture private record fields before final block.
        let code_id: field = code.code_id;
        let owner: address = code.owner;

        let (credit_record, f_credits): (credits.aleo::credits, Final) =
            credits.aleo::transfer_public_to_private(owner, claimed_amount as u64);

        return (credit_record, final {
            // G10: zero-amount credit transfers are invalid.
            assert(claimed_amount > 0u128);
            // D11: validate claimed_amount matches on-chain earned[code_id].
            assert_eq(earned.get_or_use(code_id, 0u128), claimed_amount);
            // Drain earned.
            earned.set(code_id, 0u128);
            // Execute the credits transfer.
            f_credits.run();
        });
    }
}
