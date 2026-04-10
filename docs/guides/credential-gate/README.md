# Credential Gate Guide

`fairdrop_gate_v3.aleo` supports three gate modes. This guide covers **mode 2 — credential gate**.

| Mode | Value | What it means |
|---|---|---|
| Open | 0 | Anyone can bid |
| Merkle | 1 | Bidder proves Merkle tree inclusion |
| Credential | 2 | Bidder holds a valid issuer-signed credential |

---

## How the credential gate works

The credential gate is a **general-purpose boolean gate**. Any external condition — token ownership, KYC check, Discord role, ZK proof — maps to a single yes/no credential. The gate does not know or care what logic produced the credential; it only verifies the issuer signature and expiry on-chain.

### Two-transaction bid flow

```
1. verify_credential(auctionId, issuer, sig, expiry)
   → on-chain: checks sig, checks expiry < current block, marks bidder as verified

2. place_bid_*(auctionId, ...)
   → fairdrop_gate_v3.aleo::check_admission(auctionId)
   → requires verified[BHP256(bidder, auctionId)] = true
```

`verify_credential` is submitted **before** placing a bid. Once verified, the bidder can bid any number of times without re-verifying (the `verified` mapping is persistent).

### Credential binding

Each credential is cryptographically bound to a specific `(holder, auction_id, expiry)` tuple:

```
credential_msg = BHP256::hash_to_field(CredentialMessage {
  holder:     <bidder address>,
  auction_id: <auction field>,
  expiry:     <block height u32>,
})
```

The issuer signs `credential_msg` with their Aleo private key. The gate verifies the signature in ZK (`signature::verify` runs inside the transition body). A credential issued for one address cannot be used by another.

### What `verify_credential` checks (in finalize)

1. `block.height < expiry` — credential is not expired
2. `credential_issuers[auctionId] == issuer` — the signing key matches the registered issuer
3. Marks `verified[BHP256(bidder, auctionId)] = true`

---

## The credential-signer service

You operate a small HTTP service (`services/credential-signer`) that issues credentials. Fairdrop collects credentials from your service and submits them on-chain — the platform never touches your private key.

```
Bidder                  credential-signer (yours)
  │                              │
  │── POST /credentials/issue ──>│
  │   { auctionId,               │
  │     holderAddress,           │
  │     walletSignature }        │
  │                              │ Layer 1: verify wallet sig
  │                              │ Layer 2: run your check fn
  │                              │ Sign credential
  │<── { signature,              │
  │      expiry,                 │
  │      issuer }                │
  │                              │
  │  submit verify_credential ──────────────> fairdrop_gate_v3.aleo
```

**Layer 1 — wallet ownership** (always enforced): the bidder signs the challenge string
`fairdrop-credential-request:<auctionId>:<holderAddress>` with their wallet. This prevents anyone from requesting a credential for an address they do not own.

**Layer 2 — your access control**: the strategy you configure (`allowlist`, `webhook`, `token-gate`, or `custom`) decides whether the verified address is allowed.

See [`services/credential-signer/README.md`](../../../services/credential-signer/README.md) for full setup and deployment instructions.

---

## Credential lifetime

`CREDENTIAL_TTL_BLOCKS` (default: 5760 ≈ 24 h at ~15 s/block) controls how long a credential is valid after issuance.

The expiry is computed as `current_block + CREDENTIAL_TTL_BLOCKS` at issuance time. The gate rejects credentials where `block.height >= expiry`.

Set a shorter TTL for regulated sales where the access check should remain fresh:
```env
CREDENTIAL_TTL_BLOCKS=720   # ~3 h
```

---

## When to use credential gate vs Merkle gate

| Credential gate | Merkle gate |
|---|---|
| Access list changes frequently | Access list is fixed at auction creation |
| Access decision requires external data (KYC, token balance, API call) | Access list is known ahead of time |
| Creator wants to remain in control of access after launch | Creator wants a trustless, on-chain-verifiable allowlist |
| Any yes/no condition an HTTP service can evaluate | Up to 2^20 addresses, no service needed |

---

## Deployment checklist

1. Deploy `credential-signer` and set `ISSUER_PRIVATE_KEY`, `ALEO_RPC_URL`, `CHECK_STRATEGY`
2. Call `GET /public-key` — copy the returned address
3. In the Fairdrop wizard: select **Credential gate**, paste the issuer address and service URL
4. The service URL is stored in auction IPFS metadata (`credentialUrl`); the frontend auto-fetches credentials for bidders
5. Make the service publicly reachable over HTTPS — bidder browsers call it directly

---

## Examples

| Example | Strategy | Use case |
|---|---|---|
| [NFT gate](examples/nft-gate/README.md) | `custom` | Require on-chain token ownership |
| [Webhook delegation](examples/webhook/README.md) | `webhook` | Delegate to your own HTTP endpoint |
| [Compliance / ZK KYC](examples/compliance-kyc/README.md) | `webhook` | KYC/AML provider integration |
| [ZK humanity proof](examples/zk-humanity/README.md) | `webhook` | Sybil resistance via proof verification |

---

## Further reading

- [Webhook security](webhook-security.md) — securing webhook endpoints
- [credentialUrl convention](credential-url.md) — how the frontend discovers your service URL
- [credential-signer README](../../../services/credential-signer/README.md) — full service documentation
