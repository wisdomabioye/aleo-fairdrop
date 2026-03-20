// fairdrop_proof.aleo — Participation receipts and creator reputation.
//
// Responsibility:
//   - Issue ParticipationReceipt records to bidders (called via CPI from auction
//     contracts at commit_bid / place_bid). Receipts are ZK-provable proof of
//     participation — useful for future gating, airdrops, and social reputation.
//   - Track creator on-chain reputation (auctions_run, filled auctions, volume).
//     Called via CPI from auction contracts at close_auction.
//
// Caller authentication (D12):
//   All state-mutating transitions use allowed_callers[self.caller] in finalize.
//   Only registered auction programs (set via set_allowed_caller by protocol_admin)
//   can call issue_receipt and update_reputation. Direct user calls are rejected
//   because no user address is in allowed_callers.
//
// Privacy note on `participated` mapping:
//   participated[BHP256(bidder, auction_id)] = true is a PUBLIC mapping update.
//   The bidder's address and auction_id become publicly observable when this is set.
//   This is consistent with the auction type privacy models:
//     - Dutch / Ascending / LBP / Raise: bid quantity is already public.
//     - Sealed: the commit transaction itself is on-chain and bidder-linkable.
//   See DESIGN.md Section 12 (Privacy Threat Model).
//
// `participated` semantics:
//   participated = true means "at least one bid or commitment was submitted."
//   It is NOT reset by cancel_commitment. A bidder who cancels and re-bids holds
//   two ParticipationReceipt records — harmless, since receipts have no claim
//   value. Only Bid / Commitment records are redeemable at claim time.
//
// ── KNOWN OPERATIONAL RISK (admin) ──────────────────────────────────────────
// set_allowed_caller uses INITIAL_ADMIN constant, not a CPI to fairdrop_config.
// If the admin address needs to change, deploy fairdrop_proof_v2 via @admin.
// Pre-mainnet: align INITIAL_ADMIN with the multisig set in fairdrop_config.
// ─────────────────────────────────────────────────────────────────────────────

program fairdrop_proof.aleo {
    @admin(address="aleo128wz89c78ur4mx378056yd9q7kqmphr07k0kfsmnwvqnv7g9syyqkg263r")
    async constructor() {}

    // =========================================================================
    // Constants
    // =========================================================================

    // Initial protocol admin. Must match @admin address above.
    // If admin rotates, upgrade contract via @admin mechanism.
    const INITIAL_ADMIN: address = aleo128wz89c78ur4mx378056yd9q7kqmphr07k0kfsmnwvqnv7g9syyqkg263r;

    // =========================================================================
    // Structs
    // =========================================================================

    // Bidder key input for participated mapping hash.
    // Same field layout as fairdrop_gate.aleo/BidderKey — consistent hash values.
    struct BidderKey { bidder: address, auction_id: field }

    // Creator reputation aggregate. Default values used via get_or_use — no
    // initialization transaction required. All fields start at zero.
    struct CreatorStats {
        auctions_run: u64,   // total auctions closed (filled or not)
        filled:       u64,   // auctions where total_committed >= supply
        volume:       u128,  // cumulative total_payments in microcredits
    }

    // =========================================================================
    // Records
    // =========================================================================

    // Issued to bidder at commit_bid / place_bid. Private to owner.
    // commitment_hash: BHP256(CommitKey { auction_id, quantity, nonce, bidder })
    //   for sealed auctions (M2 fix — no double hash with undefined salt).
    //   Pass 0field for non-sealed auctions where no commitment exists.
    record ParticipationReceipt {
        owner:           address,  // bidder (self.signer at issue time)
        auction_id:      field,
        commitment_hash: field,    // 0field for Dutch/Raise/Ascending/LBP/Quadratic
    }

    // =========================================================================
    // Mappings
    // =========================================================================

    // Auction programs authorised to call issue_receipt and update_reputation (D12).
    mapping allowed_callers: address => bool;

    // Bidder participation flag. Key = BHP256(BidderKey { bidder, auction_id }).
    // Set to true by issue_receipt. Not reset by cancel_commitment.
    // Public: bidder address + auction_id become observable on-chain.
    mapping participated: field => bool;

    // Creator reputation. Keyed by creator address.
    // get_or_use with zero-value default — no initialization required.
    mapping reputation: address => CreatorStats;

    // =========================================================================
    // 1. set_allowed_caller — admin only
    // =========================================================================
    // Registers or deregisters an auction program as a trusted caller.
    // Must be called for each auction contract during Phase 1 deployment.
    // WARNING: single-key admin — address change requires contract upgrade via @admin.

    async transition set_allowed_caller(
        public program_addr: address,
        public allowed: bool,
    ) -> Future {
        return finalize_set_allowed_caller(self.signer, program_addr, allowed);
    }
    async function finalize_set_allowed_caller(
        caller:  address,
        program_addr: address,
        allowed: bool,
    ) {
        assert_eq(caller, INITIAL_ADMIN);
        allowed_callers.set(program_addr, allowed);
    }

    // =========================================================================
    // 2. issue_receipt — CPI from auction commit_bid or place_bid
    // =========================================================================
    // Issues a ParticipationReceipt record to the bidder and marks
    // participated[BHP256(bidder, auction_id)] = true.
    //
    // commitment_hash does NOT reach finalize — it is only used to populate the
    // receipt record in the transition body (private execution). Finalize only
    // updates the participated mapping with public (bidder, auction_id) inputs.
    //
    // Calling pattern from auction contract:
    //   let (receipt, f_proof): (fairdrop_proof.aleo/ParticipationReceipt, Future) =
    //       fairdrop_proof.aleo/issue_receipt(auction_id, commitment_hash_or_0field);
    //   // Return receipt alongside Bid record so bidder receives both.

    async transition issue_receipt(
        public auction_id:      field,
        public commitment_hash: field,
    ) -> (ParticipationReceipt, Future) {
        let receipt: ParticipationReceipt = ParticipationReceipt {
            owner:           self.signer,
            auction_id:      auction_id,
            commitment_hash: commitment_hash,
        };
        return (receipt, finalize_issue_receipt(self.caller, self.signer, auction_id));
    }
    async function finalize_issue_receipt(
        caller:     address,
        bidder:     address,
        auction_id: field,
    ) {
        // D12: only registered auction programs may issue receipts
        assert(allowed_callers.get_or_use(caller, false));
        let key: field = BHP256::hash_to_field(BidderKey { bidder, auction_id });
        participated.set(key, true);
    }

    // =========================================================================
    // 3. update_reputation — CPI from auction close_auction
    // =========================================================================
    // Increments the creator's on-chain reputation stats after auction close.
    //
    // filled: true if total_committed >= supply (auction fully cleared).
    //         Partial fills increment auctions_run but not filled.
    // volume: total_payments for this auction in microcredits.
    //
    // get_or_use ensures the first call for any creator address initialises
    // stats from zero — no separate initialisation transaction required.
    //
    // Arithmetic overflow: auctions_run and filled are u64 (max ~1.8 × 10^19).
    // volume is u128. None of these can realistically overflow.
    // Leo finalize reverts on overflow rather than wrapping — safe by default.

    async transition update_reputation(
        public creator: address,
        public filled:  bool,
        public volume:  u128,
    ) -> Future {
        return finalize_update_reputation(self.caller, creator, filled, volume);
    }
    async function finalize_update_reputation(
        caller:  address,
        creator: address,
        filled:  bool,
        volume:  u128,
    ) {
        // D12: only registered auction programs may update reputation
        assert(allowed_callers.get_or_use(caller, false));
        let stats: CreatorStats = reputation.get_or_use(creator, CreatorStats {
            auctions_run: 0u64,
            filled:       0u64,
            volume:       0u128,
        });
        reputation.set(creator, CreatorStats {
            auctions_run: stats.auctions_run + 1u64,
            filled:       stats.filled + (filled ? 1u64 : 0u64),
            volume:       stats.volume + volume,
        });
    }
}
