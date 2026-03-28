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

Before deploying, update the deployer/admin addresses in `contracts/deployments/programs.json`:

```json
"accounts": {
  "defaultAdminAddress": "aleo1...",
  "protocolTreasury":    "aleo1...",
  "feeCollector":        "aleo1..."
}
```

Then set the same admin address in each utility contract's source where it appears as a constant. These are the addresses that will have admin authority once deployed.

---

## 2. Deploy contracts

Utilities are co-deployed with the first auction contract. Deploy Dutch first — it references utilities as local dependencies, which triggers their deployment automatically.

```bash
# Step 1 — deploys Dutch + all 5 utility contracts in one shot
cd contracts/auctions/dutch
leo deploy --network testnet

# Step 2 — remaining auction programs (order doesn't matter)
# These reference utilities as network (already deployed), not local
cd contracts/auctions/ascending && leo deploy --network testnet
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
  "programId":      "fairdrop_dutch_v1.aleo",
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

Once the frontend is running, connect the **admin wallet** (the address set in step 1).

Navigate to `/admin` — you can get there via the user menu in the top-right corner.

From the admin panel, approve each auction contract as a caller in each utility contract. Every auction program must be registered in:

- `fairdrop_config_v1.aleo`
- `fairdrop_gate_v1.aleo`
- `fairdrop_proof_v1.aleo`
- `fairdrop_ref_v1.aleo`
- `fairdrop_vest_v1.aleo`

This is a one-time on-chain operation per auction contract. Until it's done, auction creation will fail.

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
