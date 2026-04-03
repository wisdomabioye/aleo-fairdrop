// fairdrop_proof_v2.aleo — Participation receipts and creator reputation.
// Leo 4.0 migration: fn/Final/final/:: — no behavioural changes.
//
// Responsibility:
//   - Issue ParticipationReceipt records to bidders (called via CPI from auction
//     contracts at commit_bid / place_bid).
//   - Track creator on-chain reputation (auctions_run, filled auctions, volume).
//     Called via CPI from auction contracts at close_auction.
//
// Caller authentication (D12):
//   All state-mutating transitions use allowed_callers[self.caller] in final block.
//   Only registered auction programs can call issue_receipt and update_reputation.
//
// Privacy note on `participated` mapping:
//   bidder_key = BHP256(bidder, auction_id) — computed by auction transition body
//   where self.signer is private. Raw bidder address never appears on-chain.
//
// ── GOVERNANCE ───────────────────────────────────────────────────────────────
// set_allowed_caller is governed by fairdrop_multisig_v1.aleo (two-phase approve_op).
// Admin rotation requires 3-of-5 multi-sig via fairdrop_multisig_v1.aleo::update_admin.
//
// ── Leo 4.0 migration notes ───────────────────────────────────────────────────
//   async constructor → constructor
//   async transition  → fn; async function finalize_* → deleted, inlined as final {}
//   self.caller captured before final {} (proof-context only; used for D12 guards)
//   self.signer captured before final {} where needed
//   structs moved outside program {}
//   Future → Final, .aleo/ → .aleo::
// ─────────────────────────────────────────────────────────────────────────────

import fairdrop_multisig_v1.aleo;

// ═════════════════════════════════════════════════════════════════════════════
// Module-level struct definitions
// Leo 4.0: structs outside program {} (convention; records stay inside).
// ═════════════════════════════════════════════════════════════════════════════

// Bidder key input for participated mapping hash.
// Same field layout as fairdrop_gate_v2.aleo BidderKey — consistent hash values.
struct BidderKey { bidder: address, auction_id: field }

// Creator reputation aggregate. Default values used via get_or_use.
struct CreatorStats {
    auctions_run: u64,   // total auctions closed (filled or not)
    filled:       u64,   // auctions where total_committed >= supply
    volume:       u128,  // cumulative total_payments in microcredits
}

// =============================================================================
// Program interface
// =============================================================================

program fairdrop_proof_v2.aleo {
    // Upgrade governance: 3-of-5 multi-sig must call fairdrop_multisig_v1.aleo::approve_upgrade
    // with contract_key=2field and this program's compiled checksum before deployment.
    @checksum(mapping="fairdrop_multisig_v1.aleo::approved_upgrades", key="2field")
    constructor() {}

    // =========================================================================
    // Constants
    // =========================================================================

    const INITIAL_ADMIN: address = aleo128wz89c78ur4mx378056yd9q7kqmphr07k0kfsmnwvqnv7g9syyqkg263r;

    // =========================================================================
    // Records
    // Leo 4.0: records remain inside program {} as part of the on-chain interface.
    // =========================================================================

    // Issued to bidder at commit_bid / place_bid. Private to owner.
    // commitment_hash: BHP256(CommitKey{auction_id, quantity, nonce, bidder})
    //   for sealed auctions. Pass 0field for all other auction types.
    record ParticipationReceipt {
        owner:           address,
        auction_id:      field,
        commitment_hash: field,
    }

    // =========================================================================
    // Mappings
    // =========================================================================

    // Auction programs authorised to call issue_receipt and update_reputation (D12).
    mapping allowed_callers: address => bool;

    // Bidder participation flag. Key = BHP256(BidderKey { bidder, auction_id }).
    mapping participated: field => bool;

    // Creator reputation. Keyed by creator address.
    mapping reputation: address => CreatorStats;

    // =========================================================================
    // 1. set_allowed_caller — admin only
    // =========================================================================

    fn set_allowed_caller(
        public program_addr: address,
        public allowed:      bool,
    ) -> Final {
        let caller: address = self.signer;
        return final {
            assert_eq(caller, INITIAL_ADMIN);
            allowed_callers.set(program_addr, allowed);
        };
    }

    // =========================================================================
    // 2. issue_receipt — CPI from auction commit_bid or place_bid
    // =========================================================================
    // Issues a ParticipationReceipt record to the bidder and sets
    // participated[bidder_key] = true.
    //
    // Leo 4.0: self.caller captured before final {} for D12 guard.
    // commitment_hash populates the receipt in the entry point body (private);
    // only bidder_key reaches the final block.

    fn issue_receipt(
        public auction_id:      field,
        public commitment_hash: field,
        public bidder_key:      field,  // BHP256(BidderKey{bidder,auction_id}), pre-computed by caller
    ) -> (ParticipationReceipt, Final) {
        let receipt: ParticipationReceipt = ParticipationReceipt {
            owner:           self.signer,
            auction_id:      auction_id,
            commitment_hash: commitment_hash,
        };
        // Capture self.caller — the calling auction program address for D12.
        let caller: address = self.caller;
        return (receipt, final {
            // D12: only registered auction programs may issue receipts.
            assert(allowed_callers.get_or_use(caller, false));
            participated.set(bidder_key, true);
        });
    }

    // =========================================================================
    // 3. update_reputation — CPI from auction close_auction
    // =========================================================================
    // Increments creator on-chain reputation stats after auction close.
    //
    // Leo 4.0: self.caller captured before final {} for D12 guard.

    fn update_reputation(
        public creator: address,
        public filled:  bool,
        public volume:  u128,
    ) -> Final {
        // Capture self.caller — the calling auction program address for D12.
        let caller: address = self.caller;
        return final {
            // D12: only registered auction programs may update reputation.
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
        };
    }
}
