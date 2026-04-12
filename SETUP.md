# Fairdrop — Setup Guide

End-to-end instructions for deploying contracts, running the backend, and launching the frontend. Follow the steps in order — the contracts must be deployed before the services can index anything useful.

---

## Prerequisites

- Node ≥ 22, pnpm ≥ 10
- [Leo CLI](https://developer.aleo.org/leo/installation) with a funded Aleo account
- PostgreSQL database (local, [Supabase](https://supabase.com), or [Neon](https://neon.tech))
- [Pinata](https://app.pinata.cloud) account for IPFS metadata uploads

```bash
pnpm install
```

---

## 1. Configure admin addresses

Before deploying, replace the 5 hardcoded `ADMIN_0`–`ADMIN_4` constants in the multisig contract with your production admin addresses:

```
contracts/utilities/multisig/src/main.leo
```

```leo
const ADMIN_0: address = aleo1...;
const ADMIN_1: address = aleo1...;
const ADMIN_2: address = aleo1...;
const ADMIN_3: address = aleo1...;
const ADMIN_4: address = aleo1...;
```

These 5 addresses form the 3-of-5 multisig that governs all protocol operations (config changes, caller authorization, treasury withdrawals, and contract upgrades). They are baked into the contract at deploy time and cannot be changed without a multisig-approved admin rotation.

---

## 2. Deploy contracts

Utilities are co-deployed with the first auction contract. Deploy Ascending first — it references utilities as local dependencies, which triggers their deployment automatically.

```bash
# Step 1 — deploys Ascending + all local dependencies (multisig, config, gate, proof, ref, vest, dex)
cd contracts/auctions/ascending
leo deploy --network testnet

# Step 2 — remaining auction programs (order doesn't matter)
# These reference utilities as network (already deployed), not local
cd contracts/auctions/dutch     && leo deploy --network testnet
cd contracts/auctions/sealed    && leo deploy --network testnet
cd contracts/auctions/raise     && leo deploy --network testnet
cd contracts/auctions/lbp       && leo deploy --network testnet
cd contracts/auctions/quadratic && leo deploy --network testnet
```

---

## 3. Update `programs.json`

After each deployment, fill in the `programAddress` (the `aleo1...` address derived from the program ID) in `contracts/deployments/programs.json`. This file is the single source of truth consumed by the frontend, API, and indexer.

```json
"dutch": {
  "programId":      "fairdrop_dutch_v3.aleo",
  "programAddress": "aleo1...",    // ← fill this in after deploying
  "salt": "1field"
}
```

---

## 4. Database

Create the database and run migrations.

```bash
# Create the database (skip if using Supabase/Neon — create via dashboard)
createdb fairdrop

# Run migrations
pnpm --filter @fairdrop/api db:migrate
```

For remote Postgres (Supabase/Neon), include `?sslmode=require` in your connection string.

---

## 5. Environment variables

Each service has a `.env.example`. Copy and fill in:

```bash
cp services/api/.env.example     services/api/.env
cp services/indexer/.env.example services/indexer/.env
cp apps/frontend/.env.example    apps/frontend/.env.local
```

Key variables:

| Variable | Where | Notes |
|---|---|---|
| `DATABASE_URL` | api, indexer | Postgres connection string |
| `ALEO_RPC_URL` | api, indexer | `https://api.explorer.provable.com/v2/testnet` |
| `ALEO_NETWORK` | indexer | `testnet` or `mainnet` |
| `PINATA_JWT` | api | Required for `POST /metadata` |
| `INDEXER_START_BLOCK` | indexer | Set to the Dutch auction deployment block height — avoids scanning from genesis |
| `VITE_API_URL` | frontend | Points to the running API, e.g. `http://localhost:3001` |

---

## 6. Run the services

```bash
# In separate terminals (or use pnpm dev from repo root to run everything)

pnpm --filter @fairdrop/indexer dev   # chain watcher
pnpm --filter @fairdrop/api     dev   # HTTP API on :3001
pnpm --filter @fairdrop/frontend dev  # Vite dApp on :5173
```

Or from the repo root to start everything at once:

```bash
pnpm dev
```

Confirm the API and indexer are healthy:

```bash
curl http://localhost:3001/health
# → {"status":"ok"}

curl http://localhost:3001/indexer/status | jq
# → indexedBlock, chainTip, lagBlocks, per-program status
```

---

## 7. Admin setup (one-time, on-chain)

Two one-time steps are required before the protocol is operational: initializing the multisig and authorizing auction callers. Both are done through the Admin panel.

### 7a. Initialize the multisig

The multisig contract ships with 5 hardcoded admin addresses (the `ADMIN_0`–`ADMIN_4` constants you set in step 1), but their `admins` mapping is empty until `initialize()` is called.

1. Connect **any** wallet — this call is permissionless.
2. Open the wallet menu (top-right) → **Admin**.
3. You will land on the **Governance** tab because the multisig is not yet initialized.
4. Click **Initialize multisig** and confirm the transaction.
5. Wait for on-chain confirmation. The 5 admin addresses are now registered.

After initialization, the Admin page is restricted to registered admins only.

### 7b. Authorize auction callers

Each auction program must be registered as an allowed caller in 4 utility contracts: **Gate**, **Proof**, **Ref**, and **Vest**. This is a multisig-protected operation — it requires 3-of-5 admin signatures.

1. Connect one of the 5 admin wallets.
2. Open the wallet menu → **Admin** → **Authorization** tab.
3. The grid shows each auction program (Dutch, Sealed, Raise, Ascending, LBP, Quadratic) and its authorization status per utility (✓ or ✗).
4. Click **Authorize N missing** on an auction row to expand it.
5. The panel displays one **message hash** per missing utility. Each of these hashes must be signed off-chain by 3 of the 5 admins using their Aleo private key:
   ```
   aleo account sign --private-key <ADMIN_PRIVATE_KEY> --message <MESSAGE_HASH>
   ```
6. Paste the 3 resulting `sign1…` signatures and their corresponding `aleo1…` admin addresses into the **Signature Panel**.
7. Click **Authorize on all N missing utilities**. This submits a sequence of on-chain transactions (one `approve_op` + one `set_allowed_caller` per utility).
8. Repeat for each auction program until the grid shows all ✓.

Until this is done, auction creation will fail.

---

## 8. Deploy to production

For Docker-based deployments, see `infra/docker/`. The container runs both the API and indexer under `supervisord`.

```bash
cd infra/docker
cp .env.example .env   # fill in production values
docker compose up --build -d
```

For cloud hosting (Fly.io, Hetzner + Coolify, etc.) see the [root README](README.md).

---

## Done

At this point:
- Contracts are deployed and configured
- Indexer is syncing from the deployment block
- API is serving auction and token data
- Frontend is live and connected

Create a test auction via `/auctions/new` to verify the full flow end to end.
