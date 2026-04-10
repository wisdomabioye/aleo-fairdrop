// Tests for fairdrop_ascending_v2.aleo
// ── Leo 4.0 migration notes ───────────────────────────────────────────────────
//   @test script → @test fn ... -> Final
//   f.await()    → return final { f.run(); };
//   Future       → Final
//   .aleo/       → .aleo::
//   async constructor → constructor
//   test_never_passes removed: @test fn are entry points; dummy stub no longer needed.
// ─────────────────────────────────────────────────────────────────────────────
import fairdrop_ascending_v2.aleo;
import fairdrop_proof_v2.aleo;
import token_registry.aleo;
import credits.aleo;

// ── Unit-test coverage scope ──────────────────────────────────────────────────
//   ✓ place_bid_public         — zero quantity: transition-body assert fires.
//   ✓ place_bid_public         — zero payment:  transition-body assert fires.
//   ✓ place_bid_public_ref     — zero quantity: transition-body assert fires.
//   ✓ place_bid_public_ref     — zero payment:  transition-body assert fires.
//   ✓ withdraw_payments        — zero amount:   transition-body assert fires.
//   ✓ withdraw_unsold          — zero amount:   transition-body assert fires.
//   ✓ close_auction            — D12 guard via update_reputation CPI: ascending not
//                                in proof's allowed_callers in unit-test env.
//                                (closer_reward=0 minimises credits-balance masking)
//   ✓ push_referral_budget     — D12 guard via fund_reserve CPI: ascending not in
//                                ref's allowed_callers in unit-test env.
//                                (budget=0 minimises credits-transfer masking)
//   ✓ cancel_auction           — mint_private role check: ascending has no
//                                SUPPLY_MANAGER_ROLE in unit-test env.
//   ✓ withdraw_unsold (nonzero)— mint_private role check: same reason.
//   ✓ withdraw_payments (1u128)— credits transfer: ascending has 0 public balance.
//   ✓ withdraw_treasury_fees   — unapproved op guard: approved_ops defaults false → revert.
//   ✓ seed_liquidity           — zero sale amount:    transition-body assert fires.
//   ✓ seed_liquidity           — zero credits amount: transition-body assert fires.
//   ✓ seed_liquidity           — lp_recipient = ZERO_ADDRESS: assert_neq fires.
//
// ── Integration-test only (require admin keys, real on-chain state, token roles)
//   - create_auction: requires exact-amount Token record (token.amount == supply),
//     assert_config CPI with live fairdrop_config state, D11 nonce from chain,
//     and SUPPLY_MANAGER_ROLE granted to fairdrop_ascending_v2.aleo.
//   - place_bid_private / place_bid_private_ref: require private credits record.
//   - close_auction happy path: ascending must be in proof's allowed_callers.
//   - push_referral_budget happy path: ascending must be in ref's allowed_callers.
//   - claim / claim_vested: require Bid record and SUPPLY_MANAGER_ROLE.
//   - claim_voided: requires Bid record from a voided auction.
//   - Revenue invariant: creator_revenue + protocol_fee = total_payments verified
//     by running the full lifecycle and checking escrow balances reach 0.
//   - withdraw_treasury_fees happy path: requires prior fairdrop_multisig_v1.aleo::approve_op
//       to write approved_ops[op_hash] = true. Only testable on real chain state.
//   - seed_liquidity: requires cleared, non-voided auction; creator as signer;
//       SUPPLY_MANAGER_ROLE for mint_public; creator must hold amount_credits of
//       CREDITS_RESERVED_TOKEN_ID in token_registry. Atomic single transaction:
//       refunds native credits to creator, bridges creator's CREDITS_RESERVED_TOKEN_ID
//       to DEX, mints unsold sale tokens to DEX, calls add_liquidity_cpi.
//       LP tokens sent to lp_recipient. Ceilings: creator_revenue (credits),
//       config.supply - total_committed (sale tokens).
// ─────────────────────────────────────────────────────────────────────────────

program test_ascending.aleo {
    @noupgrade
    constructor() {}

    // =========================================================================
    // Group 1: Transition-body assertion tests
    // =========================================================================
    // These fail before any CPI or finalize executes — clean, deterministic.
    //
    // 4.0 note: @test fn must return Final to satisfy the compiler when the
    // callee returns Final. The `return final { f.run(); }` is syntactically
    // required but never reached at runtime: the proof-context assert inside
    // bid_setup fires first, aborting the call before the Final is produced.

    // place_bid_public — quantity = 0 fires assert(quantity > 0u128) in bid_setup.
    @test
    @should_fail
    fn test_bid_pub_zero_qty() -> Final {
        let (bid, receipt, f): (
            fairdrop_ascending_v2.aleo::Bid,
            fairdrop_proof_v2.aleo::ParticipationReceipt,
            Final,
        ) = fairdrop_ascending_v2.aleo::place_bid_public(
            1field,   // auction_id — dummy; assert fires before any CPI
            0u128,    // quantity   — ZERO triggers assert(quantity > 0)
            1000u64,  // payment_amount
        );
        return final { f.run(); };
    }

    // place_bid_public — payment_amount = 0 fires assert(payment_amount > 0u64) in bid_setup.
    @test
    @should_fail
    fn test_bid_pub_zero_pay() -> Final {
        let (bid, receipt, f): (
            fairdrop_ascending_v2.aleo::Bid,
            fairdrop_proof_v2.aleo::ParticipationReceipt,
            Final,
        ) = fairdrop_ascending_v2.aleo::place_bid_public(
            1field,   // auction_id
            100u128,  // quantity — valid
            0u64,     // payment_amount — ZERO triggers assert(payment_amount > 0)
        );
        return final { f.run(); };
    }

    // place_bid_public_ref — quantity = 0
    @test
    @should_fail
    fn test_bid_pub_ref_zero_qty() -> Final {
        let (bid, receipt, f): (
            fairdrop_ascending_v2.aleo::Bid,
            fairdrop_proof_v2.aleo::ParticipationReceipt,
            Final,
        ) = fairdrop_ascending_v2.aleo::place_bid_public_ref(
            1field,   // auction_id
            0u128,    // quantity — ZERO triggers assert(quantity > 0)
            1000u64,  // payment_amount
            99field,  // code_id — dummy; never reached
        );
        return final { f.run(); };
    }

    // place_bid_public_ref — payment_amount = 0
    @test
    @should_fail
    fn test_bid_pub_ref_zero_pay() -> Final {
        let (bid, receipt, f): (
            fairdrop_ascending_v2.aleo::Bid,
            fairdrop_proof_v2.aleo::ParticipationReceipt,
            Final,
        ) = fairdrop_ascending_v2.aleo::place_bid_public_ref(
            1field,
            100u128,
            0u64,     // payment_amount — ZERO triggers assert(payment_amount > 0)
            99field,
        );
        return final { f.run(); };
    }

    // withdraw_payments — amount = 0 fires assert(amount > 0u128) in transition body.
    @test
    @should_fail
    fn test_withdraw_pay_zero() -> Final {
        let f: Final = fairdrop_ascending_v2.aleo::withdraw_payments(
            1field,  // auction_id — dummy; assert fires before credits CPI
            0u128,   // amount — ZERO triggers assert(amount > 0)
            aleo128wz89c78ur4mx378056yd9q7kqmphr07k0kfsmnwvqnv7g9syyqkg263r,  // recipient — dummy; never reached
        );
        return final { f.run(); };
    }

    // withdraw_unsold — amount = 0 fires assert(amount > 0u128) in transition body.
    @test
    @should_fail
    fn test_withdraw_unsold_zero() -> Final {
        let (token, f): (token_registry.aleo::Token, Final) =
            fairdrop_ascending_v2.aleo::withdraw_unsold(
                1field,   // auction_id
                0u128,    // amount — ZERO triggers assert(amount > 0)
                1field,   // sale_token_id — dummy; never reached
                aleo128wz89c78ur4mx378056yd9q7kqmphr07k0kfsmnwvqnv7g9syyqkg263r,  // recipient — dummy; never reached
            );
        return final { f.run(); };
    }

    // =========================================================================
    // Group 2: D12 caller-guard failures
    // =========================================================================
    // In the unit-test environment, allowed_callers mappings in fairdrop_proof_v2.aleo
    // and fairdrop_ref_v2.aleo are empty. fairdrop_ascending_v2.aleo is not registered
    // as a trusted caller, so CPI calls to those programs fail on their D12 guards.

    // close_auction → update_reputation → proof D12 fires:
    //   finalize_update_reputation asserts allowed_callers.get_or_use(caller, false)
    //   where caller = fairdrop_ascending_v2.aleo. Not registered → false.
    //   closer_reward = 0u128 so credits.transfer_public uses 0u64, reducing the
    //   chance that a credits-balance check masks the proof D12 assertion.
    @test
    @should_fail
    fn test_close_proof_d12() -> Final {
        let f: Final = fairdrop_ascending_v2.aleo::close_auction(
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
    //   where caller = fairdrop_ascending_v2.aleo. Not registered → false.
    //   budget = 0u128 so credits.transfer_public uses 0u64, reducing the chance
    //   that a credits-balance check masks the ref D12 assertion.
    @test
    @should_fail
    fn test_push_ref_d12() -> Final {
        let f: Final = fairdrop_ascending_v2.aleo::push_referral_budget(
            1field,  // auction_id
            0u128,   // budget = 0 — see comment above
        );
        return final { f.run(); };
    }

    // =========================================================================
    // Group 3: Role-check and escrow failures
    // =========================================================================
    // token_registry roles are empty in unit-test env; fairdrop_ascending_v2.aleo has
    // no SUPPLY_MANAGER_ROLE on any token → mint_private finalize reverts.
    // credits public balance for fairdrop_ascending_v2.aleo = 0 → transfer_public reverts.

    // cancel_auction → mint_private → SUPPLY_MANAGER_ROLE check fails.
    //   supply = 100u128 so transition body passes; role check fires in finalize.
    @test
    @should_fail
    fn test_cancel_no_role() -> Final {
        let (token, f): (token_registry.aleo::Token, Final) =
            fairdrop_ascending_v2.aleo::cancel_auction(
                1field,      // auction_id — nonexistent; role check fires before state read
                12345field,  // sale_token_id — dummy
                100u128,     // supply
            );
        return final { f.run(); };
    }

    // withdraw_unsold (nonzero amount) → mint_private → role check fails.
    //   amount = 1u128 passes assert(amount > 0) so failure occurs in finalize.
    @test
    @should_fail
    fn test_withdraw_unsold_role() -> Final {
        let (token, f): (token_registry.aleo::Token, Final) =
            fairdrop_ascending_v2.aleo::withdraw_unsold(
                1field,      // auction_id
                1u128,       // amount = 1 — passes transition-body assert
                12345field,  // sale_token_id
                aleo128wz89c78ur4mx378056yd9q7kqmphr07k0kfsmnwvqnv7g9syyqkg263r,  // recipient — dummy
            );
        return final { f.run(); };
    }

    // withdraw_payments (nonzero amount) → credits transfer fails.
    //   fairdrop_ascending_v2.aleo public credits balance = 0 in unit-test env.
    //   amount = 1u128 passes assert(amount > 0); credits transfer fires next.
    @test
    @should_fail
    fn test_withdraw_pay_no_cred() -> Final {
        let f: Final = fairdrop_ascending_v2.aleo::withdraw_payments(
            1field,  // auction_id
            1u128,   // amount = 1 — passes transition-body assert; credits fails
            aleo128wz89c78ur4mx378056yd9q7kqmphr07k0kfsmnwvqnv7g9syyqkg263r,  // recipient — dummy
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
            fairdrop_ascending_v2.aleo::withdraw_treasury_fees(
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
        let f: Final = fairdrop_ascending_v2.aleo::seed_liquidity(
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
        let f: Final = fairdrop_ascending_v2.aleo::seed_liquidity(
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
        let f: Final = fairdrop_ascending_v2.aleo::seed_liquidity(
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
