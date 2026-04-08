# Plan: Credential Gate Expansion

## Summary

The credential gate (`fairdrop_gate_v2.aleo`, mode 2) is already fully built. The `credential-signer`
service already supports four strategies (`allowlist`, `webhook`, `token-gate`, `custom`). The gate
is a **general-purpose boolean gate** — any external condition (NFT ownership, ZK humanity proof,
KYC/AML check, bridge attestation) maps to a single yes/no credential. The infrastructure is done;
this plan covers documentation and example implementations that unlock each use case.

Two items from `TODO.md` are addressed here:
- **NFT-gated / ZK credential expansion** — example implementations for NFT gating, ZK humanity,
  and cross-chain attestations.
- **Compliance mode (ZK KYC)** — creator points `WEBHOOK_URL` at a KYC provider endpoint. Mostly
  a business/integration story, not an engineering one. The gate is already the infrastructure.

No contract changes. No new service code. Deliverables are docs + example implementations.

---

## Scope

| Layer | Touch |
|---|---|
| Contract | None |
| Service | No new code — documentation + example check strategies |
| Frontend | None |
| Docs | New `docs/guides/credential-gate/` directory |

---

## Deliverables

### 1. Developer guide: `docs/guides/credential-gate/README.md`

Top-level overview:
- What the gate does (mode 2 = issuer-signed credential, bound to holder + auction_id + expiry).
- When to use it vs Merkle gate (mode 1).
- Two-transaction flow: `verify_credential` → `place_bid_*`.
- Credential lifetime: `expiry` field, checked at finalize.
- Deployment checklist: spin up `credential-signer`, set `ISSUER_PRIVATE_KEY`, set strategy.

### 2. Example: NFT-gated round

`docs/guides/credential-gate/examples/nft-gate/`

Webhook strategy that checks whether the bidder holds a specific NFT on Aleo (via token registry).

```ts
// check.ts — drop next to .env, set CHECK_STRATEGY=custom
export default async function check(address: string, auctionId: string): Promise<boolean> {
  const client = getAleoClient(process.env.ALEO_RPC_URL!);
  const tokenId = process.env.REQUIRED_TOKEN_ID!;
  // Check public balance via token_registry mapping
  const key = computeTokenOwnerKey(address, tokenId);
  const raw = await client.getMappingValue('token_registry.aleo', 'authorized_balances', key);
  const balance = parseU128(raw ?? '0u128');
  return balance > 0n;
}
```

Includes: `.env.example`, `README.md`, setup instructions, expected `.env` values.

### 3. Example: Webhook delegation

`docs/guides/credential-gate/examples/webhook/`

Demonstrates delegating to an external HTTP service — useful for:
- KYC provider (returns `{ allowed: bool }` after identity check).
- Discord role verification.
- Off-chain allowlist managed by a backend.

Includes:
- Sample webhook server (Express, ~30 lines) that checks a Postgres allowlist.
- cURL test snippet.
- Notes on securing the webhook (shared secret header, HTTPS required).

### 4. Example: Compliance mode (ZK KYC / AML)

`docs/guides/credential-gate/examples/compliance-kyc/`

Creator enables compliance mode by pointing `WEBHOOK_URL` at a KYC provider endpoint. The
credential-signer acts as the bridge between the KYC provider and the on-chain gate — the
provider never needs to know anything about Aleo.

Flow:
1. Bidder requests a credential from the creator's `credential-signer` instance.
2. Credential-signer (webhook strategy) POSTs `{ address, auctionId }` to the KYC provider.
3. KYC provider performs identity/jurisdiction/accreditation check and returns `{ allowed: bool }`.
4. If allowed: credential-signer issues a time-bounded Fairdrop credential.
5. Bidder submits credential via `verify_credential` and proceeds to bid.

The bidder's identity is never revealed on-chain — only that they hold a valid credential.
This enables institutional-grade token sales (accredited investor rounds, jurisdiction-restricted
raises) that privacy-agnostic launchpads cannot serve.

Includes:
- `.env.example` with `CHECK_STRATEGY=webhook`, `WEBHOOK_URL`, `WEBHOOK_SECRET`.
- Minimal KYC provider stub (Express, ~40 lines) that simulates jurisdiction checks.
- Integration notes for real KYC providers (Persona, Synaps, Fractal ID — all support webhook
  patterns returning `{ allowed: bool }`).
- Reminder: credential expiry should be short (e.g. 720 blocks ≈ ~1h) for regulated sales
  to ensure the check remains fresh.

### 5. Example: ZK humanity proof (conceptual)

`docs/guides/credential-gate/examples/zk-humanity/`

Documents how a ZK humanity proof provider (e.g. WorldID, Reclaim Protocol) can be integrated:
- Bidder generates a ZK proof of unique humanity off-chain.
- Bidder POSTs the proof to the credential-signer webhook.
- Webhook verifies the ZK proof locally (no on-chain verification needed — credential-signer
  is the trust boundary).
- If valid: credential-signer issues a Fairdrop credential bound to the bidder's address.

This is a documentation-only deliverable — no actual ZK proof library integrated. The point is
to show the pattern is possible and that the gate is a general boolean interface.

### 6. Webhook security guide

`docs/guides/credential-gate/webhook-security.md`

- Always validate bidder wallet signature before running business logic (already done by
  credential-signer layer 1 — but webhook implementers should understand this).
- Shared secret header for webhook-to-signer authentication.
- Rate limiting: credential-signer already rate-limits at 5 req/60s; document this.
- HTTPS: never run webhook over plain HTTP.
- Expiry: set credential `EXPIRY_BLOCKS` based on expected bid window (e.g. 1440 = ~6h).

### 7. IPFS metadata `credentialUrl` convention

`docs/guides/credential-gate/credential-url.md`

Documents the `credentialUrl` field in auction metadata:
- Stored in IPFS JSON at auction creation.
- Hash committed on-chain in `AuctionConfig.metadata_hash`.
- Frontend reads `auction.metadata.credentialUrl` and auto-requests the credential.
- Credential-signer operators: set the public URL of their deployed service.
- Self-hosted vs managed: link to credential-signer deployment section in service README.

---

## Open decisions

1. **Managed credential-signer hosting**: could offer a managed tier where Fairdrop operates
   the credential-signer for simple strategies (allowlist, token-gate). Creators upload a CSV.
   This is a product decision, not an engineering one — documented as a future option in `credential-url.md`.
2. ~~**Credential caching**~~ — **resolved**: always fetch, no `sessionStorage` caching. The current
   `useCredentialRequest` hook already does not cache. This is the correct behaviour.
3. **Cross-chain NFT gating**: the token-gate example only checks Aleo balances. Cross-chain
   gating (Ethereum NFT, Solana SPL) requires a bridge attestation or a trusted oracle. Out of
   scope — noted as a future direction in the ZK humanity guide.

---

## Steps

1. Create `docs/guides/credential-gate/README.md`.
2. Write NFT-gate example with `check.ts`, `.env.example`, `README.md`.
3. Write webhook delegation example with sample Express server + cURL test.
4. Write compliance mode (ZK KYC) example with KYC provider stub + integration notes.
5. Write ZK humanity proof conceptual guide.
6. Write webhook security guide.
7. Write `credential-url.md` convention doc.
8. Verify all code snippets are consistent with current SDK API (`computeTokenOwnerKey`,
   `parseU128`, `getAleoClient` — grep to confirm names are correct before publishing).
