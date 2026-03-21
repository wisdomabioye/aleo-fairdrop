# fairdrop_proof.aleo

Participation receipt and reputation tracking. Issues a `ParticipationReceipt` record to each bidder after a successful bid. Maintains a public reputation score per address (auction count, total committed, claim/void history).

Used as a soft Sybil signal — auction creators can require a minimum reputation threshold via gate mode. Does not enforce access directly; it's readable evidence for off-chain gates and future on-chain checks.
