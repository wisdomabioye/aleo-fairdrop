/**
 * In-process TTL cache for token_registry.aleo token info.
 *
 * Used by auction routes to populate saleTokenSymbol and saleTokenDecimals
 * without an RPC call per auction row. Entries expire after TOKEN_TTL_MS.
 *
 * The decodeTokenString helper is also exported for use in routes/tokens.ts
 * so the logic stays in one place.
 */
import { parseStruct, parseU8 } from '@fairdrop/sdk/parse';

export interface TokenInfo {
  symbol:   string;
  decimals: number;
}

interface CacheEntry {
  data:   TokenInfo | null;  // null = confirmed missing
  expiry: number;
}

const cache  = new Map<string, CacheEntry>();
const TOKEN_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Decode a u128 field that encodes an ASCII/UTF-8 string.
 * token_registry.aleo packs name/symbol as right-aligned bytes in a u128.
 */
export function decodeTokenString(raw: string): string {
  const n = BigInt(raw.replace(/u128$/, ''));
  const bytes: number[] = [];
  let rem = n;
  for (let i = 0; i < 16; i++) {
    bytes.unshift(Number(rem & 0xFFn));
    rem >>= 8n;
  }
  return bytes.filter((b) => b !== 0).map((b) => String.fromCharCode(b)).join('');
}

async function fetchTokenInfo(rpcUrl: string, tokenId: string): Promise<TokenInfo | null> {
  try {
    const url = `${rpcUrl}/program/token_registry.aleo/mapping/registered_tokens/${tokenId}field`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const raw = (await res.json()) as string;
    const f   = parseStruct(raw);
    return {
      symbol:   decodeTokenString(f['symbol']!),
      decimals: parseU8(f['decimals']!),
    };
  } catch {
    return null;
  }
}

export async function getTokenInfo(
  rpcUrl:  string,
  tokenId: string,
): Promise<TokenInfo | null> {
  const now = Date.now();
  const hit = cache.get(tokenId);
  if (hit && hit.expiry > now) return hit.data;

  const data = await fetchTokenInfo(rpcUrl, tokenId);
  cache.set(tokenId, { data, expiry: now + TOKEN_TTL_MS });
  return data;
}

/**
 * Populate the cache directly from an already-fetched value.
 * Used by routes that independently fetch full token data so they can warm
 * the cache without triggering a second RPC call inside getTokenInfo.
 */
export function setTokenCache(tokenId: string, info: TokenInfo): void {
  cache.set(tokenId, { data: info, expiry: Date.now() + TOKEN_TTL_MS });
}

/** Batch-fetch token info for a list of token IDs. Returns a Map keyed by tokenId. */
export async function getTokenInfoBatch(
  rpcUrl:   string,
  tokenIds: string[],
): Promise<Map<string, TokenInfo>> {
  const unique  = [...new Set(tokenIds)];
  const results = await Promise.all(unique.map((id) => getTokenInfo(rpcUrl, id)));
  const map     = new Map<string, TokenInfo>();
  unique.forEach((id, i) => {
    const info = results[i];
    if (info) map.set(id, info);
  });
  return map;
}
