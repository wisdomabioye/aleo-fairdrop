# services/credential-signer

Issues gate credentials to users who pass an identity check. Holds the issuer Aleo private key — isolated into its own process to minimize the attack surface.

---

## How credentials work on-chain

The gate contract (`fairdrop_gate_v2.aleo`) has a `CREDENTIAL` gate mode (mode 2). When a creator creates an auction with this mode they register an **issuer address** on-chain. Before placing a bid, each bidder must call `verify_credential` on-chain:

```
verify_credential(auction_id, issuer, sig: signature, expiry: u32)
```

The contract verifies (in ZK, in the transition body):

```
msg  = BHP256(CredentialMessage { holder: self.signer, auction_id, expiry })
sig.verify(issuer, msg)  // Aleo signature over the msg hash
```

On success it sets `verified[BHP256(bidder, auction_id)] = true`. Every `place_bid_*` calls `check_admission(auction_id)` via CPI, which asserts that flag is set.

The credential-signer is the off-chain service that **computes `msg` and signs it** with the private key corresponding to the issuer address.

---

## End-to-end flow

```
Creator setup
─────────────
1. Creator deploys (or reuses) this service.
2. Creator fetches GET /public-key → gets the issuer Aleo address.
3. Creator creates auction: sets gate_mode=2, issuer=<that address>.
   → On-chain: credential_issuers[auction_id] = issuer.

Bidder credential request
──────────────────────────
4. Bidder visits the gate page for the auction.
5. Bidder clicks "Request Credential" → POST /credentials/issue
   with { auctionId, holderAddress, identityProof }.
6. Service verifies the identityProof (see Identity Verification below).
7. Service computes:
     expiry = currentBlock + CREDENTIAL_TTL_BLOCKS
     msg    = BHP256(CredentialMessage { holder, auction_id, expiry })
     sig    = issuerPrivateKey.sign(msg)
8. Service returns { signature, expiry, issuer }.

On-chain submission
────────────────────
9. Bidder calls verify_credential(auctionId, issuer, sig, expiry).
   → Contract verifies sig in ZK; sets verified[bidderKey] = true.
10. Bidder can now call place_bid_*.
```

---

## Implementation plan

### Step 1 — SDK: `computeCredentialMsgHash`

**File:** `packages/sdk/src/hash/keys.ts`

Add a helper that mirrors the on-chain `BHP256::hash_to_field(CredentialMessage { holder, auction_id, expiry })` computation. The service and frontend both use it so the message is always byte-for-byte identical to the contract.

```ts
export function computeCredentialMsgHash(
  holder:    string,  // aleo1... address
  auctionId: string,  // field
  expiry:    number,  // u32
): string             // field hex
```

Export from `@fairdrop/sdk/hash`.

---

### Step 2 — Service skeleton

Uses Hono + `@hono/node-server` — same stack as the API service. No database dependency; stateless per request.

**Directory:** `services/credential-signer/`

```
src/
  index.ts          — entry point: serve(app.fetch, port)
  app.ts            — createApp(): registers middleware + routes
  env.ts            — requireEnv / requireInt helpers, exported env object
  routes/
    credentials.ts  — POST /credentials/issue
    keys.ts         — GET /public-key
  signing.ts        — message hash computation + Aleo signature
  middleware/
    cors.ts         — hono/cors, driven by env.corsOrigin
    error.ts        — HTTPException handler, same shape as api service
  identity/
    index.ts        — strategy dispatcher (reads env.identityStrategy)
    signed-message.ts  — default: wallet-signed address proof
    allowlist.ts       — optional: static address list
```

**`env.ts`** — validate required env vars at startup, crash loudly if missing:
```
ISSUER_PRIVATE_KEY     Aleo private key — never log, never write to disk
PORT                   Default 3002
CREDENTIAL_TTL_BLOCKS  Blocks until expiry (e.g. 5760 ≈ 24 hr at 15 s/block)
IDENTITY_STRATEGY      signed-message | allowlist | open
CORS_ORIGIN            Allowed origins, default '*'
ALEO_RPC_URL           For current block height + on-chain gate config check
```

**`index.ts`** — mirrors api service entry point:
```ts
import 'dotenv/config';
import { serve }     from '@hono/node-server';
import { env }       from './env.js';
import { createApp } from './app.js';

const app = createApp();
console.log(`[credential-signer] starting on port ${env.port}`);
serve({ fetch: app.fetch, port: env.port });
```

**`app.ts`**:
```ts
import { Hono }           from 'hono';
import { corsMiddleware }  from './middleware/cors.js';
import { errorHandler }   from './middleware/error.js';
import { credentialsRouter } from './routes/credentials.js';
import { keysRouter }        from './routes/keys.js';

export function createApp() {
  const app = new Hono();

  app.use('*', corsMiddleware());
  app.onError(errorHandler);

  app.get('/health', (c) => c.json({ status: 'ok' }));
  app.route('/credentials', credentialsRouter);
  app.route('/public-key',  keysRouter);

  return app;
}
```

**`package.json`**:
```json
{
  "name": "@fairdrop/credential-signer",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev":        "tsx watch src/index.ts",
    "start":      "tsx src/index.ts",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "@fairdrop/sdk":       "workspace:*",
    "@fairdrop/config":    "workspace:*",
    "@hono/node-server":   "^1.13.8",
    "@provablehq/sdk":     "*",
    "dotenv":              "^17.3.1",
    "hono":                "^4.7.10"
  },
  "devDependencies": {
    "@types/node": "^25.5.0",
    "tsx":         "^4.19.3",
    "typescript":  "~5.9.3"
  }
}
```

---

### Step 3 — Signing module

**File:** `src/signing.ts`

Private key is loaded **once at module init** from `env`. Never passed around or re-read per request.

```ts
import { Signature, PrivateKey } from '@provablehq/sdk';
import { computeCredentialMsgHash } from '@fairdrop/sdk/hash';
import { env } from './env.js';

const privateKey = PrivateKey.from_string(env.issuerPrivateKey);
export const issuerAddress = privateKey.to_address().to_string();

export function issueCredential(
  holderAddress: string,
  auctionId:     string,
  expiry:        number,
): { signature: string; expiry: number; issuer: string } {
  const msgHash = computeCredentialMsgHash(holderAddress, auctionId, expiry);
  const sig     = Signature.sign(privateKey, msgHash);
  return { signature: sig.to_string(), expiry, issuer: issuerAddress };
}
```

`env.issuerAddress` in `env.ts` is derived from `issuerPrivateKey` at startup (call `PrivateKey.from_string(key).to_address().to_string()`), so `GET /public-key` has no runtime dependency on the signing module.

> `Signature.sign` must hash inputs identically to the Leo `sig.verify` path. Validate end-to-end with a testnet transaction before mainnet.

---

### Step 4 — Identity verification strategies

**File:** `src/identity/index.ts`

The strategy is selected by `IDENTITY_STRATEGY` env var. All strategies receive the same inputs and return `Promise<void>` (throw on rejection).

**`signed-message` (default)**

The holder proves they own `holderAddress` by signing a deterministic challenge with their Aleo wallet. The service verifies the signature before issuing a credential.

```
Request body:
  { auctionId, holderAddress, walletSignature, challenge }

Service:
  challengeMsg = `fairdrop-credential-request:${auctionId}:${holderAddress}`
  verify walletSignature over challengeMsg using holderAddress
```

Frontend sends two steps:
1. Ask wallet to sign the challenge string.
2. Include the wallet signature in `POST /credentials/issue`.

**`allowlist`**

Service loads a static or API-fetched list of allowed addresses. No wallet signature required.

```
ALLOWLIST_SOURCE   file://path/to/list.json | https://...
```

**`open`**

No identity check — any address can get a credential. Useful for testing or when the gate is purely for on-chain replay protection.

---

### Step 5 — `POST /credentials/issue` route

**File:** `src/routes/credentials.ts`

```
POST /credentials/issue
Content-Type: application/json

{
  "auctionId":       "123...field",
  "holderAddress":   "aleo1...",
  "walletSignature": "sign1...",   // required for signed-message strategy
  "challenge":       "fairdrop-credential-request:..."
}

200 { "signature": "sign1...", "expiry": 1234567, "issuer": "aleo1..." }
400 { "error": "..." }   — validation failure
403 { "error": "..." }   — identity check failed
429                      — rate limit (1 credential per address per auction per window)
```

```ts
import { Hono }          from 'hono';
import { HTTPException }  from 'hono/http-exception';
import { isValidField }   from '@fairdrop/sdk/parse';
import { fetchGateConfig } from '@fairdrop/sdk/chain';
import { getAleoClient }  from '@fairdrop/sdk/client';
import { env }            from '../env.js';
import { verifyIdentity } from '../identity/index.js';
import { issueCredential } from '../signing.js';

export const credentialsRouter = new Hono();

credentialsRouter.post('/issue', async (c) => {
  const body = await c.req.json();
  const { auctionId, holderAddress, walletSignature, challenge } = body;

  if (!isValidField(auctionId) || !holderAddress?.startsWith('aleo1')) {
    throw new HTTPException(400, { message: 'Invalid auctionId or holderAddress' });
  }

  // Confirm the auction uses credential gate and this service is the issuer.
  const gate = await fetchGateConfig(auctionId);
  if (!gate || gate.gate_mode !== 2) {
    throw new HTTPException(400, { message: 'Auction is not credential-gated' });
  }
  if (gate.issuer !== env.issuerAddress) {
    throw new HTTPException(400, { message: 'This service is not the issuer for this auction' });
  }

  // Identity check (strategy-dependent).
  await verifyIdentity({ holderAddress, auctionId, walletSignature, challenge });

  const currentBlock = await getAleoClient().getLatestHeight();
  const expiry       = currentBlock + env.credentialTtlBlocks;
  const credential   = issueCredential(holderAddress, auctionId, expiry);

  return c.json(credential);
});
```

---

### Step 6 — `GET /public-key` route

**File:** `src/routes/keys.ts`

```ts
import { Hono } from 'hono';
import { env }  from '../env.js';

export const keysRouter = new Hono();

keysRouter.get('/', (c) => c.json({ address: env.issuerAddress }));
```

Creators call this once to get the issuer address to put in `GateParams.issuer` when creating an auction.

---

### Step 7 — Frontend: request credential in `GatePage.tsx`

**File:** `apps/frontend/src/features/gate/pages/GatePage.tsx` → `CredentialGateForm`

Currently the form has the user paste the credential JSON manually. Add a "Request Credential" button that automates steps 4–8:

1. Get `address` from `useWallet()`.
2. Build challenge string: `` `fairdrop-credential-request:${auctionId}:${address}` ``.
3. Call `signMessage(challenge)` on the wallet adapter → `walletSignature`.
4. `POST /credentials/issue` with `{ auctionId, holderAddress: address, walletSignature, challenge }`.
5. On success, auto-fill the credential JSON field with the response.
6. User clicks "Submit Credential" → `verify_credential` on-chain.

The credential signer service URL comes from an env var (`VITE_CREDENTIAL_SIGNER_URL`).

---

### Step 8 — Creator setup: issuer address in auction wizard

**File:** `apps/frontend/src/features/auctions/wizard-steps/GateVestStep.tsx`

When `gateMode === 2` (credential gate):
- Add a "Fetch issuer address" button that calls `GET <VITE_CREDENTIAL_SIGNER_URL>/public-key`.
- Auto-fill `issuerAddress` in the form.
- Show the address read-only with a note: "This is the fairdrop credential service address."
- Allow manual override for creators running their own signer.

---

## Security notes

- Private key loaded from env only. Log startup with `address: aleo1...` but never the key itself.
- Rate-limit by `(holderAddress, auctionId)` pair — one credential per bidder per auction per time window.
- Credentials are single-use on-chain: `verified[bidderKey]` is set and never unset. Re-issuance gives a new sig with a fresh expiry, which is fine — the contract only checks `sig.verify` in ZK and the `verified` flag in finalize.
- `expiry` is a block number, not a timestamp. Use `CREDENTIAL_TTL_BLOCKS` calibrated to your block time.
- The service should verify `credential_issuers[auctionId] == issuer` on-chain before signing — prevents issuing credentials for auctions that don't use this key.

---

## Status

Not yet implemented. See implementation plan above.
