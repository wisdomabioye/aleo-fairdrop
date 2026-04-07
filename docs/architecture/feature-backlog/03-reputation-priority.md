# Reputation-gated Priority Window — NOT IMPLEMENTING

## Decision

The original plan is dropped. The existing toolset already covers every engagement
and reward scenario this feature targeted:

- **Credential-signer** with rotating allowlists — creator starts with a small set and
  expands access as the auction progresses, with no contract changes.
- **Multi-phase auctions** — different auctions with different gate modes serve as explicit
  tiers (early community round → open round).
- **gate_mode 1 + 2** — Merkle allowlist and credential gating already provide
  creator-controlled access stratification.

Adding `priority_window_blocks` on top is redundant complexity for a problem creators
do not actually have.

The plan also had a fundamental architecture flaw: it tried to use `reputation[bidder]`
(a **creator** stats mapping) as a bidder participation signal. There is no public
bidder participation aggregate in the protocol, and building one would deanonymize
bidders — directly contradicting the `BHP256(bidder, auction_id)` privacy model in
`fairdrop_proof_v2.aleo`.

---

## Future exploration: `ParticipationReceipt` as a ZK reputation primitive

`ParticipationReceipt` records are private to each bidder and carry `auction_id` and
`commitment_hash`. The long-term direction worth exploring:

A bidder accumulates N receipts and constructs an **off-chain ZK threshold proof**:
"I hold at least N valid `ParticipationReceipt` records issued by registered auction
programs" — without revealing which auctions, how many exactly, or their identity.

The contract (or a new `fairdrop_reputation_v1.aleo`) verifies the proof and issues a
**reputation credential** the bidder can use across any gated auction.

This would be a genuine privacy-preserving on-chain reputation primitive. It requires:
- Leo / SnarkVM support for variable-input record proofs or an off-chain aggregation circuit
- A verifier contract that accepts and validates the proof
- Integration with the existing credential flow

Not actionable today. Revisit when Leo's ZK tooling supports threshold record proofs.
