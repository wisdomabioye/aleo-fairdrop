// fairdrop_ref.aleo — Referral code creation, tracking, and commission distribution.
//
// Lifecycle:
//   1. create_code(auction_id, commission_bps) → ReferralCode (private record)
//      code_id = BHP256(CodeKey { referrer: self.signer, auction_id })
//      One code per referrer per auction. Re-registration permanently blocked.
//      commission_bps validated against protocol cap via fairdrop_config CPI.
//
//   2. Auction calls record_referral(code_id, auction_id, bidder_key, payment_amount)
//      via CPI at place_bid / commit_bid. Stores attributed code + bid-time payment.
//      One attribution per bidder per auction — double-attribution rejected.
//
//   3. At close_auction, auction calls fund_reserve(auction_id, referral_budget) via CPI.
//      Simultaneously sends credits.aleo/transfer_public(fairdrop_ref, referral_budget).
//      Sets reserve_funded[auction_id] = true (proxy for state.cleared).
//      One call per auction enforced — second call reverts entire close tx.
//
//   4. credit_commission(code_id, bidder_key) — permissionless, after auction closes.
//      Reads payment_amount from referral_records (stored at bid time — not caller-
//      supplied). Eliminates griefing via under-reported amounts (G4 fix).
//      Caps commission at remaining reserve. Marks bidder as credited permanently.
//
//   5. claim_commission(code: ReferralCode, claimed_amount) → private credits
//      Consumes the private ReferralCode record (only owner can spend it).
//      Delivers earned[code_id] credits via transfer_public_to_private.
//      D11 pattern: claimed_amount validated against earned[code_id] in finalize.
//
// ── Privacy guarantees ───────────────────────────────────────────────────────
// Referrer address:
//   Revealed in the create_code and claim_commission tx signers. Inherent.
//   Never stored in any public mapping. ReferralCode record is private.
//
// Bidder → referrer link:
//   NOT on-chain. referral_records stores pseudonymous bidder_key
//   (= BHP256(bidder, auction_id), computed and supplied by the auction program).
//   Observer needs two hops to link: de-anonymize bidder_key → code_id → referrer.
//   Bidder's raw address never reaches any finalize function.
//
// Referrer → bidder link:
//   Never on-chain. ReferralCode record fields are private. earned[code_id] is
//   public but code_id is a hash — no direct address linkage.
//
// ── Referral index — indexer-independent bidder discovery ────────────────────
// referral_count[code_id] and referral_list[BHP256(RefListKey{code_id, index})]
// form an append-only on-chain index of every bidder_key attributed to a code.
// Referrer frontend query (no event history needed):
//   n = referral_count[code_id]
//   for i in 0..n:
//     bk = referral_list[BHP256(RefListKey{code_id, i})]
//     rec = referral_records[bk]
//     if !rec.credited → credit_commission(code_id, bk)
// This eliminates indexer-miss risk: bidder_keys are always recoverable from
// current chain state alone, even if all historical events were lost.
//
// ── KNOWN LIMITATION: reserve exhaustion race ────────────────────────────────
// referral_reserve[auction_id] is shared across all codes for an auction.
// credit_commission is first-come — whoever calls first claims the reserve.
// In practice, each referrer calls for their own code_id. Reserve is bounded
// by the platform fee — all money stays within the protocol regardless.
//
// ── KNOWN LIMITATION: bid-time payment basis ────────────────────────────────
// payment_amount stored at record_referral (bid time) is the bid-price payment,
// not the final clearing-price payment. For Dutch auctions with a clearing price
// below the bid price, commission is slightly overstated but bounded by the
// reserve. This is the only payment figure available on-chain at bid time.
//
// ── KNOWN OPERATIONAL RISK (admin) ──────────────────────────────────────────
// set_allowed_caller uses INITIAL_ADMIN constant, not a CPI to fairdrop_config.
// Admin key change requires contract upgrade via @admin.
// Pre-mainnet: align INITIAL_ADMIN with the multisig in fairdrop_config.
// ─────────────────────────────────────────────────────────────────────────────

import fairdrop_config.aleo;
import credits.aleo;

program fairdrop_ref.aleo {
    @admin(address="aleo128wz89c78ur4mx378056yd9q7kqmphr07k0kfsmnwvqnv7g9syyqkg263r")
    async constructor() {}

    // =========================================================================
    // Constants
    // =========================================================================

    const INITIAL_ADMIN: address = aleo128wz89c78ur4mx378056yd9q7kqmphr07k0kfsmnwvqnv7g9syyqkg263r;

    // =========================================================================
    // Structs
    // =========================================================================

    // BHP256 input for deterministic code_id derivation (G1).
    // code_id = BHP256::hash_to_field(CodeKey { referrer: self.signer, auction_id })
    // Guarantees one code per referrer per auction with no nonce needed.
    struct CodeKey { referrer: address, auction_id: field }

    // Stored in registrations[code_id]. Immutable after create_code (G2).
    struct ReferralConfig { auction_id: field, bps: u16 }

    // Stored in referral_records[bidder_key].
    // code_id == 0field is the sentinel for "not yet attributed."
    //   Safe: BHP256(CodeKey) == 0field has probability ~1/2^253 — negligible.
    // payment_amount: stored at record_referral time, not credit_commission time (G4).
    // credited: true after credit_commission runs — prevents double-crediting.
    struct ReferralRecord {
        code_id:        field,
        payment_amount: u128,
        credited:       bool,
    }

    // BHP256 input for the referral list index key.
    // referral_list[BHP256(RefListKey { code_id, index })] = bidder_key.
    // index is the zero-based position of the bidder_key in the per-code list.
    struct RefListKey { code_id: field, index: u64 }

    // =========================================================================
    // Record
    // =========================================================================

    // Private to the referrer (owner). Consumed at claim_commission.
    // commission_bps is stored for referrer's reference; bps in registrations
    // mapping is the authoritative source used by credit_commission.
    record ReferralCode {
        owner:          address,
        code_id:        field,
        auction_id:     field,
        commission_bps: u16,
    }

    // =========================================================================
    // Mappings
    // =========================================================================

    // Auction programs authorised to call fund_reserve and record_referral (D12).
    mapping allowed_callers: address => bool;

    // code_id → exists. Set once at create_code, never unset (G2).
    // Guards: re-registration, fake-code recording (G7).
    mapping code_registered: field => bool;

    // code_id → { auction_id, bps }. Written once at create_code. Immutable.
    mapping registrations: field => ReferralConfig;

    // auction_id → available referral budget in microcredits (G3).
    // Keyed by auction_id directly (globally unique via PROGRAM_SALT — G23).
    // Backed by real credits in fairdrop_ref.aleo's credits.aleo public balance.
    // Decremented by credit_commission. Cannot go below zero (ternary cap).
    mapping referral_reserve: field => u128;

    // auction_id → fund_reserve has been called (G8).
    // Proxy for state.cleared — avoids cross-program mapping reads.
    // Set once; second fund_reserve call reverts (G9).
    mapping reserve_funded: field => bool;

    // code_id → accrued credits, ready for referrer to claim.
    // Incremented by credit_commission. Drained to 0u128 at claim_commission.
    mapping earned: field => u128;

    // bidder_key → ReferralRecord { code_id, payment_amount, credited }
    // Key is pseudonymous (supplied by the auction: BHP256(bidder, auction_id)).
    // code_id == 0field = not yet attributed (default sentinel).
    mapping referral_records: field => ReferralRecord;

    // code_id → total number of bidder_keys recorded for this code.
    // Used by the referrer frontend to enumerate the referral_list without
    // relying on event history. Incremented by each record_referral call.
    mapping referral_count: field => u64;

    // BHP256(RefListKey { code_id, index }) → bidder_key.
    // Append-only. Enables O(N) enumeration of all bidder_keys for a code
    // purely from current chain state — no indexer event history required.
    mapping referral_list: field => field;

    // =========================================================================
    // 1. set_allowed_caller — admin only
    // =========================================================================
    // Registers or deregisters an auction program as a trusted caller.
    // Must be called for each auction contract during Phase 1 deployment.
    // WARNING: admin key is the INITIAL_ADMIN constant — address change requires
    // contract upgrade via @admin. To be aligned with multisig before mainnet.

    async transition set_allowed_caller(
        public program_addr: address,
        public allowed:      bool,
    ) -> Future {
        return finalize_set_allowed_caller(self.signer, program_addr, allowed);
    }
    async function finalize_set_allowed_caller(
        caller:       address,
        program_addr: address,
        allowed:      bool,
    ) {
        assert_eq(caller, INITIAL_ADMIN);
        allowed_callers.set(program_addr, allowed);
    }

    // =========================================================================
    // 2. create_code — referrer or creator creates a referral code
    // =========================================================================
    // code_id = BHP256(CodeKey { referrer: self.signer, auction_id }) (G1).
    // Re-registration of the same code_id is permanently rejected (G2).
    // commission_bps validated against fairdrop_config.aleo/assert_ref_bps (G13).
    //
    // Permissionless: anyone can create a code for any auction_id (including
    // ones that don't exist yet). Creating a code for a non-existent auction
    // is harmless — no reserve will ever be funded, credit_commission will
    // always fail the reserve_funded guard.
    //
    // Privacy: the create_code tx signer (referrer) is public. The code_id
    // stored on-chain is a hash — not the referrer's address. The ReferralCode
    // record is private (encrypted to the referrer's view key).

    async transition create_code(
        public auction_id:     field,
        public commission_bps: u16,
    ) -> (ReferralCode, Future) {
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
        // Validate commission_bps against protocol max_referral_bps (G13)
        let f_config: Future = fairdrop_config.aleo/assert_ref_bps(commission_bps);
        return (code, finalize_create_code(code_id, auction_id, commission_bps, f_config));
    }
    async function finalize_create_code(
        code_id:       field,
        auction_id:    field,
        commission_bps: u16,
        f_config:      Future,
    ) {
        // bps cap validated by fairdrop_config (G13)
        f_config.await();
        // One registration per code_id — prevents bps overwrite (G2)
        assert(!code_registered.get_or_use(code_id, false));
        code_registered.set(code_id, true);
        registrations.set(code_id, ReferralConfig {
            auction_id: auction_id,
            bps:        commission_bps,
        });
    }

    // =========================================================================
    // 3. fund_reserve — CPI from auction close_auction only
    // =========================================================================
    // Records the referral budget for an auction and marks it as closed.
    //
    // The auction must also call credits.aleo/transfer_public(fairdrop_ref, amount)
    // in the same transaction to back the reserve with real credits. Both calls are
    // atomic — if either fails, the entire close_auction tx reverts.
    //
    // One call per auction enforced (G9): second call reverts. Auction contracts
    // must not call fund_reserve twice for the same auction_id.
    //
    // amount = 0 is allowed (integer truncation on tiny auctions). In this case:
    //   reserve_funded is set to true, reserve = 0.
    //   All subsequent credit_commission calls credit 0 and mark bidders credited.
    //   Auction implementers should skip fund_reserve if referral_budget = 0.

    async transition fund_reserve(
        public auction_id: field,
        public amount:     u128,
    ) -> Future {
        return finalize_fund_reserve(self.caller, auction_id, amount);
    }
    async function finalize_fund_reserve(
        caller:     address,
        auction_id: field,
        amount:     u128,
    ) {
        // D12: only registered auction programs may fund the reserve
        assert(allowed_callers.get_or_use(caller, false));
        // One call per auction — prevents accounting inflation (G9)
        assert(!reserve_funded.get_or_use(auction_id, false));
        referral_reserve.set(auction_id, amount);
        reserve_funded.set(auction_id, true);
    }

    // =========================================================================
    // 4. record_referral — CPI from auction place_bid or commit_bid
    // =========================================================================
    // Attributes a bidder to a referral code and stores their bid-time payment.
    // Storing payment_amount here (not in credit_commission) prevents griefing
    // via caller-supplied under-reporting (G4).
    //
    // Parameters from auction (all public — D11 pattern):
    //   code_id:        referral code the bidder chose
    //   auction_id:     calling auction's auction_id (for cross-auction guard)
    //   bidder_key:     BHP256(bidder, auction_id) — pseudonymous, no raw address
    //   payment_amount: bid-time payment (not clearing-price payment — see file header)
    //
    // Guards:
    //   G7: code_registered — fake/mistyped codes rejected
    //   G6: registrations[code_id].auction_id == auction_id — cross-auction guard
    //   G5: sentinel check — one attribution per bidder per auction

    async transition record_referral(
        public code_id:        field,
        public auction_id:     field,
        public bidder_key:     field,
        public payment_amount: u128,
    ) -> Future {
        return finalize_record_referral(
            self.caller, code_id, auction_id, bidder_key, payment_amount
        );
    }
    async function finalize_record_referral(
        caller:         address,
        code_id:        field,
        auction_id:     field,
        bidder_key:     field,
        payment_amount: u128,
    ) {
        // D12: only registered auction programs may record referrals
        assert(allowed_callers.get_or_use(caller, false));
        // G7: code must be registered — reject fake or mistyped code_ids
        assert(code_registered.get_or_use(code_id, false));
        // G6: code must belong to this auction — reject cross-auction injection
        let config: ReferralConfig = registrations.get(code_id);
        assert_eq(config.auction_id, auction_id);
        // G5: one attribution per bidder per auction
        // Default sentinel: code_id = 0field means no prior attribution.
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
        // Referrer frontend can recover all bidder_keys from chain state alone:
        //   n = referral_count[code_id]
        //   bk_i = referral_list[BHP256(RefListKey { code_id, index: i })]  for i in 0..n
        // No indexer event history needed — eliminates indexer-miss liveness risk.
        let count: u64 = referral_count.get_or_use(code_id, 0u64);
        let list_key: field = BHP256::hash_to_field(RefListKey { code_id, index: count });
        referral_list.set(list_key, bidder_key);
        referral_count.set(code_id, count + 1u64);
    }

    // =========================================================================
    // 5. credit_commission — permissionless, after auction closes
    // =========================================================================
    // Credits the commission for one referred bidder to earned[code_id].
    // Callable by anyone — referrers typically call this for their own bidders.
    //
    // payment_amount is read from referral_records (stored at bid time, by the
    // auction program). The caller cannot supply or influence this value (G4).
    //
    // Attribution guard: referral_records[bidder_key].code_id must equal code_id.
    // Prevents crediting a bidder's payment to the wrong referrer (G5).
    //
    // reserve_funded guard: assert(reserve_funded[auction_id]).
    // Proxy for state.cleared — avoids cross-program mapping reads (G8).
    //
    // Commission = payment_amount * bps / 10000, capped at remaining reserve.
    // reserve cannot underflow: actual = min(commission, reserve) via ternary.
    //
    // When reserve = 0 (exhausted): actual = 0, bidder still marked credited.
    // Reserve exhaustion race: see file header — accepted, bounded by platform fee.

    async transition credit_commission(
        public code_id:    field,
        public bidder_key: field,
    ) -> Future {
        return finalize_credit_commission(code_id, bidder_key);
    }
    async function finalize_credit_commission(
        code_id:    field,
        bidder_key: field,
    ) {
        // Hard fail if bidder was never attributed — referral_records.get() reverts
        // if bidder_key has no entry. Ensures only genuine referred bidders are credited.
        let rec: ReferralRecord = referral_records.get(bidder_key);

        // G5: attribution guard — this bidder must have used this specific code
        assert_eq(rec.code_id, code_id);
        // Double-credit guard — permanently blocks second call for same bidder
        assert(!rec.credited);

        // Resolve auction and commission rate
        let config: ReferralConfig = registrations.get(code_id);
        let auction_id: field      = config.auction_id;

        // G8: auction must have closed — reserve_funded is the proxy
        assert(reserve_funded.get_or_use(auction_id, false));

        // Compute commission — bps cast to u128 before multiply to avoid type mismatch
        let bps_u128: u128    = config.bps as u128;
        let commission: u128  = rec.payment_amount * bps_u128 / 10000u128;

        // Cap at remaining reserve — actual <= reserve, so reserve - actual >= 0 always
        let reserve: u128     = referral_reserve.get_or_use(auction_id, 0u128);
        let actual: u128      = commission <= reserve ? commission : reserve;

        // Accumulate into earned; drain reserve
        let prev: u128        = earned.get_or_use(code_id, 0u128);
        earned.set(code_id, prev + actual);
        referral_reserve.set(auction_id, reserve - actual);

        // Mark credited — prevents double-credit even if earned[code_id] later grows
        referral_records.set(bidder_key, ReferralRecord {
            code_id:        rec.code_id,
            payment_amount: rec.payment_amount,
            credited:       true,
        });
    }

    // =========================================================================
    // 6. claim_commission — referrer claims all accrued earnings
    // =========================================================================
    // Consumes the private ReferralCode record. Only the owner (referrer) can
    // spend it — Aleo record ownership is cryptographically enforced.
    //
    // Delivers earned[code_id] as a private credits record via
    // transfer_public_to_private. After claiming, earned[code_id] = 0.
    //
    // D11 pattern: caller supplies claimed_amount; finalize validates against
    // earned[code_id]. On mismatch (race: credit_commission ran in same block),
    // the tx reverts. Frontend should re-read earned[code_id] and retry.
    //
    // Privacy: the referrer's address is the tx signer — the same address that
    // appeared in the create_code tx. No new privacy loss at claim time.
    // The private credit record is encrypted to the referrer's view key.
    //
    // G10: assert(claimed_amount > 0) prevents zero-amount credit transfers.

    async transition claim_commission(
        code:                  ReferralCode,
        public claimed_amount: u128,
    ) -> (credits.aleo/credits, Future) {
        // Transfer credits privately to the referrer
        // code.owner == self.signer (record ownership enforced by Aleo protocol)
        let (credit_record, f_credits): (credits.aleo/credits, Future) =
            credits.aleo/transfer_public_to_private(code.owner, claimed_amount as u64);
        return (
            credit_record,
            finalize_claim_commission(code.code_id, claimed_amount, f_credits)
        );
    }
    async function finalize_claim_commission(
        code_id:       field,
        claimed_amount: u128,
        f_credits:     Future,
    ) {
        // G10: zero-amount credit transfers are invalid
        assert(claimed_amount > 0u128);
        // D11: validate claimed_amount matches on-chain earned[code_id]
        assert_eq(earned.get_or_use(code_id, 0u128), claimed_amount);
        // Drain — record is already consumed (Aleo enforces), but belt-and-suspenders
        earned.set(code_id, 0u128);
        // Execute the credits transfer
        f_credits.await();
    }
}
