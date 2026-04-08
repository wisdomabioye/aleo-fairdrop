# Example: Compliance Mode (KYC / AML)

Enable institutional-grade token sales — accredited investor rounds, jurisdiction-restricted raises — by pointing the credential-signer's webhook at a KYC provider.

The bidder's identity is never revealed on-chain. Only the credential exists there. The gate only proves that the bidder holds a valid issuer-signed credential; the identity check is entirely off-chain.

---

## How it works

```
Bidder                credential-signer (yours)         KYC provider
  │                          │                               │
  │ POST /credentials/issue  │                               │
  │ ─────────────────────>   │                               │
  │                          │  Layer 1: verify wallet sig   │
  │                          │  Layer 2:                     │
  │                          │  POST { address, auctionId } ─>
  │                          │                               │ identity /
  │                          │                               │ jurisdiction check
  │                          │  <─ { allowed: true/false } ──│
  │                          │                               │
  │ <─ { signature,          │                               │
  │      expiry, issuer }    │                               │
  │                          │                               │
  │ submit verify_credential ──────────────────────────────────> on-chain
```

The KYC provider never needs to know anything about Aleo. It receives an address string and returns `{ allowed: boolean }`. The credential-signer handles everything Aleo-specific.

---

## Setup

**Step 1 — configure the credential-signer**

```env
CHECK_STRATEGY=webhook
WEBHOOK_URL=https://your-kyc-bridge.example.com/gate/check
CREDENTIAL_TTL_BLOCKS=720   # ~3 h — keep short for regulated sales
```

A short TTL ensures the KYC check remains fresh. If a bidder's approval is revoked mid-auction, they must re-request; since re-verification calls the KYC provider again, revoked addresses cannot obtain a new credential.

**Step 2 — deploy the KYC bridge**

The bridge translates between the credential-signer webhook format and your KYC provider's API.

See `kyc-stub.ts` in this directory for a minimal reference implementation.

---

## kyc-stub.ts

Simulates a KYC provider bridge. Replace `isKycApproved` with your actual provider's API call.

```ts
import express from 'express';

const app = express();
app.use(express.json());

/**
 * Simulated KYC check — replace with real provider call.
 *
 * Real providers (Persona, Synaps, Fractal ID) expose REST APIs where you pass
 * an identifier and receive an approval status. The identifier here is the Aleo
 * address — you must have previously associated it with a verified identity in
 * your provider's system (e.g. via a KYC onboarding flow on your app).
 */
async function isKycApproved(address: string): Promise<boolean> {
  // Example: GET https://api.kyc-provider.com/v1/status?address=aleo1abc...
  const res = await fetch(
    `${process.env.KYC_PROVIDER_URL}/v1/status?address=${address}`,
    { headers: { Authorization: `Bearer ${process.env.KYC_API_KEY}` } },
  );
  if (!res.ok) return false;
  const data = await res.json() as { status: string; jurisdiction_ok: boolean };
  return data.status === 'approved' && data.jurisdiction_ok;
}

app.post('/gate/check', async (req, res) => {
  const { address } = req.body as { address: string; auctionId: string };

  if (!address) {
    res.status(400).json({ error: 'missing address' });
    return;
  }

  try {
    const allowed = await isKycApproved(address);
    res.json({ allowed });
  } catch (err) {
    console.error('[kyc-bridge] provider error', err);
    res.status(500).json({ error: 'KYC provider unavailable' });
  }
});

app.listen(Number(process.env.PORT ?? 3003), () => {
  console.log('[kyc-bridge] ready');
});
```

---

## .env.example (credential-signer)

```env
ISSUER_PRIVATE_KEY=APrivateKey1zkp...
ALEO_RPC_URL=https://api.explorer.provable.com/v1
CHECK_STRATEGY=webhook
WEBHOOK_URL=https://your-kyc-bridge.example.com/gate/check

# Short TTL for regulated sales — bidder must re-verify after expiry
CREDENTIAL_TTL_BLOCKS=720

# CORS_ORIGIN=https://fairdrop.xyz
```

---

## Real KYC provider integration notes

The bridge pattern works with any provider that exposes a REST API returning an approval status.

**Persona** — check inquiry status via `GET /api/v1/inquiries/{inquiry-id}`. You must store a mapping of `aleo_address → inquiry_id` from your onboarding flow.

**Synaps** — `GET /v1/session/{session-id}/details` returns `{ status: "APPROVED" | ... }`. Map `aleo_address → session_id`.

**Fractal ID** — OAuth-based. After the bidder completes KYC, your backend receives a `user_id`. Store `aleo_address → user_id`, then call `GET /users/{user_id}` to check credential status.

In all cases: the Aleo address is not a KYC identifier by itself. Your application must have already associated the address with a verified identity during a prior onboarding step (e.g. the bidder connects their wallet and completes KYC on your app before the auction opens).

---

## Credential TTL and re-verification

For regulated sales, set `CREDENTIAL_TTL_BLOCKS` to a value appropriate for the auction window:

| Auction type | Suggested TTL | Rationale |
|---|---|---|
| Short auction (≤ 6 h) | 720 blocks | Covers the full window, check stays fresh |
| Multi-day auction | 1440 blocks | ~6 h per credential, bidder re-verifies daily |
| Accredited investor only | 5760 blocks | ~24 h, matches typical KYC session validity |

Re-verification triggers a new KYC provider call via the webhook — revoked addresses cannot obtain a new credential.
