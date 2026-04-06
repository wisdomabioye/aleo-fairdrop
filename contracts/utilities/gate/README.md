# fairdrop_gate_v2.aleo

Admission control for all Fairdrop auctions. Supports three gate modes:

| Mode | Value | Behaviour |
|---|---|---|
| Open | `0` | No restrictions — anyone can bid |
| Merkle | `1` | Bidder must submit a valid Merkle proof of inclusion against the root committed at auction creation |
| Credential | `2` | Bidder must submit a valid issuer-signed credential bound to their address and the auction |

`check_admission` is called via CPI inside every `place_bid_*` transition. For `Open` auctions it is a no-op. For `Merkle` and `Credential` auctions it asserts that `verified[BHP256(bidder, auction_id)] = true` — the bidder must have completed gate verification in a prior transaction.

Gate verification is a one-time step per bidder per auction. Once the `verified` mapping is set, all subsequent bids by that address proceed without re-verification.

---

## Gate modes

### Mode 0 — Open

No gate. `check_admission` passes unconditionally. `register_gate` stores `gate_mode = 0` with a zero Merkle root and zero-address issuer.

### Mode 1 — Merkle allowlist

Creator commits a BHP256 Merkle root at auction creation (via `register_gate`). The tree has depth 20 — up to 1,048,576 addresses.

Bidder calls `verify_merkle(siblings, path_bits, auction_id)`. The finalize block:
1. Recomputes the leaf: `BHP256(LeafHash { addr: self.signer })`.
2. Walks the 20-level path using `siblings` and `path_bits`.
3. Asserts the computed root matches `allowlists[auction_id]`.
4. Sets `verified[BHP256(bidder, auction_id)] = true`.

Leaf and node hash inputs:
```
LeafHash  { addr: address }
MerkleNode { left: field, right: field }
```
`path_bits`: bit `i = 0` → bidder is the LEFT child at level `i`.

### Mode 2 — Credential gate

Creator designates an issuer address at auction creation. The issuer runs a `credential-signer` service that decides who is allowed to bid.

Bidder calls `verify_credential(signature, expiry, auction_id)`. The finalize block:
1. Computes the credential message hash: `BHP256(CredentialMessage { holder: self.signer, auction_id, expiry })`.
2. Verifies `issuer.verify(sig, hash)` — the signature must be from the registered issuer.
3. Asserts `expiry >= block.height` — expired credentials are rejected.
4. Sets `verified[BHP256(bidder, auction_id)] = true`.

Credentials are bound to `(holder, auction_id, expiry)` — they cannot be transferred to another address or reused across auctions.

---

## Security model

- Bidder identity in `verified` is pseudonymous: `BHP256(bidder, auction_id)` — the bidder address is never stored in plain text.
- `register_gate` is gated by `allowed_callers[caller]`, enforced in finalize — only whitelisted auction programs (via CPI) can register gates.
- Governance: `set_allowed_caller` is controlled by `fairdrop_multisig_v1.aleo` (3-of-5 approval).

---

## Transitions

| Transition | Who |
|---|---|
| `register_gate` | Auction program (CPI from `create_auction`) |
| `verify_merkle` | Bidder (before first bid on a Merkle-gated auction) |
| `verify_credential` | Bidder (before first bid on a Credential-gated auction) |
| `check_admission` | Auction program (CPI from every `place_bid_*`) |
| `set_allowed_caller` | Multisig governance |
