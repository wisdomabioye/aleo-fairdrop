# Step 5 — Gate & Vesting

Optionally restrict who can bid and configure a post-claim vesting schedule.

---

## Gate mode

The gate controls who is allowed to place a bid. Choose one of three modes:

### Open (default)
Anyone with an Aleo wallet can bid. No restriction.

### Merkle — allowlist
Only addresses included in a Merkle tree can bid. You provide the list of allowed
addresses; the wizard computes the Merkle root on-chain. Bidders prove inclusion with a
Merkle proof generated from the allowlist.

**How to use:**
1. Select **Merkle — allowlist**.
2. Enter or paste the allowed wallet addresses into the builder.
3. The wizard computes and stores the Merkle root.

> The Merkle root is stored on-chain. The allowlist itself is not stored on-chain — keep
> a copy of the address list so bidders can generate proofs.

### Credential — issuer-signed credential
Only bidders with a credential signed by a specific issuer address can bid. The issuer
is a service (a `credential-signer` deployment) that verifies eligibility off-chain and
issues signed credentials.

**How to use:**
1. Select **Credential — issuer-signed credential**.
2. Enter the credential service URL. The wizard resolves the issuer's on-chain address.
3. The issuer address is recorded in the auction parameters.

Bidders visit your credential service URL to obtain a credential before they can bid.
See the [credential gate guide](../../credential-gate/README.md) for operator setup.

---

## Vesting

When vesting is enabled, won tokens are not released immediately at claim. Instead they
vest linearly over a block range after the auction ends.

| Field | Description |
|---|---|
| **Cliff (blocks after end)** | No tokens vest before this block offset. Set to 0 for no cliff. |
| **Vest end (blocks after end)** | 100% of tokens are vested by this block offset. Must be > cliff. |

**Example:** cliff = 1,000 blocks, vest end = 10,000 blocks. From the auction end block,
no tokens are available for the first 1,000 blocks. Then tokens release linearly. At
block offset 10,000 all tokens are fully vested.

### Vest program authorization

If you enable vesting, the vest program (`fairdrop_vest_v2.aleo`) needs mint permission
for your sale token. The wizard checks this automatically and prompts you to submit an
authorization transaction if it is missing.

> This authorization is a one-time transaction per token. If you have already authorized
> for a previous auction using the same token, no action is needed.

---

## Future advantage

Credential gating and vesting are the foundation for advanced launch mechanics:
- Credential + Quadratic auction = credibly neutral, one-person-one-bid distribution.
- Vesting = aligned incentives; token recipients cannot dump immediately at launch.
