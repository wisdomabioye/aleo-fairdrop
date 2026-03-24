// Tests for fairdrop_dutch_v1.aleo
import fairdrop_dutch_v1.aleo;
import fairdrop_proof_v1.aleo;
import token_registry.aleo;

// ── Unit-test coverage scope ──────────────────────────────────────────────────
//   ✓ place_bid_public         — zero quantity: transition-body assert fires.
//   ✓ place_bid_public         — zero payment:  transition-body assert fires.
//   ✓ place_bid_public_ref     — zero quantity: transition-body assert fires.
//   ✓ place_bid_public_ref     — zero payment:  transition-body assert fires.
//   ✓ withdraw_payments        — zero amount:   transition-body assert fires.
//   ✓ withdraw_unsold          — zero amount:   transition-body assert fires.
//   ✓ close_auction            — D12 guard via update_reputation CPI: dutch not
//                                in proof's allowed_callers in unit-test env.
//                                (closer_reward=0 minimises credits-balance masking)
//   ✓ push_referral_budget     — D12 guard via fund_reserve CPI: dutch not in
//                                ref's allowed_callers in unit-test env.
//                                (budget=0 minimises credits-transfer masking)
//   ✓ cancel_auction           — mint_private role check: dutch has no
//                                SUPPLY_MANAGER_ROLE in unit-test env.
//   ✓ withdraw_unsold (nonzero)— mint_private role check: same reason.
//   ✓ withdraw_payments (1u128)— credits transfer: dutch has 0 public balance.
//
// ── Integration-test only (require admin keys, real on-chain state, token roles)
//   - create_auction: requires exact-amount Token record (token.amount == supply —
//     assert_eq enforced in transition body; payment_token_id is hardcoded, not a
//     parameter). Params grouped: dutch: DutchParams, gate: GateParams,
//     vest: VestParams, snapshot: ConfigSnapshot. Admin must have granted
//     SUPPLY_MANAGER_ROLE to fairdrop_dutch_v1.aleo (and fairdrop_vest_v1.aleo if
//     vest_enabled); assert_config CPI requires live fairdrop_config state;
//     D11 nonce must match creator_nonces[creator] on chain.
//   - place_bid_private / place_bid_private_ref: require private credits record.
//   - close_auction happy path: requires cleared auction state; dutch must be in
//     proof's allowed_callers (set by admin via set_allowed_caller).
//   - push_referral_budget happy path: dutch must be in ref's allowed_callers.
//   - claim: requires Bid record; mint_private requires SUPPLY_MANAGER_ROLE.
//   - claim_vested: requires Bid record + vest-enabled cleared auction.
//   - claim_voided: requires Bid record from a voided auction.
//   - Revenue accounting: creator_revenue + sum(refunds) + protocol_fee = total_payments
//     verified by running the full lifecycle and checking escrow balances reach 0.
// ─────────────────────────────────────────────────────────────────────────────

program test_dutch.aleo {
    @noupgrade
    async constructor() {}

    // =========================================================================
    // Group 1: Transition-body assertion tests
    // =========================================================================
    // These fail before any CPI or finalize executes — clean, deterministic.

    // place_bid_public — quantity = 0 fires assert(quantity > 0u128)
    @test
    @should_fail
    script test_bid_pub_zero_qty() {
        let (bid, receipt, f): (
            fairdrop_dutch_v1.aleo/Bid,
            fairdrop_proof_v1.aleo/ParticipationReceipt,
            Future,
        ) = fairdrop_dutch_v1.aleo/place_bid_public(
            1field,   // auction_id — dummy; assert fires before any CPI
            0u128,    // quantity   — ZERO triggers assert(quantity > 0)
            1000u64,  // payment_amount
        );
        f.await();
    }

    // place_bid_public — payment_amount = 0 fires assert(payment_amount > 0u64)
    @test
    @should_fail
    script test_bid_pub_zero_pay() {
        let (bid, receipt, f): (
            fairdrop_dutch_v1.aleo/Bid,
            fairdrop_proof_v1.aleo/ParticipationReceipt,
            Future,
        ) = fairdrop_dutch_v1.aleo/place_bid_public(
            1field,   // auction_id
            100u128,  // quantity — valid; payment_amount check fires first
            0u64,     // payment_amount — ZERO triggers assert(payment_amount > 0)
        );
        f.await();
    }

    // place_bid_public_ref — quantity = 0
    @test
    @should_fail
    script test_bid_pub_ref_zero_qty() {
        let (bid, receipt, f): (
            fairdrop_dutch_v1.aleo/Bid,
            fairdrop_proof_v1.aleo/ParticipationReceipt,
            Future,
        ) = fairdrop_dutch_v1.aleo/place_bid_public_ref(
            1field,   // auction_id
            0u128,    // quantity — ZERO triggers assert(quantity > 0)
            1000u64,  // payment_amount
            99field,  // code_id — dummy; never reached
        );
        f.await();
    }

    // place_bid_public_ref — payment_amount = 0
    @test
    @should_fail
    script test_bid_pub_ref_zero_pay() {
        let (bid, receipt, f): (
            fairdrop_dutch_v1.aleo/Bid,
            fairdrop_proof_v1.aleo/ParticipationReceipt,
            Future,
        ) = fairdrop_dutch_v1.aleo/place_bid_public_ref(
            1field,
            100u128,
            0u64,     // payment_amount — ZERO triggers assert(payment_amount > 0)
            99field,
        );
        f.await();
    }

    // withdraw_payments — amount = 0 fires assert(amount > 0u128) in transition body
    @test
    @should_fail
    script test_withdraw_pay_zero() {
        let f: Future = fairdrop_dutch_v1.aleo/withdraw_payments(
            1field,  // auction_id — dummy; assert fires before credits CPI
            0u128,   // amount — ZERO triggers assert(amount > 0)
        );
        f.await();
    }

    // withdraw_unsold — amount = 0 fires assert(amount > 0u128) in transition body
    @test
    @should_fail
    script test_withdraw_unsold_zero() {
        let (token, f): (token_registry.aleo/Token, Future) =
            fairdrop_dutch_v1.aleo/withdraw_unsold(
                1field,   // auction_id
                0u128,    // amount — ZERO triggers assert(amount > 0)
                1field,   // sale_token_id — dummy; never reached
            );
        f.await();
    }

    // =========================================================================
    // Group 2: D12 caller-guard failures
    // =========================================================================
    // In the unit-test environment, allowed_callers mappings in fairdrop_proof_v1.aleo
    // and fairdrop_ref_v1.aleo are empty. fairdrop_dutch_v1.aleo is not registered as a
    // trusted caller, so CPI calls to those programs fail on their D12 guards.

    // close_auction → update_reputation → proof D12 fires:
    //   finalize_update_reputation asserts allowed_callers.get_or_use(caller, false)
    //   where caller = fairdrop_dutch_v1.aleo. Not registered in unit-test env → false.
    //   closer_reward = 0u128 so credits.transfer_public uses 0u64, reducing the
    //   chance that a credits-balance check masks the proof D12 assertion.
    @test
    @should_fail
    script test_close_proof_d12() {
        let f: Future = fairdrop_dutch_v1.aleo/close_auction(
            1field,   // auction_id — nonexistent; D12 fires before state read
            aleo128wz89c78ur4mx378056yd9q7kqmphr07k0kfsmnwvqnv7g9syyqkg263r,
            false,    // filled
            0u128,    // volume
            0u128,    // closer_reward = 0 — see comment above
        );
        f.await();
    }

    // push_referral_budget → fund_reserve → ref D12 fires:
    //   finalize_fund_reserve asserts allowed_callers.get_or_use(caller, false)
    //   where caller = fairdrop_dutch_v1.aleo. Not registered → false.
    //   budget = 0u128 so credits.transfer_public uses 0u64, reducing the chance
    //   that a credits-balance check masks the ref D12 assertion.
    @test
    @should_fail
    script test_push_ref_d12() {
        let f: Future = fairdrop_dutch_v1.aleo/push_referral_budget(
            1field,  // auction_id
            0u128,   // budget = 0 — see comment above
        );
        f.await();
    }

    // =========================================================================
    // Group 3: Role-check and escrow failures
    // =========================================================================
    // token_registry roles are empty in unit-test env; fairdrop_dutch_v1.aleo has
    // no SUPPLY_MANAGER_ROLE on any token → mint_private finalize reverts.
    // credits public balance for fairdrop_dutch_v1.aleo = 0 → transfer_public reverts.

    // cancel_auction → mint_private → SUPPLY_MANAGER_ROLE check fails.
    //   supply = 100u128 so transition body does not reject (no supply > 0 assert
    //   in cancel — the role check fires first in finalize).
    @test
    @should_fail
    script test_cancel_no_role() {
        let (token, f): (token_registry.aleo/Token, Future) =
            fairdrop_dutch_v1.aleo/cancel_auction(
                1field,      // auction_id — nonexistent; role check fires before state read
                12345field,  // sale_token_id — dummy
                100u128,     // supply
            );
        f.await();
    }

    // withdraw_unsold (nonzero amount) → mint_private → role check fails.
    //   amount = 1u128 passes assert(amount > 0) so failure occurs in finalize.
    @test
    @should_fail
    script test_withdraw_unsold_role() {
        let (token, f): (token_registry.aleo/Token, Future) =
            fairdrop_dutch_v1.aleo/withdraw_unsold(
                1field,      // auction_id
                1u128,       // amount = 1 — passes transition-body assert
                12345field,  // sale_token_id
            );
        f.await();
    }

    // withdraw_payments (nonzero amount) → credits transfer fails.
    //   fairdrop_dutch_v1.aleo public credits balance = 0 in unit-test env.
    //   amount = 1u128 passes assert(amount > 0); credits transfer fires next.
    @test
    @should_fail
    script test_withdraw_pay_no_cred() {
        let f: Future = fairdrop_dutch_v1.aleo/withdraw_payments(
            1field,  // auction_id
            1u128,   // amount = 1 — passes transition-body assert; credits fails
        );
        f.await();
    }

    // =========================================================================
    // Leo requires at least one transition per program.
    // =========================================================================
    @test
    @should_fail
    transition test_never_passes() {
        assert_eq(1u32, 2u32);
    }
}
