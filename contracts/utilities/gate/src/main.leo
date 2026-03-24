// fairdrop_gate_v1.aleo — Access control for all Fairdrop auctions.
//
// Three gate modes:
//   0 = OPEN        — no restriction; all bidders admitted automatically
//   1 = MERKLE      — bidder must prove inclusion in a Merkle allowlist
//   2 = CREDENTIAL  — bidder must present a signed ZK credential
//
// Lifecycle:
//   1. Creator's auction contract calls register_gate() via CPI at create_auction.
//      Gate mode, Merkle root, and/or issuer address are stored.
//   2. For gated auctions, each bidder calls verify_merkle() or verify_credential()
//      to set their verified[key] = true before placing a bid.
//   3. The auction finalize calls check_admission() via CPI at place_bid.
//      For open auctions (mode 0): always passes.
//      For gated auctions: requires verified[key] == true.
//   Auction contracts ALWAYS call check_admission — mode-awareness is handled
//   inside check_admission, avoiding conditional CPI in auction contracts (G15).
//
// ── Merkle allowlist spec (off-chain builder MUST match exactly) ─────────────
//   Depth: 20 levels → max 2^20 = 1,048,576 addresses.
//   Leaf formula:   BHP256::hash_to_field(LeafHash { addr: bidder_address })
//   Empty sentinel: BHP256::hash_to_field(LeafHash { addr: ZERO_ADDRESS })
//   All 2^20 leaf slots must be filled using the sentinel value.
//   Node formula:   BHP256::hash_to_field(MerkleNode { left: L, right: R })
//   path_bits:      bit i = 0 → bidder is LEFT child at level i (sibling goes right)
//                   bit i = 1 → bidder is RIGHT child at level i (sibling goes left)
// ─────────────────────────────────────────────────────────────────────────────
//
// ── Credential spec (off-chain signing service MUST match exactly) ───────────
//   Message struct (field order is canonical — G29):
//     CredentialMessage { holder: address, auction_id: field, expiry: u32 }
//   Hash:      BHP256::hash_to_field(CredentialMessage { holder, auction_id, expiry })
//   Signature: Aleo private key sign over the hash above
//   Expiry:    block height. Valid while block.height < expiry.
//   Issuer:    caller supplies issuer address (D11); finalize validates against
//              credential_issuers[auction_id]. Signature is verified in the
//              transition body (ZK — private). Finalize only checks expiry + maps.
// ─────────────────────────────────────────────────────────────────────────────
//
// ── KNOWN OPERATIONAL RISK (admin) ──────────────────────────────────────────
// set_allowed_caller uses INITIAL_ADMIN constant, not a CPI to fairdrop_config.
// If the admin address needs to change, we will deploy fairdrop_gate_v2.
// Pre-mainnet: align with the multisig address set in fairdrop_config.
// ─────────────────────────────────────────────────────────────────────────────

program fairdrop_gate_v1.aleo {
    @admin(address="aleo128wz89c78ur4mx378056yd9q7kqmphr07k0kfsmnwvqnv7g9syyqkg263r")
    async constructor() {}

    // =========================================================================
    // Constants
    // =========================================================================

    const GATE_OPEN: u8       = 0u8;
    const GATE_MERKLE: u8     = 1u8;
    const GATE_CREDENTIAL: u8 = 2u8;

    // Aleo zero address (all-zero public key). Disallowed as a credential issuer.
    const ZERO_ADDRESS: address = aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc;

    // Initial protocol admin. Must match @admin address above.
    // If admin rotates, upgrade contract via @admin mechanism.
    const INITIAL_ADMIN: address = aleo128wz89c78ur4mx378056yd9q7kqmphr07k0kfsmnwvqnv7g9syyqkg263r;

    // =========================================================================
    // Structs
    // =========================================================================

    // Merkle leaf hash input. Leaf = BHP256::hash_to_field(LeafHash { addr }).
    struct LeafHash { addr: address }

    // Merkle node hash input. Node = BHP256::hash_to_field(MerkleNode { left, right }).
    struct MerkleNode { left: field, right: field }

    // verified mapping key input. Key = BHP256::hash_to_field(BidderKey { bidder, auction_id }).
    struct BidderKey { bidder: address, auction_id: field }

    // Credential message. Field order is canonical (G29) — off-chain signer must match.
    struct CredentialMessage {
        holder:     address,
        auction_id: field,
        expiry:     u32,
    }

    // =========================================================================
    // Mappings
    // =========================================================================

    // Auction programs authorised to call register_gate (D12).
    mapping allowed_callers: address => bool;

    // Prevents double-registration of the same auction_id.
    mapping gate_registered: field => bool;

    // Gate mode per auction_id. Read by verify_* and check_admission.
    mapping gate_modes: field => u8;

    // Merkle root per auction_id. Non-zero only when gate_mode == GATE_MERKLE.
    mapping allowlists: field => field;

    // Credential issuer per auction_id. Non-zero only when gate_mode == GATE_CREDENTIAL.
    mapping credential_issuers: field => address;

    // Admission status. Key = BHP256(BidderKey { bidder, auction_id }).
    // Set to true by verify_merkle or verify_credential. Read by check_admission.
    mapping verified: field => bool;

    // =========================================================================
    // 1. set_allowed_caller — admin only
    // =========================================================================
    // Registers or deregisters an auction program as a trusted caller.
    // Must be called for each auction contract (dutch, sealed, raise, ...) during
    // Phase 1 deployment before any create_auction can succeed.

    async transition set_allowed_caller(
        public program_addr: address,
        public allowed: bool,
    ) -> Future {
        return finalize_set_allowed_caller(self.signer, program_addr, allowed);
    }
    async function finalize_set_allowed_caller(
        caller: address,
        program_addr: address,
        allowed: bool,
    ) {
        assert_eq(caller, INITIAL_ADMIN);
        allowed_callers.set(program_addr, allowed);
    }

    // =========================================================================
    // 2. register_gate — CPI from auction create_auction only
    // =========================================================================
    // Records the gate configuration for a single auction.
    // Callable only by registered auction programs (allowed_callers).
    // Each auction_id can only be registered once (gate_registered guard).
    //
    // Callers pass root = 0field and issuer = ZERO_ADDRESS for GATE_OPEN.
    // Both are stored unconditionally; mode guards prevent their misuse.

    async transition register_gate(
        public auction_id: field,
        public gate_mode:  u8,
        public root:       field,
        public issuer:     address,
    ) -> Future {
        return finalize_register_gate(self.caller, auction_id, gate_mode, root, issuer);
    }
    async function finalize_register_gate(
        caller:     address,
        auction_id: field,
        gate_mode:  u8,
        root:       field,
        issuer:     address,
    ) {
        // Only registered auction programs may register gates
        assert(allowed_callers.get_or_use(caller, false));
        // Each auction_id can only be registered once — prevents root/issuer overwrites
        assert(!gate_registered.get_or_use(auction_id, false));
        // gate_mode must be 0, 1, or 2
        assert(gate_mode <= GATE_CREDENTIAL);
        // Merkle mode: root must be non-zero (a zero root is trivially exploitable)
        assert(gate_mode != GATE_MERKLE || root != 0field);
        // Credential mode: issuer must not be the zero address
        assert(gate_mode != GATE_CREDENTIAL || issuer != ZERO_ADDRESS);

        gate_registered.set(auction_id, true);
        gate_modes.set(auction_id, gate_mode);
        allowlists.set(auction_id, root);
        credential_issuers.set(auction_id, issuer);
    }

    // =========================================================================
    // 3. verify_merkle — bidder proves Merkle inclusion (gate_mode == 1)
    // =========================================================================
    // The leaf is derived from self.signer inside finalize — callers cannot forge it.
    // proof[i] is the sibling node at level i (leaf level = 0, root level = 19).
    // path_bits encodes left/right direction at each level (bit i: 0=left, 1=right).
    // On success: verified[BHP256(bidder, auction_id)] = true.

    async transition verify_merkle(
        public auction_id: field,
        public proof:      [field; 20],
        public path_bits:  u32,
    ) -> Future {
        return finalize_verify_merkle(self.signer, auction_id, proof, path_bits);
    }
    async function finalize_verify_merkle(
        bidder:     address,
        auction_id: field,
        proof:      [field; 20],
        path_bits:  u32,
    ) {
        // Reject calls targeting non-Merkle auctions (wrong mode)
        assert_eq(gate_modes.get_or_use(auction_id, GATE_OPEN), GATE_MERKLE);

        // Leaf computed from bidder — prevents forgery of the starting node
        let leaf: field = BHP256::hash_to_field(LeafHash { addr: bidder });

        // ── 20-level Merkle proof (unrolled — Leo has no loops) ───────────────
        // Bit i = 0: current node is left  → hash(current, sibling)
        // Bit i = 1: current node is right → hash(sibling, current)
        let bit0: bool  = (path_bits & 1u32) == 1u32;
        let node0: field = bit0 ?
            BHP256::hash_to_field(MerkleNode { left: proof[0],  right: leaf   }) :
            BHP256::hash_to_field(MerkleNode { left: leaf,      right: proof[0]  });

        let bit1: bool  = ((path_bits >> 1u32) & 1u32) == 1u32;
        let node1: field = bit1 ?
            BHP256::hash_to_field(MerkleNode { left: proof[1],  right: node0  }) :
            BHP256::hash_to_field(MerkleNode { left: node0,     right: proof[1]  });

        let bit2: bool  = ((path_bits >> 2u32) & 1u32) == 1u32;
        let node2: field = bit2 ?
            BHP256::hash_to_field(MerkleNode { left: proof[2],  right: node1  }) :
            BHP256::hash_to_field(MerkleNode { left: node1,     right: proof[2]  });

        let bit3: bool  = ((path_bits >> 3u32) & 1u32) == 1u32;
        let node3: field = bit3 ?
            BHP256::hash_to_field(MerkleNode { left: proof[3],  right: node2  }) :
            BHP256::hash_to_field(MerkleNode { left: node2,     right: proof[3]  });

        let bit4: bool  = ((path_bits >> 4u32) & 1u32) == 1u32;
        let node4: field = bit4 ?
            BHP256::hash_to_field(MerkleNode { left: proof[4],  right: node3  }) :
            BHP256::hash_to_field(MerkleNode { left: node3,     right: proof[4]  });

        let bit5: bool  = ((path_bits >> 5u32) & 1u32) == 1u32;
        let node5: field = bit5 ?
            BHP256::hash_to_field(MerkleNode { left: proof[5],  right: node4  }) :
            BHP256::hash_to_field(MerkleNode { left: node4,     right: proof[5]  });

        let bit6: bool  = ((path_bits >> 6u32) & 1u32) == 1u32;
        let node6: field = bit6 ?
            BHP256::hash_to_field(MerkleNode { left: proof[6],  right: node5  }) :
            BHP256::hash_to_field(MerkleNode { left: node5,     right: proof[6]  });

        let bit7: bool  = ((path_bits >> 7u32) & 1u32) == 1u32;
        let node7: field = bit7 ?
            BHP256::hash_to_field(MerkleNode { left: proof[7],  right: node6  }) :
            BHP256::hash_to_field(MerkleNode { left: node6,     right: proof[7]  });

        let bit8: bool  = ((path_bits >> 8u32) & 1u32) == 1u32;
        let node8: field = bit8 ?
            BHP256::hash_to_field(MerkleNode { left: proof[8],  right: node7  }) :
            BHP256::hash_to_field(MerkleNode { left: node7,     right: proof[8]  });

        let bit9: bool  = ((path_bits >> 9u32) & 1u32) == 1u32;
        let node9: field = bit9 ?
            BHP256::hash_to_field(MerkleNode { left: proof[9],  right: node8  }) :
            BHP256::hash_to_field(MerkleNode { left: node8,     right: proof[9]  });

        let bit10: bool  = ((path_bits >> 10u32) & 1u32) == 1u32;
        let node10: field = bit10 ?
            BHP256::hash_to_field(MerkleNode { left: proof[10], right: node9  }) :
            BHP256::hash_to_field(MerkleNode { left: node9,     right: proof[10] });

        let bit11: bool  = ((path_bits >> 11u32) & 1u32) == 1u32;
        let node11: field = bit11 ?
            BHP256::hash_to_field(MerkleNode { left: proof[11], right: node10 }) :
            BHP256::hash_to_field(MerkleNode { left: node10,    right: proof[11] });

        let bit12: bool  = ((path_bits >> 12u32) & 1u32) == 1u32;
        let node12: field = bit12 ?
            BHP256::hash_to_field(MerkleNode { left: proof[12], right: node11 }) :
            BHP256::hash_to_field(MerkleNode { left: node11,    right: proof[12] });

        let bit13: bool  = ((path_bits >> 13u32) & 1u32) == 1u32;
        let node13: field = bit13 ?
            BHP256::hash_to_field(MerkleNode { left: proof[13], right: node12 }) :
            BHP256::hash_to_field(MerkleNode { left: node12,    right: proof[13] });

        let bit14: bool  = ((path_bits >> 14u32) & 1u32) == 1u32;
        let node14: field = bit14 ?
            BHP256::hash_to_field(MerkleNode { left: proof[14], right: node13 }) :
            BHP256::hash_to_field(MerkleNode { left: node13,    right: proof[14] });

        let bit15: bool  = ((path_bits >> 15u32) & 1u32) == 1u32;
        let node15: field = bit15 ?
            BHP256::hash_to_field(MerkleNode { left: proof[15], right: node14 }) :
            BHP256::hash_to_field(MerkleNode { left: node14,    right: proof[15] });

        let bit16: bool  = ((path_bits >> 16u32) & 1u32) == 1u32;
        let node16: field = bit16 ?
            BHP256::hash_to_field(MerkleNode { left: proof[16], right: node15 }) :
            BHP256::hash_to_field(MerkleNode { left: node15,    right: proof[16] });

        let bit17: bool  = ((path_bits >> 17u32) & 1u32) == 1u32;
        let node17: field = bit17 ?
            BHP256::hash_to_field(MerkleNode { left: proof[17], right: node16 }) :
            BHP256::hash_to_field(MerkleNode { left: node16,    right: proof[17] });

        let bit18: bool  = ((path_bits >> 18u32) & 1u32) == 1u32;
        let node18: field = bit18 ?
            BHP256::hash_to_field(MerkleNode { left: proof[18], right: node17 }) :
            BHP256::hash_to_field(MerkleNode { left: node17,    right: proof[18] });

        let bit19: bool  = ((path_bits >> 19u32) & 1u32) == 1u32;
        let node19: field = bit19 ?
            BHP256::hash_to_field(MerkleNode { left: proof[19], right: node18 }) :
            BHP256::hash_to_field(MerkleNode { left: node18,    right: proof[19] });
        // ─────────────────────────────────────────────────────────────────────

        // Computed root must equal the stored Merkle root for this auction
        // Uses .get() (not .get_or_use) — fails hard if no root was registered
        assert_eq(node19, allowlists.get(auction_id));

        let key: field = BHP256::hash_to_field(BidderKey { bidder, auction_id });
        verified.set(key, true);
    }

    // =========================================================================
    // 4. verify_credential — bidder presents a signed ZK credential (gate_mode == 2)
    // =========================================================================
    // Signature verification is a ZK computation — done in the transition body (private).
    // The ZK proof attests that sig.verify(issuer, msg) == true.
    // Finalize only checks expiry (block.height) and validates the issuer against
    // the registered value — no signature reaches finalize (D11 pattern).
    //
    // issuer is a public parameter (D11): caller reads it from the backend/chain,
    // passes it in, and finalize confirms it matches credential_issuers[auction_id].
    // An attacker cannot spoof the issuer: the signature would fail verification
    // against a different issuer key in the transition body.

    async transition verify_credential(
        public auction_id: field,
        public issuer:     address,  // D11: supplied by caller, validated in finalize
        sig:               signature, // private — ZK-verified in transition body
        public expiry:     u32,
    ) -> Future {
        // Canonical credential message hash — field order matches G29 spec
        let msg: field = BHP256::hash_to_field(CredentialMessage {
            holder:     self.signer,
            auction_id: auction_id,
            expiry:     expiry,
        });
        // Verify signature in ZK (private computation). Proof generation fails
        // if the signature is invalid — so finalize can trust it was verified.
        assert(signature::verify(sig, issuer, msg));
        return finalize_verify_credential(self.signer, auction_id, issuer, expiry);
    }
    async function finalize_verify_credential(
        bidder:     address,
        auction_id: field,
        issuer:     address,
        expiry:     u32,
    ) {
        // Must be a credential-gated auction
        assert_eq(gate_modes.get_or_use(auction_id, GATE_OPEN), GATE_CREDENTIAL);
        // Caller-supplied issuer must match the registered issuer for this auction
        // Uses .get() — fails hard if no issuer was registered
        assert_eq(issuer, credential_issuers.get(auction_id));
        // Credential must not be expired at execution block
        assert(block.height < expiry);

        let key: field = BHP256::hash_to_field(BidderKey { bidder, auction_id });
        verified.set(key, true);
    }

    // =========================================================================
    // 5. check_admission — CPI from auction finalize_place_bid
    // =========================================================================
    // Auction contracts always call this — no conditional CPI needed (G15).
    // GATE_OPEN (mode 0): assertion always passes, no verify_* required.
    // GATE_MERKLE / GATE_CREDENTIAL (mode 1 or 2): verified[key] must be true.
    //
    // Unregistered auction_ids default to GATE_OPEN (get_or_use → 0u8).
    //
    // Usage in auction finalize_place_bid:
    //   let f_gate: Future = fairdrop_gate_v1.aleo/check_admission(auction_id);
    //   f_gate.await();

    async transition check_admission(public auction_id: field) -> Future {
        return finalize_check_admission(self.signer, auction_id);
    }
    async function finalize_check_admission(bidder: address, auction_id: field) {
        let mode: u8        = gate_modes.get_or_use(auction_id, GATE_OPEN);
        let key: field      = BHP256::hash_to_field(BidderKey { bidder, auction_id });
        let is_admitted: bool = verified.get_or_use(key, false);
        // Open: always passes. Gated: requires prior verify_merkle or verify_credential.
        assert(mode == GATE_OPEN || is_admitted);
    }
}
