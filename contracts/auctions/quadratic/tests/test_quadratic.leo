// Tests for fairdrop_quadratic_v3.aleo
// ── Leo 4.0 migration notes ───────────────────────────────────────────────────
//   @test script → @test fn ... -> Final
//   f.await()    → return final { f.run(); };
//   Future       → Final
//   .aleo/       → .aleo::
//   async constructor → constructor
//   test_never_passes removed: @test fn are entry points; dummy stub no longer needed.
// ─────────────────────────────────────────────────────────────────────────────
import fairdrop_quadratic_v3.aleo;
import fairdrop_proof_v3.aleo;
import token_registry.aleo;
import credits.aleo;

// ── Unit-test coverage scope ──────────────────────────────────────────────────
//   ✓ place_bid_public         — zero payment:  transition-body assert fires.
//                                (Quadratic has no per-bid quantity parameter.)
//   ✓ place_bid_public_ref     — zero payment:  transition-body assert fires.
//   ✓ withdraw_payments        — zero amount:   transition-body assert fires.
//   ✓ withdraw_unsold          — zero amount:   transition-body assert fires.
//   ✓ close_auction            — D12 guard via update_reputation CPI: quadratic not
//                                in proof's allowed_callers in unit-test env.
//                                (closer_reward=0 minimises credits-balance masking)
//   ✓ push_referral_budget     — D12 guard via fund_reserve CPI: quadratic not in
//                                ref's allowed_callers in unit-test env.
//   ✓ cancel_auction           — mint_private role check: quadratic has no
//                                SUPPLY_MANAGER_ROLE in unit-test env.
//   ✓ withdraw_unsold (nonzero)— mint_private role check: same reason.
//   ✓ withdraw_payments (1u128)— credits transfer: quadratic has 0 public balance.
//   ✓ withdraw_treasury_fees   — unapproved op guard: approved_ops defaults false → revert.
//   ✓ seed_liquidity           — zero sale amount:    transition-body assert fires.
//   ✓ seed_liquidity           — zero credits amount: transition-body assert fires.
//   ✓ seed_liquidity           — lp_recipient = ZERO_ADDRESS: assert_neq fires.
//
// ── Integration-test only (require admin keys, real on-chain state, token roles)
//   - create_auction: requires exact-amount Token record, assert_config CPI,
//     D11 nonce from chain, SUPPLY_MANAGER_ROLE for fairdrop_quadratic_v3.aleo,
//     and raise_target > 0 enforced in finalize.
//   - place_bid_private / place_bid_private_ref: require private credits record.
//   - close_auction happy path: quadratic must be in proof's allowed_callers.
//     Always runs to end_block — no supply_met early close.
//   - push_referral_budget happy path: quadratic must be in ref's allowed_callers.
//   - claim: requires QuadraticBid record; returns (Token, Future).
//     actual_quantity = supply * contribution_weight / total_sqrt_weight.
//     D11 validates total_sqrt_weight against sqrt_weights[auction_id] on-chain.
//   - claim_vested: requires QuadraticBid record + vest-enabled cleared auction.
//   - claim_voided: requires QuadraticBid record from a voided (target not met) auction.
//   - Sybil note: splitting P across N accounts gives sqrt(N)*sqrt(P) > sqrt(P)
//     weight; mitigate with gate_mode = 2 (ZK credential gating).
//   - Revenue invariant: creator_revenue + protocol_fee = total_payments verified
//     by running the full lifecycle and checking escrow balances reach 0.
//   - withdraw_treasury_fees happy path: requires prior fairdrop_multisig_v2.aleo::approve_op
//       to write approved_ops[op_hash] = true. Only testable on real chain state.
//   - seed_liquidity: requires cleared, non-voided auction; creator as signer;
//       SUPPLY_MANAGER_ROLE for mint_public; creator must hold amount_credits of
//       CREDITS_RESERVED_TOKEN_ID in token_registry. Atomic single transaction:
//       refunds native credits to creator, bridges creator's CREDITS_RESERVED_TOKEN_ID
//       to DEX, mints unsold sale tokens to DEX, calls add_liquidity_cpi.
//       LP tokens sent to lp_recipient. Ceilings: creator_revenue (credits),
//       config.supply - effective_supply (sale tokens — uses effective_supply).
// ─────────────────────────────────────────────────────────────────────────────

program test_quadratic.aleo {
    @noupgrade
    constructor() {}

    // =========================================================================
    // Group 1: Transition-body assertion tests
    // =========================================================================
    // These fail before any CPI or finalize executes — clean, deterministic.
    // Quadratic does not take a quantity parameter at bid time. The allocation
    // weight (floor(sqrt(payment_amount))) is computed in the transition body.
    // Only payment_amount is checked here.

    // place_bid_public — payment_amount = 0 fires assert(payment_amount > 0u64)
    @test
    @should_fail
    fn test_bid_pub_zero_pay() -> Final {
        let (bid, receipt, f): (
            fairdrop_quadratic_v3.aleo::QuadraticBid,
            fairdrop_proof_v3.aleo::ParticipationReceipt,
            Final,
        ) = fairdrop_quadratic_v3.aleo::place_bid_public(
            1field,  // auction_id — dummy; assert fires before any CPI
            0u64,    // payment_amount — ZERO triggers assert(payment_amount > 0)
        );
        return final { f.run(); };
    }

    // place_bid_public_ref — payment_amount = 0 fires assert(payment_amount > 0u64)
    @test
    @should_fail
    fn test_bid_pub_ref_zero_pay() -> Final {
        let (bid, receipt, f): (
            fairdrop_quadratic_v3.aleo::QuadraticBid,
            fairdrop_proof_v3.aleo::ParticipationReceipt,
            Final,
        ) = fairdrop_quadratic_v3.aleo::place_bid_public_ref(
            1field,  // auction_id
            0u64,    // payment_amount — ZERO triggers assert(payment_amount > 0)
            99field, // code_id — dummy; never reached
        );
        return final { f.run(); };
    }

    // withdraw_payments — amount = 0 fires assert(amount > 0u128) in transition body
    @test
    @should_fail
    fn test_withdraw_pay_zero() -> Final {
        let f: Final = fairdrop_quadratic_v3.aleo::withdraw_payments(
            1field,  // auction_id — dummy; assert fires before credits CPI
            0u128,   // amount — ZERO triggers assert(amount > 0)
            aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc,
        );
        return final { f.run(); };
    }

    // withdraw_unsold — amount = 0 fires assert(amount > 0u128) in transition body
    @test
    @should_fail
    fn test_withdraw_unsold_zero() -> Final {
        let (token, f): (token_registry.aleo::Token, Final) =
            fairdrop_quadratic_v3.aleo::withdraw_unsold(
                1field,   // auction_id
                0u128,    // amount — ZERO triggers assert(amount > 0)
                1field,   // sale_token_id — dummy; never reached
                aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc,
            );
        return final { f.run(); };
    }

    // =========================================================================
    // Group 2: D12 caller-guard failures
    // =========================================================================
    // In the unit-test environment, allowed_callers mappings in fairdrop_proof_v3.aleo
    // and fairdrop_ref_v2.aleo are empty. fairdrop_quadratic_v3.aleo is not registered
    // as a trusted caller, so CPI calls to those programs fail on their D12 guards.

    // close_auction → update_reputation → proof D12 fires:
    //   finalize_update_reputation asserts allowed_callers.get_or_use(caller, false)
    //   where caller = fairdrop_quadratic_v3.aleo. Not registered → false.
    //   closer_reward = 0u128 so credits.transfer_public uses 0u64, reducing the
    //   chance that a credits-balance check masks the proof D12 assertion.
    @test
    @should_fail
    fn test_close_proof_d12() -> Final {
        let f: Final = fairdrop_quadratic_v3.aleo::close_auction(
            1field,   // auction_id — nonexistent; D12 fires before state read
            aleo128wz89c78ur4mx378056yd9q7kqmphr07k0kfsmnwvqnv7g9syyqkg263r,
            false,    // filled
            0u128,    // volume
            0u128,    // closer_reward = 0 — see comment above
        );
        return final { f.run(); };
    }

    // push_referral_budget → fund_reserve → ref D12 fires:
    //   finalize_fund_reserve asserts allowed_callers.get_or_use(caller, false)
    //   where caller = fairdrop_quadratic_v3.aleo. Not registered → false.
    //   budget = 0u128 so credits.transfer_public uses 0u64.
    @test
    @should_fail
    fn test_push_ref_d12() -> Final {
        let f: Final = fairdrop_quadratic_v3.aleo::push_referral_budget(
            1field,  // auction_id
            0u128,   // budget = 0
        );
        return final { f.run(); };
    }

    // =========================================================================
    // Group 3: Role-check and escrow failures
    // =========================================================================
    // token_registry roles are empty in unit-test env; fairdrop_quadratic_v3.aleo has
    // no SUPPLY_MANAGER_ROLE on any token → mint_private finalize reverts.
    // credits public balance for fairdrop_quadratic_v3.aleo = 0 → transfer_public reverts.

    // cancel_auction → mint_private → SUPPLY_MANAGER_ROLE check fails.
    //   supply = 100u128 so transition body passes; role check fires in finalize.
    @test
    @should_fail
    fn test_cancel_no_role() -> Final {
        let (token, f): (token_registry.aleo::Token, Final) =
            fairdrop_quadratic_v3.aleo::cancel_auction(
                1field,      // auction_id — nonexistent; role check fires before state read
                12345field,  // sale_token_id — dummy
                100u128,     // supply
            );
        return final { f.run(); };
    }

    // withdraw_unsold (nonzero amount) → mint_private → role check fails.
    //   amount = 1u128 passes assert(amount > 0) so failure occurs in finalize.
    //   Note: withdraw_unsold allows both cleared (dust) and voided (full supply)
    //   states; role check fires before either state is read.
    @test
    @should_fail
    fn test_withdraw_unsold_role() -> Final {
        let (token, f): (token_registry.aleo::Token, Final) =
            fairdrop_quadratic_v3.aleo::withdraw_unsold(
                1field,      // auction_id
                1u128,       // amount = 1 — passes transition-body assert
                12345field,  // sale_token_id
                aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc,
            );
        return final { f.run(); };
    }

    // withdraw_payments (nonzero amount) → credits transfer fails.
    //   fairdrop_quadratic_v3.aleo public credits balance = 0 in unit-test env.
    //   amount = 1u128 passes assert(amount > 0); credits transfer fires next.
    @test
    @should_fail
    fn test_withdraw_pay_no_cred() -> Final {
        let f: Final = fairdrop_quadratic_v3.aleo::withdraw_payments(
            1field,  // auction_id
            1u128,   // amount = 1 — passes transition-body assert; credits fails
            aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc,
        );
        return final { f.run(); };
    }

    // =========================================================================
    // Group 4: Treasury withdrawal approval guard
    // =========================================================================

    // withdraw_treasury_fees — unapproved op guard.
    //   No multisig approval exists in test state.
    //   finalize reads approved_ops.get_or_use(op_hash, false) → false → assert fails.
    //   f_transfer.run() is never reached — the approval check fires first.
    @test
    @should_fail
    fn test_treasury_unapproved() -> Final {
        let (out, f): (credits.aleo::credits, Final) =
            fairdrop_quadratic_v3.aleo::withdraw_treasury_fees(
                1u128,  // amount — approval check fires before credits transfer runs
                aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc,  // recipient
                1u64,   // op_nonce — no approved_ops entry for this hash → assert fails
            );
        return final { f.run(); };
    }

    // =========================================================================
    // Group 5: seed_liquidity transition-body assertion tests
    // =========================================================================
    // assert(amount_sale_token > 0u128 && amount_credits > 0u128) fires first;
    // assert_neq(lp_recipient, ZERO_ADDRESS) fires second.

    @test
    @should_fail
    fn test_seed_liq_zero_sale() -> Final {
        let f: Final = fairdrop_quadratic_v3.aleo::seed_liquidity(
            1field,   // auction_id — dummy; assert fires before any CPI
            1field,   // sale_token_id — dummy; never reached
            0u128,    // amount_sale_token — ZERO fires transition-body assert
            100u128,  // amount_credits — valid
            30u16,    // fee_bps — dummy; never reached
            0u128,    // min_lp — dummy; never reached
            aleo128wz89c78ur4mx378056yd9q7kqmphr07k0kfsmnwvqnv7g9syyqkg263r, // lp_recipient — valid
        );
        return final { f.run(); };
    }

    @test
    @should_fail
    fn test_seed_liq_zero_cred() -> Final {
        let f: Final = fairdrop_quadratic_v3.aleo::seed_liquidity(
            1field,   // auction_id
            1field,   // sale_token_id
            100u128,  // amount_sale_token — valid
            0u128,    // amount_credits — ZERO fires transition-body assert
            30u16,    // fee_bps — dummy; never reached
            0u128,    // min_lp — dummy; never reached
            aleo128wz89c78ur4mx378056yd9q7kqmphr07k0kfsmnwvqnv7g9syyqkg263r, // lp_recipient — valid
        );
        return final { f.run(); };
    }

    @test
    @should_fail
    fn test_seed_liq_zero_lp() -> Final {
        let f: Final = fairdrop_quadratic_v3.aleo::seed_liquidity(
            1field,   // auction_id
            1field,   // sale_token_id
            100u128,  // amount_sale_token — valid; passes first assert
            100u128,  // amount_credits — valid; passes first assert
            30u16,    // fee_bps — dummy; never reached
            0u128,    // min_lp — dummy; never reached
            aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc, // ZERO_ADDRESS → assert_neq fires
        );
        return final { f.run(); };
    }
}
