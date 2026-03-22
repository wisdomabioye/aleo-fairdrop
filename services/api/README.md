# services/api

HTTP API for the frontend and any external integrations. Read-only from DB; never submits transactions — that happens client-side via the wallet adapter.

## Routes

| Method | Path | Description |
|---|---|---|
| `GET` | `/auctions` | Paginated auction list — filters: `type`, `status`, `creator`, `token`, `sort`, `order`, `page`, `pageSize` |
| `GET` | `/auctions/filters` | Available filter enum values |
| `GET` | `/auctions/:id` | Single auction with computed status and metadata |
| `GET` | `/auctions/:id/bids` | Public bids for an auction (paginated) |
| `GET` | `/users/:address` | Creator profile + reputation |
| `GET` | `/users/:address/auctions` | Auctions created by address (paginated) |
| `GET` | `/users/:address/referral-codes` | Referral codes owned by address |
| `GET` | `/tokens/:id/metadata` | Token info from `token_registry.aleo` (live RPC read) |
| `POST` | `/metadata` | Pin auction metadata to IPFS, return `metadata_hash` |
| `GET` | `/metadata/:hash` | Fetch pinned metadata by hash |
| `GET` | `/indexer/status` | Sync status across all registered programs |
| `GET` | `/health` | Liveness check |

All response types are defined in `@fairdrop/types/api`.

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
├── routes/             — HTTP boundary: parse params, call query, return JSON
├── queries/            — pure Drizzle queries, no HTTP concerns
├── mappers/            — DB row → domain type conversion
└── lib/
    ├── pagination.ts   — parsePagination + buildPage helpers
    ├── ipfs.ts         — IpfsClient interface + Pinata implementation
    └── hash.ts         — deterministic metadata hash (SHA-256 → field)
```

## Metadata hash algorithm

`POST /metadata` computes a field-valued hash of the canonical metadata JSON:

1. Build canonical object (sorted keys)
2. SHA-256 the UTF-8 bytes
3. Reduce the resulting BigInt mod the BLS12-377 scalar field order

The hash is server-authoritative (no on-chain recompute). Verification: fetch IPFS content → canonicalise → `computeMetadataHash` → compare to `auctions.metadata_hash`.

## Stack

Node 22 + TypeScript. Hono + `@hono/node-server`. Drizzle + PostgreSQL via `@fairdrop/database`. Pinata for IPFS.

## Env vars

See `.env.example`.
