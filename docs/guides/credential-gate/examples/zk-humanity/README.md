# Example: ZK Humanity Proof (Sybil Resistance)

Require bidders to prove unique humanity — one person, one credential — using a ZK proof provider (e.g. WorldID, Reclaim Protocol, Holonym).

This is a **conceptual guide**. No ZK proof library is integrated. The credential-signer infrastructure supports this pattern today — what changes is what the webhook verifies.

---

## The pattern

The credential gate is a boolean interface. Any condition that can be reduced to yes/no can gate a bid. ZK humanity proofs fit this interface exactly:

```
Bidder                  credential-signer                ZK proof verifier
  │                          │                                 │
  │  1. Generate ZK proof off-chain (wallet app / provider)   │
  │                          │                                 │
  │  POST /credentials/issue │                                 │
  │  { auctionId,            │                                 │
  │    holderAddress,        │                                 │
  │    walletSignature,      │                                 │
  │    zkProof }             │                                 │
  │ ─────────────────────>   │                                 │
  │                          │ Layer 1: verify wallet sig      │
  │                          │ Layer 2 (webhook):              │
  │                          │ POST { address, zkProof } ─────>│
  │                          │                                 │ verify proof
  │                          │ <─ { allowed: true/false } ─────│
  │                          │                                 │
  │ <─ { signature, expiry } │                                 │
```

The key point: **the ZK proof is verified off-chain** in your webhook. The on-chain gate only sees the credential. No on-chain ZK verifier is needed.

---

## Adapting the credential-signer

The credential-signer's `POST /credentials/issue` endpoint accepts a fixed body:
```ts
{ auctionId: string, holderAddress: string, walletSignature: string }
```

To pass a ZK proof, you have two options:

**Option A** — Verify the proof in a webhook you control (recommended). The credential-signer webhook payload is `{ address, auctionId }`. Your webhook fetches the proof separately (e.g. from a proof registry your app maintains, keyed by address).

**Option B** — Use the `custom` strategy. Write a check module that calls the ZK proof provider's verification API directly, using the address to look up the associated proof.

In both cases, the check function returns `true` (humanity proven) or `false` (no valid proof).

---

## Example: WorldID webhook

WorldID issues a ZK proof that a person has a unique Orb-verified identity. After the bidder completes WorldID verification in your app, you store their nullifier hash mapped to their Aleo address.

```ts
// webhook: POST /gate/check
// { address: string, auctionId: string }

async function check(address: string): Promise<boolean> {
  // Look up whether this address has a verified WorldID nullifier in your DB
  const row = await db.query(
    'SELECT 1 FROM worldid_verifications WHERE aleo_address = $1 AND verified = true',
    [address],
  );
  return row.rows.length > 0;
}
```

WorldID verification happens in your app (before the auction). The webhook only checks whether it happened.

---

## Example: Reclaim Protocol webhook

Reclaim Protocol lets users prove claims from web2 accounts (GitHub, X, LinkedIn) via HTTPS proofs. The webhook verifies the proof using Reclaim's SDK:

```ts
import { ReclaimClient } from '@reclaimprotocol/zk-fetch';

async function check(address: string): Promise<boolean> {
  // Retrieve proof submitted by the user in your onboarding flow
  const proof = await db.getProofForAddress(address);
  if (!proof) return false;

  const client = new ReclaimClient(process.env.RECLAIM_APP_ID!);
  const isValid = await client.verifyProof(proof);
  return isValid;
}
```

---

## What does NOT change

- The `fairdrop_gate_v2.aleo` contract — no changes
- The credential-signer service — no changes, use `CHECK_STRATEGY=webhook` or `custom`
- The on-chain verification flow — `verify_credential` → `place_bid_*` is unchanged

---

## One-person-one-credential enforcement

The credential gate marks `verified[BHP256(bidder, auctionId)] = true` on-chain. A single address can only verify once per auction (calling `verify_credential` again with the same credential is a no-op once verified).

However, a single person can create multiple wallets. ZK humanity proof prevents this at the human level — the nullifier/proof is unique per person, not per wallet. Your webhook or onboarding flow must enforce the one-address-per-person binding.

---

## Future direction: cross-chain attestations

The webhook pattern also supports cross-chain NFT ownership or attestations via bridge services. An EVM bridge can attest that address X on Ethereum also owns NFT Y, and your webhook calls the bridge's API. This is out of scope for the current gate implementation — note it as a direction for future custom check modules.
