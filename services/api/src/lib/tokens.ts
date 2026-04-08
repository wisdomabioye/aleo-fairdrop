/**
 * Token resolution — three layers: in-process cache → DB → RPC.
 *
 * Token metadata is immutable on-chain (registered_tokens is write-once),
 * so the in-process cache has no TTL and DB writes use ON CONFLICT DO NOTHING.
 */
import { eq, inArray }    from 'drizzle-orm';
import { tokens }         from '@fairdrop/database';
import { fetchToken }     from './token-rpc.js';
import type { Db, TokenRow } from '@fairdrop/database';
import type { TokenInfo } from '@fairdrop/types/domain';

// ── In-process cache ──────────────────────────────────────────────────────────
// Plain Map — no serialization overhead. Lives for the process lifetime.

const cache = new Map<string, TokenInfo>();

// ── Converters ────────────────────────────────────────────────────────────────

function rowToTokenInfo(row: TokenRow): TokenInfo {
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

function tokenInfoToValues(tokenId: string, info: TokenInfo) {
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

// ── Public API ────────────────────────────────────────────────────────────────

/** Resolve a single token — in-process cache → DB → RPC. */
export async function getToken(
  db:      Db,
  rpcUrl:  string,
  tokenId: string,
): Promise<TokenInfo | null> {
  // 1. In-process cache
  const cached = cache.get(tokenId);
  if (cached) return cached;

  // 2. DB
  const [row] = await db.select().from(tokens).where(eq(tokens.id, tokenId)).limit(1);
  if (row) {
    const info = rowToTokenInfo(row);
    cache.set(tokenId, info);
    return info;
  }

  // 3. RPC
  const info = await fetchToken(rpcUrl, tokenId);
  if (!info) return null;

  await db.insert(tokens).values(tokenInfoToValues(tokenId, info)).onConflictDoNothing();
  cache.set(tokenId, info);
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
    const cached = cache.get(id);
    if (cached) result.set(id, cached);
    else missing.push(id);
  }
  if (missing.length === 0) return result;

  // 2. DB pass
  const rows = await db.select().from(tokens).where(inArray(tokens.id, missing));
  const stillMissing: string[] = [];

  for (const row of rows) {
    const info = rowToTokenInfo(row);
    cache.set(row.id, info);
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
    await db.insert(tokens).values(tokenInfoToValues(id, info)).onConflictDoNothing();
    cache.set(id, info);
    result.set(id, info);
  }));

  return result;
}
