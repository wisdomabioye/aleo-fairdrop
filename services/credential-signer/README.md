# credential-signer

A self-hosted HTTP service that issues gate credentials for `fairdrop_gate_v2.aleo` auctions with `gate_mode = 2` (credential gate).

**You host this service. You control who gets credentials.** Fairdrop collects the credential from your service and submits it on-chain — it never touches your private key or decides who is allowed.

---

## How it works

```
Bidder                  credential-signer              Fairdrop
  │                           │                           │
  │── POST /credentials/issue ──>                         │
  │   { auctionId, holderAddress, walletSignature }       │
  │                           │                           │
  │              1. Verify wallet signature               │
  │              2. Run your check function               │
  │              3. Sign credential with issuer key       │
  │                           │                           │
  │<── { signature, expiry, issuer } ───                  │
  │                           │                           │
  │── paste credential into bid form ─────────────────>   │
  │                                          submit bid   │
```

**Layer 1 — wallet ownership** (always enforced): the bidder proves they control `holderAddress` by signing a challenge string with their wallet. This prevents anyone from requesting a credential for an address they do not own.

**Layer 2 — access control** (your check function): your configured strategy decides whether the verified address is allowed to bid. Only if both layers pass is a credential issued.

Credentials are **non-transferable on-chain** — each is cryptographically bound to a specific `(holder, auction_id, expiry)` tuple. A credential issued for one address cannot be used by another.

---

## Prerequisites

- Node.js 20 or later
- An Aleo private key (see below to generate one)
- Access to an Aleo RPC node

---

## Installation

```bash
# From the monorepo root
npm install

# Or install only this service's dependencies
cd services/credential-signer
npm install
```

---

## Quick start

**Step 1 — generate an issuer key**

```bash
snarkos account new
# PrivateKey: APrivateKey1zkp...   <-- copy this
# Address:    aleo1...             <-- this becomes your on-chain issuer
```

**Step 2 — configure**

```bash
cp .env.example .env
```

Edit `.env` and set at minimum:

```env
ISSUER_PRIVATE_KEY=APrivateKey1zkp...
ALEO_RPC_URL=https://api.explorer.provable.com/v1
CHECK_STRATEGY=allowlist
ALLOWLIST_SOURCE=file://./allowlist.json
```

**Step 3 — start**

```bash
npm run dev      # development — restarts on file changes
npm start        # production
```

The service prints your issuer address on startup:

```
[credential-signer] issuer:   aleo1abc...
[credential-signer] strategy: allowlist
[credential-signer] port:     3002
```

**Step 4 — create your auction**

```
GET http://localhost:3002/public-key
→ { "address": "aleo1abc..." }
```

Paste this address into the Fairdrop wizard when creating an auction: select **Credential gate**, then fill in the issuer address field.

---

## Check strategies

Set `CHECK_STRATEGY` in `.env` to one of the options below. Only one strategy runs at a time.

### `allowlist` — static address list

Permit a fixed set of addresses from a JSON file or remote URL.

```env
CHECK_STRATEGY=allowlist
ALLOWLIST_SOURCE=file://./allowlist.json
```

`allowlist.json` (place next to `.env`):
```json
["aleo1abc...", "aleo1def...", "aleo1ghi..."]
```

You can also fetch the list from a URL:
```env
ALLOWLIST_SOURCE=https://example.com/allowlist.json
```

---

### `webhook` — delegate to your own endpoint

Forward each check to an HTTP endpoint you control. Use this for KYC checks, NFT ownership via an external API, Discord role gating, email verification — anything that requires logic your backend already handles.

```env
CHECK_STRATEGY=webhook
WEBHOOK_URL=https://yourapp.com/gate/check
```

Your endpoint receives:
```http
POST https://yourapp.com/gate/check
Content-Type: application/json

{ "address": "aleo1abc...", "auctionId": "12345field" }
```

It must respond with HTTP 200 and:
```json
{ "allowed": true }
```
or
```json
{ "allowed": false }
```

Example Express handler:
```ts
app.post('/gate/check', async (req, res) => {
  const { address, auctionId } = req.body as { address: string; auctionId: string };
  const allowed = await db.isKycApproved(address) && await db.isRegistered(address, auctionId);
  res.json({ allowed });
});
```

---

### `token-gate` — on-chain token balance

Require the bidder to hold a minimum balance of a specific on-chain token. No external service needed — the check runs directly against the Aleo network.

```env
CHECK_STRATEGY=token-gate
TOKEN_GATE_TOKEN_ID=123field
TOKEN_GATE_MIN_BALANCE=1
```

`TOKEN_GATE_TOKEN_ID` is the token's field ID as it appears on-chain (e.g. `123field`).
`TOKEN_GATE_MIN_BALANCE` is an integer. The bidder must hold at least this amount.

---

### `custom` — write your own check function

For cases that don't fit the above. Write a TypeScript (or JavaScript) module that exports a single async function and place it **in the service root directory** (next to `.env`), **not** inside `src/`.

```env
CHECK_STRATEGY=custom
CHECK_MODULE=./my-check.ts
```

Create `my-check.ts` in the `credential-signer/` directory:

```ts
// my-check.ts  (place next to .env, not inside src/)

// CheckFn signature: (address: string, auctionId: string) => Promise<boolean>
const check = async (address: string, auctionId: string): Promise<boolean> => {
  // return true to issue a credential, false to deny
  const res = await fetch(`https://yourapi.com/eligible?address=${address}`);
  const { eligible } = await res.json() as { eligible: boolean };
  return eligible;
};

export default check;
```

The module is loaded at startup via dynamic `import()`. It must export a `default` that is an async function.

---

## API reference

### `GET /public-key`

Returns the issuer address derived from `ISSUER_PRIVATE_KEY`. Use this to fill in the issuer field when creating a credential-gated auction.

```json
{ "address": "aleo1abc..." }
```

### `POST /credentials/issue`

Issues a credential for a verified bidder.

**Request body:**
```json
{
  "auctionId":       "12345field",
  "holderAddress":   "aleo1abc...",
  "walletSignature": "sign1xyz..."
}
```

`walletSignature` is the bidder's signature over the challenge string:
```
fairdrop-credential-request:<auctionId>:<holderAddress>
```

The Fairdrop frontend produces and signs this automatically when the bidder clicks "Request credential".

**Response (200):**
```json
{
  "signature": "sign1...",
  "expiry":    1234567,
  "issuer":    "aleo1abc..."
}
```

The bidder pastes this JSON into the Fairdrop gate form to unlock bidding. The credential expires at block `expiry` (configurable via `CREDENTIAL_TTL_BLOCKS`).

**Error responses:**
- `400` — missing or malformed fields
- `401` — wallet signature verification failed
- `403` — check function returned `false` (address not allowed)
- `429` — rate limited (max 5 requests per address per 60 s)

---

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `ISSUER_PRIVATE_KEY` | yes | — | Aleo private key used to sign credentials |
| `ALEO_RPC_URL` | yes | — | Aleo RPC URL for reading block height |
| `CHECK_STRATEGY` | yes | — | `allowlist` \| `webhook` \| `token-gate` \| `custom` |
| `PORT` | no | `3002` | HTTP port |
| `CREDENTIAL_TTL_BLOCKS` | no | `5760` | Credential validity in blocks (~24 h) |
| `CORS_ORIGIN` | no | `*` | Allowed CORS origin (set to your frontend URL in production) |
| `ALLOWLIST_SOURCE` | if `allowlist` | — | `file://./path.json` or `https://` URL |
| `WEBHOOK_URL` | if `webhook` | — | Your check endpoint URL |
| `TOKEN_GATE_TOKEN_ID` | if `token-gate` | — | On-chain token field ID |
| `TOKEN_GATE_MIN_BALANCE` | if `token-gate` | — | Minimum token balance (integer) |
| `CHECK_MODULE` | if `custom` | — | Path to your check module (relative to this directory) |

`ALEO_RPC_URL` is required for all strategies — it is used to compute the expiry block height for every issued credential.

---

## Deployment

### Node.js (direct)

```bash
npm start
```

Keep the process alive with a process manager:
```bash
npm install -g pm2
pm2 start "npm start" --name credential-signer
pm2 save
```

### Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
EXPOSE 3002
CMD ["npm", "start"]
```

```bash
docker build -t credential-signer .
docker run -d --env-file .env -p 3002:3002 credential-signer
```

### Behind a reverse proxy (nginx / Caddy)

The service speaks plain HTTP. Put it behind TLS in production so bidders' requests are encrypted in transit.

```nginx
location /credential-signer/ {
  proxy_pass http://localhost:3002/;
}
```

Set `CORS_ORIGIN` to your Fairdrop frontend URL once deployed.

---

## Security

- `ISSUER_PRIVATE_KEY` is read once at startup and never logged or returned by any endpoint.
- Every credential request proves the bidder controls `holderAddress` via a wallet signature before the check function runs. Credentials cannot be requested for an address the requester does not own.
- Credentials are non-transferable on-chain — each is cryptographically bound to `(holder, auction_id, expiry)`. A credential issued for one address cannot be reused by another.
- Rate limiting is applied per address: 5 requests per 60-second window.

---

## Further reading

- [Credential gate guide](../../docs/guides/credential-gate/README.md) — how the gate works, two-transaction flow, and when to use credential vs Merkle mode
- [NFT / token-gate example](../../docs/guides/credential-gate/examples/nft-gate/README.md) — require on-chain token ownership
- [Webhook delegation example](../../docs/guides/credential-gate/examples/webhook/README.md) — delegate to your own HTTP endpoint
- [Compliance / KYC example](../../docs/guides/credential-gate/examples/compliance-kyc/README.md) — KYC/AML provider integration
- [ZK humanity proof guide](../../docs/guides/credential-gate/examples/zk-humanity/README.md) — sybil resistance via ZK proof
- [Webhook security](../../docs/guides/credential-gate/webhook-security.md) — securing webhook endpoints
- [credentialUrl convention](../../docs/guides/credential-gate/credential-url.md) — how the frontend discovers your service URL
