// fairdrop_gate_v2.aleo — Access control for all Fairdrop auctions.
// Leo 4.0 migration: fn/Final/final/:: — no behavioural changes.
//
// Three gate modes:
//   0 = OPEN        — no restriction; all bidders admitted automatically
//   1 = MERKLE      — bidder must prove inclusion in a Merkle allowlist
//   2 = CREDENTIAL  — bidder must present a signed ZK credential
//
// Lifecycle:
//   1. Creator's auction contract calls register_gate() via CPI at create_auction.
//   2. For gated auctions, each bidder calls verify_merkle() or verify_credential().
//   3. Auction calls check_admission() via CPI at place_bid.
//   Auction contracts ALWAYS call check_admission — mode-awareness is handled
//   inside check_admission, avoiding conditional CPI in auction contracts (G15).
//
// ── Merkle allowlist spec ────────────────────────────────────────────────────
//   Depth: 20 levels → max 2^20 = 1,048,576 addresses.
//   Leaf:  BHP256::hash_to_field(LeafHash { addr: bidder_address })
//   Node:  BHP256::hash_to_field(MerkleNode { left: L, right: R })
//   path_bits: bit i = 0 → bidder is LEFT child at level i
//
// ── Credential spec ─────────────────────────────────────────────────────────
//   Message: CredentialMessage { holder: address, auction_id: field, expiry: u32 }
//   Hash:    BHP256::hash_to_field(CredentialMessage { holder, auction_id, expiry })
//   Sig:     Aleo private key sign over the hash above
//
// ── GOVERNANCE ───────────────────────────────────────────────────────────────
// set_allowed_caller is governed by fairdrop_multisig_v1.aleo (two-phase approve_op).
// Admin rotation requires 3-of-5 multi-sig via fairdrop_multisig_v1.aleo::update_admin.
//
// ── Leo 4.0 migration notes ───────────────────────────────────────────────────
//   async constructor → constructor
//   async transition  → fn; async function finalize_* → deleted, inlined as final {}
//   self.caller captured before final {} for D12 guards (register_gate)
//   self.signer captured before final {} (verify_merkle, verify_credential,
//     check_admission — bidder address needed in finalization context)
//   structs moved outside program {}
//   Future → Final, .aleo/ → .aleo::
// ─────────────────────────────────────────────────────────────────────────────

import fairdrop_multisig_v1.aleo;

// ═════════════════════════════════════════════════════════════════════════════
// Module-level struct definitions
// Leo 4.0: structs outside program {} (convention).
// ═════════════════════════════════════════════════════════════════════════════

// Merkle leaf hash input.
struct LeafHash { addr: address }

// Merkle node hash input.
struct MerkleNode { left: field, right: field }

// verified mapping key input.
struct BidderKey { bidder: address, auction_id: field }

// Credential message. Field order is canonical (G29) — off-chain signer must match.
struct CredentialMessage {
    holder:     address,
    auction_id: field,
    expiry:     u32,
}

// =============================================================================
// Program interface
// =============================================================================

program fairdrop_gate_v2.aleo {
    // Upgrade governance: 3-of-5 multi-sig must call fairdrop_multisig_v1.aleo::approve_upgrade
    // with contract_key=1field and this program's compiled checksum before deployment.
    @checksum(mapping="fairdrop_multisig_v1.aleo::approved_upgrades", key="1field")
    constructor() {}

    // =========================================================================
    // Constants
    // =========================================================================

    const GATE_OPEN: u8       = 0u8;
    const GATE_MERKLE: u8     = 1u8;
    const GATE_CREDENTIAL: u8 = 2u8;

    const ZERO_ADDRESS: address = aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc;

    const INITIAL_ADMIN: address = aleo128wz89c78ur4mx378056yd9q7kqmphr07k0kfsmnwvqnv7g9syyqkg263r;

    // =========================================================================
    // Mappings
    // =========================================================================

    mapping allowed_callers:    address => bool;
    mapping gate_registered:    field   => bool;
    mapping gate_modes:         field   => u8;
    mapping allowlists:         field   => field;
    mapping credential_issuers: field   => address;
    mapping verified:           field   => bool;

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
    // 2. register_gate — CPI from auction create_auction only
    // =========================================================================
    // Records the gate configuration for a single auction.
    // Each auction_id can only be registered once.
    //
    // Leo 4.0: self.caller captured before final {} for D12 guard.

    fn register_gate(
        public auction_id: field,
        public gate_mode:  u8,
        public root:       field,
        public issuer:     address,
    ) -> Final {
        // Capture self.caller — the calling auction program address for D12.
        let caller: address = self.caller;
        return final {
            assert(allowed_callers.get_or_use(caller, false));
            assert(!gate_registered.get_or_use(auction_id, false));
            assert(gate_mode <= GATE_CREDENTIAL);
            assert(gate_mode != GATE_MERKLE     || root   != 0field);
            assert(gate_mode != GATE_CREDENTIAL || issuer != ZERO_ADDRESS);

            gate_registered.set(auction_id, true);
            gate_modes.set(auction_id, gate_mode);
            allowlists.set(auction_id, root);
            credential_issuers.set(auction_id, issuer);
        };
    }

    // =========================================================================
    // 3. verify_merkle — bidder proves Merkle inclusion (gate_mode == 1)
    // =========================================================================
    // proof[i] is the sibling node at level i.
    // path_bits: bit i = 0 → bidder is left child.
    // On success: verified[BHP256(bidder, auction_id)] = true.
    //
    // Leo 4.0: self.signer captured before final {} (bidder address needed
    // to compute the leaf hash and verified mapping key in finalization).

    fn verify_merkle(
        public auction_id: field,
        public proof:      [field; 20],
        public path_bits:  u32,
    ) -> Final {
        // Capture self.signer — bidder address needed in final block.
        let bidder: address = self.signer;
        return final {
            assert_eq(gate_modes.get_or_use(auction_id, GATE_OPEN), GATE_MERKLE);

            let leaf: field = BHP256::hash_to_field(LeafHash { addr: bidder });

            // ── 20-level Merkle proof (unrolled — Leo has no loops) ───────────────
            // Bit i = 0: current node is left  → hash(current, sibling)
            // Bit i = 1: current node is right → hash(sibling, current)
            let bit0: bool   = (path_bits & 1u32) == 1u32;
            let node0: field = bit0 ?
                BHP256::hash_to_field(MerkleNode { left: proof[0],  right: leaf   }) :
                BHP256::hash_to_field(MerkleNode { left: leaf,      right: proof[0]  });

            let bit1: bool   = ((path_bits >> 1u32) & 1u32) == 1u32;
            let node1: field = bit1 ?
                BHP256::hash_to_field(MerkleNode { left: proof[1],  right: node0  }) :
                BHP256::hash_to_field(MerkleNode { left: node0,     right: proof[1]  });

            let bit2: bool   = ((path_bits >> 2u32) & 1u32) == 1u32;
            let node2: field = bit2 ?
                BHP256::hash_to_field(MerkleNode { left: proof[2],  right: node1  }) :
                BHP256::hash_to_field(MerkleNode { left: node1,     right: proof[2]  });

            let bit3: bool   = ((path_bits >> 3u32) & 1u32) == 1u32;
            let node3: field = bit3 ?
                BHP256::hash_to_field(MerkleNode { left: proof[3],  right: node2  }) :
                BHP256::hash_to_field(MerkleNode { left: node2,     right: proof[3]  });

            let bit4: bool   = ((path_bits >> 4u32) & 1u32) == 1u32;
            let node4: field = bit4 ?
                BHP256::hash_to_field(MerkleNode { left: proof[4],  right: node3  }) :
                BHP256::hash_to_field(MerkleNode { left: node3,     right: proof[4]  });

            let bit5: bool   = ((path_bits >> 5u32) & 1u32) == 1u32;
            let node5: field = bit5 ?
                BHP256::hash_to_field(MerkleNode { left: proof[5],  right: node4  }) :
                BHP256::hash_to_field(MerkleNode { left: node4,     right: proof[5]  });

            let bit6: bool   = ((path_bits >> 6u32) & 1u32) == 1u32;
            let node6: field = bit6 ?
                BHP256::hash_to_field(MerkleNode { left: proof[6],  right: node5  }) :
                BHP256::hash_to_field(MerkleNode { left: node5,     right: proof[6]  });

            let bit7: bool   = ((path_bits >> 7u32) & 1u32) == 1u32;
            let node7: field = bit7 ?
                BHP256::hash_to_field(MerkleNode { left: proof[7],  right: node6  }) :
                BHP256::hash_to_field(MerkleNode { left: node6,     right: proof[7]  });

            let bit8: bool   = ((path_bits >> 8u32) & 1u32) == 1u32;
            let node8: field = bit8 ?
                BHP256::hash_to_field(MerkleNode { left: proof[8],  right: node7  }) :
                BHP256::hash_to_field(MerkleNode { left: node7,     right: proof[8]  });

            let bit9: bool   = ((path_bits >> 9u32) & 1u32) == 1u32;
            let node9: field = bit9 ?
                BHP256::hash_to_field(MerkleNode { left: proof[9],  right: node8  }) :
                BHP256::hash_to_field(MerkleNode { left: node8,     right: proof[9]  });

            let bit10: bool   = ((path_bits >> 10u32) & 1u32) == 1u32;
            let node10: field = bit10 ?
                BHP256::hash_to_field(MerkleNode { left: proof[10], right: node9  }) :
                BHP256::hash_to_field(MerkleNode { left: node9,     right: proof[10] });

            let bit11: bool   = ((path_bits >> 11u32) & 1u32) == 1u32;
            let node11: field = bit11 ?
                BHP256::hash_to_field(MerkleNode { left: proof[11], right: node10 }) :
                BHP256::hash_to_field(MerkleNode { left: node10,    right: proof[11] });

            let bit12: bool   = ((path_bits >> 12u32) & 1u32) == 1u32;
            let node12: field = bit12 ?
                BHP256::hash_to_field(MerkleNode { left: proof[12], right: node11 }) :
                BHP256::hash_to_field(MerkleNode { left: node11,    right: proof[12] });

            let bit13: bool   = ((path_bits >> 13u32) & 1u32) == 1u32;
            let node13: field = bit13 ?
                BHP256::hash_to_field(MerkleNode { left: proof[13], right: node12 }) :
                BHP256::hash_to_field(MerkleNode { left: node12,    right: proof[13] });

            let bit14: bool   = ((path_bits >> 14u32) & 1u32) == 1u32;
            let node14: field = bit14 ?
                BHP256::hash_to_field(MerkleNode { left: proof[14], right: node13 }) :
                BHP256::hash_to_field(MerkleNode { left: node13,    right: proof[14] });

            let bit15: bool   = ((path_bits >> 15u32) & 1u32) == 1u32;
            let node15: field = bit15 ?
                BHP256::hash_to_field(MerkleNode { left: proof[15], right: node14 }) :
                BHP256::hash_to_field(MerkleNode { left: node14,    right: proof[15] });

            let bit16: bool   = ((path_bits >> 16u32) & 1u32) == 1u32;
            let node16: field = bit16 ?
                BHP256::hash_to_field(MerkleNode { left: proof[16], right: node15 }) :
                BHP256::hash_to_field(MerkleNode { left: node15,    right: proof[16] });

            let bit17: bool   = ((path_bits >> 17u32) & 1u32) == 1u32;
            let node17: field = bit17 ?
                BHP256::hash_to_field(MerkleNode { left: proof[17], right: node16 }) :
                BHP256::hash_to_field(MerkleNode { left: node16,    right: proof[17] });

            let bit18: bool   = ((path_bits >> 18u32) & 1u32) == 1u32;
            let node18: field = bit18 ?
                BHP256::hash_to_field(MerkleNode { left: proof[18], right: node17 }) :
                BHP256::hash_to_field(MerkleNode { left: node17,    right: proof[18] });

            let bit19: bool   = ((path_bits >> 19u32) & 1u32) == 1u32;
            let node19: field = bit19 ?
                BHP256::hash_to_field(MerkleNode { left: proof[19], right: node18 }) :
                BHP256::hash_to_field(MerkleNode { left: node18,    right: proof[19] });
            // ─────────────────────────────────────────────────────────────────

            assert_eq(node19, allowlists.get(auction_id));
            let key: field = BHP256::hash_to_field(BidderKey { bidder: bidder, auction_id: auction_id });
            verified.set(key, true);
        };
    }

    // =========================================================================
    // 4. verify_credential — bidder presents a signed ZK credential (gate_mode == 2)
    // =========================================================================
    // Signature verification is ZK — done in the entry point body (private).
    // Finalize only checks expiry and validates the issuer.
    //
    // Leo 4.0: self.signer captured before final {} (bidder address needed
    // to compute the verified mapping key in finalization).

    fn verify_credential(
        public auction_id: field,
        public issuer:     address,  // D11: supplied by caller, validated in final
        sig:               signature, // private — ZK-verified in entry point body
        public expiry:     u32,
    ) -> Final {
        // Canonical credential message hash — field order matches G29 spec.
        let msg: field = BHP256::hash_to_field(CredentialMessage {
            holder:     self.signer,
            auction_id: auction_id,
            expiry:     expiry,
        });
        // Verify signature in ZK (private). Proof generation fails if invalid.
        assert(signature::verify(sig, issuer, msg));

        // Capture self.signer — bidder address needed in final block.
        let bidder: address = self.signer;
        return final {
            assert_eq(gate_modes.get_or_use(auction_id, GATE_OPEN), GATE_CREDENTIAL);
            assert_eq(issuer, credential_issuers.get(auction_id));
            assert(block.height < expiry);

            let key: field = BHP256::hash_to_field(BidderKey { bidder: bidder, auction_id: auction_id });
            verified.set(key, true);
        };
    }

    // =========================================================================
    // 5. check_admission — CPI from auction finalize_place_bid
    // =========================================================================
    // GATE_OPEN (mode 0): always passes.
    // GATE_MERKLE / GATE_CREDENTIAL: verified[key] must be true.
    // Unregistered auction_ids default to GATE_OPEN.
    //
    // Leo 4.0: self.signer captured before final {} (bidder address needed
    // to look up the verified mapping key in finalization).

    fn check_admission(public auction_id: field) -> Final {
        // Capture self.signer — bidder address needed in final block.
        let bidder: address = self.signer;
        return final {
            let mode: u8          = gate_modes.get_or_use(auction_id, GATE_OPEN);
            let key: field        = BHP256::hash_to_field(BidderKey { bidder: bidder, auction_id: auction_id });
            let is_admitted: bool = verified.get_or_use(key, false);
            // Open: always passes. Gated: requires prior verify_merkle or verify_credential.
            assert(mode == GATE_OPEN || is_admitted);
        };
    }
}
