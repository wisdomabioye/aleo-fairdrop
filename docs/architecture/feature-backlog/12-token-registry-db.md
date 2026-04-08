# Plan: Token Metadata in DB

## Summary

Persist token metadata in the database. A pluggable `tokens.ts` module owns all token
resolution — three layers: SDK in-process cache → DB → RPC. Uses `TokenInfo` from
`@fairdrop/types/domain` and `getCachedTokenInfo` / `setCachedTokenInfo` from
`@fairdrop/sdk/cache` throughout. `token-cache.ts` is stripped down to a pure
Node-compatible RPC helper. No cross-service imports.

---

## Problem

Token metadata is fetched from `token_registry.aleo` on every API request via an in-process
TTL `Map` cache in `token-cache.ts`. The cache resets on restart, the fetch can return null,
and `saleTokenSymbol` / `saleTokenDecimals` are nullable as a result. `decimalsFromScale` in
the mapper exists only because of this fragility.

Additionally, `token-cache.ts` defines its own minimal `TokenInfo { symbol, decimals }`
that diverges from `@fairdrop/types/domain`'s `TokenInfo` (8 fields). The mapper imports
the local type. These two `TokenInfo` shapes need to be unified.

---

## Design

One module owns token resolution. Three layers, same idea as the existing cache — just
with DB added between the in-process cache and the RPC call.

```
caller asks for token(s)
        │
        ▼
  1. SDK in-process cache  getCachedTokenInfo  (@fairdrop/sdk/cache — no IO)
        │ hit → return
        │ miss
        ▼
  2. DB  SELECT FROM tokens
        │ hit → setCachedTokenInfo → return
        │ miss
        ▼
  3. RPC  fetchToken (Node-compatible fetch in token-rpc.ts)
        │ found → INSERT INTO tokens ON CONFLICT DO NOTHING
        │         setCachedTokenInfo → return
        │ not found → return null
```

Token metadata is immutable on-chain (`registered_tokens` is write-once).
`ON CONFLICT DO NOTHING` is correct everywhere. No TTL in the SDK cache (matches the SDK's
own `token-meta.ts` comment: "No TTL needed").

---

## Changes

### 0. Fix bigint serialization — `packages/sdk/src/cache/persist.ts`

`TokenInfo` from `@fairdrop/types/domain` has `totalSupply: bigint` and `maxSupply: bigint`.
`persist.ts` uses plain `JSON.stringify/parse`, which throws on bigint. Add a
replacer/reviver so the SDK cache can store the full `TokenInfo` in both browser and Node
environments. Backward-compatible: non-bigint values pass through unchanged.

```ts
// packages/sdk/src/cache/persist.ts — additions only

const BIGINT_TAG = '__bigint__';

function replacer(_k: string, v: unknown): unknown {
  return typeof v === 'bigint' ? { [BIGINT_TAG]: String(v) } : v;
}

function reviver(_k: string, v: unknown): unknown {
  if (v !== null && typeof v === 'object' && BIGINT_TAG in (v as object)) {
    return BigInt((v as Record<string, string>)[BIGINT_TAG]);
  }
  return v;
}

// Update setPersisted and getPersisted to use replacer / reviver:
export function setPersisted<T>(key: string, value: T): void {
  _storage.setItem(key, JSON.stringify(value, replacer));
}

export function getPersisted<T>(key: string): T | null {
  try {
    const raw = _storage.getItem(key);
    return raw ? (JSON.parse(raw, reviver) as T) : null;
  } catch {
    return null;
  }
}
```

---

### 1. API startup — `services/api/src/index.ts`

The SDK's default storage backend is `LocalStorageAdapter` (browser). Swap it to
`MemoryStorageAdapter` before any cache operation so that `getCachedTokenInfo` /
`setCachedTokenInfo` work correctly in Node.

```ts
// services/api/src/index.ts  — add at the top, before createApp
import { setStorage, MemoryStorageAdapter } from '@fairdrop/sdk/cache';
setStorage(new MemoryStorageAdapter());
```

One line. No other startup changes.

---

### 2. New DB table — `packages/database/src/schema/tokens.ts`

```ts
import { pgTable, text, boolean, integer, timestamp } from 'drizzle-orm/pg-core';

export const tokens = pgTable('tokens', {
  id:            text('id').primaryKey(),         // field hex — matches auctions.saleTokenId
  name:          text('name').notNull(),
  symbol:        text('symbol').notNull(),
  decimals:      integer('decimals').notNull(),
  totalSupply:   text('total_supply').notNull(),  // bigint stored as decimal string
  maxSupply:     text('max_supply').notNull(),    // bigint stored as decimal string
  admin:         text('admin').notNull(),
  externalAuthorizationRequired: boolean('external_authorization_required').notNull(),
  seenAt:        timestamp('seen_at').notNull(),
});
```

- Export from `packages/database/src/schema/index.ts`
- Add `TokenRow` to `packages/database/src/db-types.ts`:
  ```ts
  export type TokenRow = typeof tokens.$inferSelect;
  ```
- Add Drizzle migration

---

### 3. Clean up `token-cache.ts` → rename `token-rpc.ts`

`token-cache.ts` currently does two things: in-process caching AND RPC fetch. Both are
being replaced. What survives is only the Node-compatible RPC call.

**Delete from `token-cache.ts`:**
- `TokenInfo` local interface — replaced by `@fairdrop/types/domain`
- `CacheEntry` + private `cache` Map + `TOKEN_TTL_MS`
- `setTokenCache` — replaced by `setCachedTokenInfo` from SDK
- `getTokenInfoBatch` — replaced by `getTokensBatch` in `tokens.ts`
- `decodeTokenString` — redundant, `parseTokenInfo` in SDK handles u128 decoding

**Keep / rename:**
```ts
// services/api/src/lib/token-rpc.ts  (renamed from token-cache.ts)
import { parseTokenInfo } from '@fairdrop/sdk/parse';
import type { TokenInfo } from '@fairdrop/types/domain';

/** Fetch token metadata from token_registry.aleo via Node-compatible fetch. */
export async function fetchToken(rpcUrl: string, tokenId: string): Promise<TokenInfo | null> {
  try {
    const url = `${rpcUrl}/programs/program/token_registry.aleo/mapping/registered_tokens/${tokenId}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const raw = (await res.json()) as string;
    return parseTokenInfo(raw);
  } catch {
    return null;
  }
}
```

Update `routes/auctions.ts` and `routes/tokens.ts` imports: `../lib/token-cache.js` →
`../lib/token-rpc.js`. (They will be replaced entirely in steps 4 and 5.)

---

### 4. Token module — `services/api/src/lib/tokens.ts`

Single pluggable module. No knowledge of auctions, bids, or any other domain.

```ts
import { eq, inArray }                            from 'drizzle-orm';
import { tokens }                                 from '@fairdrop/database';
import { getCachedTokenInfo, setCachedTokenInfo } from '@fairdrop/sdk/cache';
import { fetchToken }                             from './token-rpc.js';
import type { Db }                                from '@fairdrop/database';
import type { TokenInfo }                         from '@fairdrop/types/domain';

/** Resolve a single token — in-process cache → DB → RPC. */
export async function getToken(
  db:      Db,
  rpcUrl:  string,
  tokenId: string,
): Promise<TokenInfo | null> {
  // 1. In-process cache
  const cached = getCachedTokenInfo(tokenId);
  if (cached) return cached;

  // 2. DB
  const [row] = await db.select().from(tokens).where(eq(tokens.id, tokenId)).limit(1);
  if (row) {
    const info = rowToInfo(row);
    setCachedTokenInfo(tokenId, info);
    return info;
  }

  // 3. RPC
  const info = await fetchToken(rpcUrl, tokenId);
  if (!info) return null;

  await db.insert(tokens).values(infoToRow(tokenId, info)).onConflictDoNothing();
  setCachedTokenInfo(tokenId, info);
  return info;
}

/** Resolve multiple tokens — in-process cache → DB → RPC for each miss. */
export async function getTokensBatch(
  db:       Db,
  rpcUrl:   string,
  tokenIds: string[],
): Promise<Map<string, TokenInfo>> {
  const unique  = [...new Set(tokenIds)];
  const result  = new Map<string, TokenInfo>();
  const missing: string[] = [];

  // 1. Cache pass
  for (const id of unique) {
    const cached = getCachedTokenInfo(id);
    if (cached) result.set(id, cached);
    else missing.push(id);
  }
  if (missing.length === 0) return result;

  // 2. DB pass
  const rows = await db.select().from(tokens).where(inArray(tokens.id, missing));
  const stillMissing: string[] = [];

  for (const row of rows) {
    const info = rowToInfo(row);
    setCachedTokenInfo(row.id, info);
    result.set(row.id, info);
  }
  for (const id of missing) {
    if (!result.has(id)) stillMissing.push(id);
  }
  if (stillMissing.length === 0) return result;

  // 3. RPC pass
  await Promise.all(stillMissing.map(async (id) => {
    const info = await fetchToken(rpcUrl, id);
    if (!info) return;
    await db.insert(tokens).values(infoToRow(id, info)).onConflictDoNothing();
    setCachedTokenInfo(id, info);
    result.set(id, info);
  }));

  return result;
}

// ── Converters ────────────────────────────────────────────────────────────────

function rowToInfo(row: TokenRow): TokenInfo {
  return {
    tokenId:                       row.id,
    name:                          row.name,
    symbol:                        row.symbol,
    decimals:                      row.decimals,
    totalSupply:                   BigInt(row.totalSupply),
    maxSupply:                     BigInt(row.maxSupply),
    admin:                         row.admin,
    externalAuthorizationRequired: row.externalAuthorizationRequired,
  };
}

function infoToRow(tokenId: string, info: TokenInfo) {
  return {
    id:            tokenId,
    name:          info.name,
    symbol:        info.symbol,
    decimals:      info.decimals,
    totalSupply:   String(info.totalSupply),
    maxSupply:     String(info.maxSupply),
    admin:         info.admin,
    externalAuthorizationRequired: info.externalAuthorizationRequired,
    seenAt:        new Date(),
  };
}
```

Add `import type { TokenRow } from '@fairdrop/database';` at the top.

---

### 5. API endpoints — `services/api/src/routes/tokens.ts`

Replace the single-token route. Add a batch endpoint.

```ts
import { Hono }      from 'hono';
import type { Db }   from '@fairdrop/database';
import { getToken, getTokensBatch } from '../lib/tokens.js';
import { json }      from '../lib/respond.js';
import { env }       from '../env.js';

type Variables = { db: Db };
export const tokensRouter = new Hono<{ Variables: Variables }>();

// GET /tokens/:id
tokensRouter.get('/:id', async (c) => {
  const info = await getToken(c.get('db'), env.aleoRpcUrl, c.req.param('id'));
  if (!info) return c.json({ error: 'not found' }, 404);
  return json(c, info);
});

// GET /tokens?ids=id1,id2,...
tokensRouter.get('/', async (c) => {
  const ids = c.req.query('ids')?.split(',').filter(Boolean) ?? [];
  if (ids.length === 0) return json(c, {});
  const map = await getTokensBatch(c.get('db'), env.aleoRpcUrl, ids);
  return json(c, Object.fromEntries(map));
});
```

The old path `/:id/metadata` is a rename to `/:id`. Update frontend's `TokenStep` wizard
to use the new path if it references the old one.

---

### 6. Auction route — `services/api/src/routes/auctions.ts`

Two one-line swaps:

```ts
// before
import { getTokenInfo, getTokenInfoBatch } from '../lib/token-cache.js';

// after
import { getToken, getTokensBatch } from '../lib/tokens.js';
```

```ts
// before (list route)
getTokenInfoBatch(env.aleoRpcUrl, [...new Set(rows.map((r) => r.saleTokenId))]),

// after
getTokensBatch(db, env.aleoRpcUrl, [...new Set(rows.map((r) => r.saleTokenId))]),
```

```ts
// before (detail route)
getTokenInfo(env.aleoRpcUrl, row.saleTokenId),

// after
getToken(db, env.aleoRpcUrl, row.saleTokenId),
```

The `Promise.all` shape, the mapper call, and the `tokenInfoMap.get(id)` lookup are
unchanged.

---

### 7. Mapper — `services/api/src/mappers/auction.ts`

One import change:

```ts
// before
import type { TokenInfo } from '../lib/token-cache.js';

// after
import type { TokenInfo } from '@fairdrop/types/domain';
```

The mapper uses `tokenInfo.symbol` and `tokenInfo.decimals` — both are in `TokenInfo` from
the domain package. No other changes to mapper logic.

`decimalsFromScale` can be removed once DB coverage is confirmed. Keep it as a fallback
until then.

---

### 8. Type changes

```ts
// packages/types/src/domain/auction.ts
saleTokenSymbol:   string;    // was string | null
saleTokenDecimals: number;    // was already number, but now reliably populated
```

---

## What is deleted after this ships

| Item | Location | Why |
|---|---|---|
| Local `TokenInfo { symbol, decimals }` | `token-cache.ts` | replaced by `@fairdrop/types/domain` |
| `CacheEntry`, `cache` Map, `TOKEN_TTL_MS` | `token-cache.ts` | replaced by SDK `MemoryStorageAdapter` cache |
| `setTokenCache` | `token-cache.ts` | replaced by `setCachedTokenInfo` from SDK |
| `getTokenInfoBatch` | `token-cache.ts` | replaced by `getTokensBatch` in `tokens.ts` |
| `decodeTokenString` | `token-cache.ts` | `parseTokenInfo` in SDK handles u128 decoding |
| `token-cache.ts` itself | — | renamed to `token-rpc.ts` |
| `decimalsFromScale` | `mappers/auction.ts` | remove once DB coverage confirmed |

`@fairdrop/sdk/cache`'s `token-meta.ts`, `getCachedTokenInfo`, and `setCachedTokenInfo`
**stay unchanged** — they become the single in-process cache layer for both browser and server.

---

## What is NOT changing

- Mapper signatures — unchanged (parameter type widens but field usage is the same)
- `listAuctions` / `getAuction` query shape — no JOIN added
- `AuctionRow` type — unchanged
- `tokenInfoMap.get(id)` call pattern in route handler — unchanged
- `@fairdrop/sdk/token-registry`'s `fetchTokenInfo` — stays browser-only, not used here

---

## `paymentTokenId` — explicitly deferred

Auctions have both `saleTokenId` and `paymentTokenId`. This plan handles `saleTokenId` only.
The `tokens` table and `getToken` / `getTokensBatch` module are domain-agnostic — when
`paymentTokenId` needs display metadata, the same implementation is used with no changes.
No additional plumbing needed.

---

## Order of implementation

1. Fix `persist.ts` bigint serialization in `packages/sdk/src/cache/persist.ts`
2. Add `tokens` table to schema + `TokenRow` export + Drizzle migration
3. Add `setStorage(new MemoryStorageAdapter())` to `services/api/src/index.ts`
4. Rename `token-cache.ts` → `token-rpc.ts`, delete everything except `fetchToken`
5. Write `services/api/src/lib/tokens.ts` (`getToken` + `getTokensBatch`)
6. Update `services/api/src/routes/tokens.ts`
7. Update `services/api/src/routes/auctions.ts` — two one-line swaps
8. Update mapper import: `token-cache.js` → `@fairdrop/types/domain`
9. Update types to non-nullable; remove `decimalsFromScale` once confirmed
