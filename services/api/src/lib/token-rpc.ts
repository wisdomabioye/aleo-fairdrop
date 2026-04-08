/**
 * Node-compatible RPC helper for token_registry.aleo.
 * Pure fetch — no caching. Caching is the caller's responsibility (tokens.ts).
 */
import { parseTokenInfo } from '@fairdrop/sdk/parse';
import type { TokenInfo } from '@fairdrop/types/domain';

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
