# services/api

HTTP API for the frontend and external integrations. Read-only from DB; never submits transactions — that happens client-side via the wallet adapter.

## Quick start

```sh
pnpm --filter @fairdrop/api dev    # tsx watch
pnpm --filter @fairdrop/api start  # tsx (prod)
```

## Env vars

| Var | Required | Default | Notes |
|---|---|---|---|
| `DATABASE_URL` | ✓ | — | PostgreSQL connection string |
| `ALEO_RPC_URL` | ✓ | — | e.g. `https://api.explorer.aleo.org/v1/testnet` |
| `PINATA_JWT` | ✓ | — | Pinata API JWT for IPFS pinning |
| `PORT` | — | `3001` | HTTP listen port |
| `CORS_ORIGIN` | — | `*` | Set explicitly in production |

## Routes

| Method | Path | Description |
|---|---|---|
| `GET` | `/auctions` | Paginated list — filters: `type`, `status`, `creator`, `token`; sort: `endBlock \| volume \| progressPct` (default: `createdAtBlock`), `order: asc\|desc` |
| `GET` | `/auctions/filters` | Available enum values for `type`, `status`, `gateMode` |
| `GET` | `/auctions/:id` | Single auction — computed status, current price, wall-clock estimates |
| `GET` | `/auctions/:id/bids` | ⚠️ Stub — always empty (bid indexing not yet implemented) |
| `GET` | `/users/:address` | Creator profile — auction counts and total volume |
| `GET` | `/users/:address/auctions` | Auctions created by address (paginated) |
| `GET` | `/users/:address/referral-codes` | ⚠️ Stub — always empty (referral indexing not yet implemented) |
| `GET` | `/tokens/:id/metadata` | Live RPC read from `token_registry.aleo`; warms the 5min symbol/decimals cache |
| `POST` | `/metadata` | Validate → hash → pin to IPFS → store; returns `{ metadata_hash, ipfs_cid }` |
| `GET` | `/metadata/:hash` | Fetch pinned metadata by field hash |
| `GET` | `/indexer/status` | Sync lag, chain tip, per-program checkpoints |
| `GET` | `/health` | Liveness probe |

All response types live in `@fairdrop/types/api`.

## Architecture

```
src/
├── env.ts              — startup validation (throws on missing vars)
├── index.ts            — entrypoint: createDb → serve
├── app.ts              — Hono app assembly + route registration
├── middleware/
│   ├── db.ts           — injects db into request context
│   ├── cors.ts         — CORS headers
│   └── error.ts        — global onError → { error, code } JSON
├── routes/             — HTTP boundary: parse + validate params, call query, return JSON
├── queries/            — pure Drizzle queries, no HTTP concerns
├── mappers/            — DB row → domain type conversion (status, price, estimates)
└── lib/
    ├── respond.ts      — bigint-safe json() wrapper (Hono's c.json() throws on bigint)
    ├── pagination.ts   — parsePagination + buildPage
    ├── token-cache.ts  — 5min in-process TTL cache for token_registry symbol/decimals
    ├── ipfs.ts         — IpfsClient interface + Pinata implementation
    └── hash.ts         — deterministic metadata hash (SHA-256 → field)
```

## Key design decisions

**Status is computed, not stored.** The DB `status` column holds only `live | cleared | voided` — the three on-chain-derivable terminal states. The six API `AuctionStatus` values (`upcoming`, `active`, `clearing`, `ended`, `cleared`, `voided`) are derived at query time from `status`, `start_block`, `end_block`, and `supply_met` vs the current indexed block height. This is what makes `GET /auctions?status=active` exact — the WHERE clause uses the actual field values, not a stored string.

**`currentPrice` is computed per request.** Dutch price decays by steps (`startPrice - floor(elapsed / decayBlocks) * decayAmount`, floored at `floorPrice`). Ascending price rises symmetrically, capped at `ceilingPrice`. Non-priced types (Raise, Sealed) return `null`.

**Bigint serialisation.** All u128 values from Leo are stored as decimal strings in PostgreSQL and exposed as strings in JSON (JSON has no bigint). The `json()` helper in `lib/respond.ts` intercepts bigint with a replacer — Hono's default `c.json()` would throw. Frontend reconstructs with `BigInt(value)`.

**Token info cache.** `token_registry.aleo` holds symbol and decimals. Rather than one RPC call per auction row on every list request, `lib/token-cache.ts` caches results for 5 minutes. `GET /tokens/:id/metadata` populates the cache directly from its own fetch (no second RPC call).

## Metadata hash algorithm

`POST /metadata` produces a field-compatible hash of the canonical metadata JSON:

1. Canonicalise — sort keys, `JSON.stringify`
2. SHA-256 the UTF-8 bytes
3. Interpret as BigInt, mod the BLS12-377 scalar field order

Server-authoritative — there is no on-chain recompute. To verify: fetch IPFS content → canonicalise → `computeMetadataHash` → compare to `auctions.metadata_hash`.

## Stack

Node 22 + TypeScript · Hono + `@hono/node-server` · Drizzle + PostgreSQL · Pinata IPFS
