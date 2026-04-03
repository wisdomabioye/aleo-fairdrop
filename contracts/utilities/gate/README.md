# fairdrop_gate_v2.aleo

Admission control for auctions. Supports three gate modes:

| Mode | Behaviour |
|---|---|
| `0` — Open | No restrictions; anyone can bid |
| `1` — Allowlist | Bidder must hold a valid `GateCredential` record issued by `credential-signer` |
| `2` — Merkle | Bidder provides a Merkle proof of inclusion against a root committed at auction creation |

`check_admission` is called via CPI inside `place_bid_*` transitions. It returns a `Future` that asserts the credential or proof is valid in finalize.

Credentials are single-use records — spending them on-chain prevents replay. The `credential-signer` service issues them off-chain in response to verified identity checks.
