/**
 * token_registry.aleo mapping queries — browser-only.
 *
 * All functions return null on any error (network, hash, parse) rather than
 * throwing — callers treat null as "unknown" and retry on demand.
 *
 * Key derivation (computeTokenOwnerKey, generateTokenId) lives in @fairdrop/sdk/hash.
 */

import type { TokenInfo, TokenBalance } from '@fairdrop/types/domain';
import { SYSTEM_PROGRAMS } from '../constants';
import { getAleoClient } from '../client';
import { parseTokenInfo, parseRawTokenBalance } from '../parse/token';
import { computeTokenOwnerKey } from '../hash';

// ── Internal helpers ──────────────────────────────────────────────────────────

async function getMappingValue(mapping: string, key: string): Promise<string | null> {
  try {
    const value = await getAleoClient().getProgramMappingValue(
      SYSTEM_PROGRAMS.tokenRegistry,
      mapping,
      key,
    );
    return value ? String(value) : null;
  } catch {
    return null;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Fetch on-chain token metadata from registered_tokens[tokenId].
 * Returns TokenInfo (from @fairdrop/types/domain); null if not registered.
 */
export async function fetchTokenInfo(tokenId: string): Promise<TokenInfo | null> {
  const raw = await getMappingValue('registered_tokens', tokenId);
  if (!raw) return null;
  try {
    return parseTokenInfo(raw);
  } catch {
    return null;
  }
}

/**
 * Fetch the public balance for (account, tokenId).
 * Tries authorized_balances first, falls back to balances.
 * Returns a TokenBalance enriched with symbol/decimals from the provided TokenInfo,
 * or null if the account has no balance or the hash computation fails.
 */
export async function fetchTokenBalance(
  account: string,
  tokenId: string,
  info: TokenInfo,
): Promise<TokenBalance | null> {
  let key: string;
  try {
    key = computeTokenOwnerKey(account, tokenId);
  } catch {
    return null;
  }

  const raw =
    (await getMappingValue('authorized_balances', key)) ??
    (await getMappingValue('balances', key));

  if (!raw) return null;
  try {
    const parsed = parseRawTokenBalance(raw);
    return {
      tokenId:  parsed.tokenId,
      symbol:   info.symbol,
      amount:   parsed.amount,
      decimals: info.decimals,
    };
  } catch {
    return null;
  }
}

/**
 * Fetch the role number assigned to `account` for `tokenId`.
 * Returns: 1=Minter, 2=Burner, 3=SupplyManager, null=no role.
 */
export async function fetchTokenRole(account: string, tokenId: string): Promise<number | null> {
  let key: string;
  try {
    key = computeTokenOwnerKey(account, tokenId);
  } catch {
    return null;
  }
  const raw = await getMappingValue('roles', key);
  if (!raw) return null;
  const n = parseInt(raw.replace(/u\d+$/, ''), 10);
  return isNaN(n) ? null : n;
}

/**
 * Fetch the public credits.aleo balance for an address (microcredits).
 * Returns null if the address has no public balance.
 */
export async function fetchCreditsBalance(account: string): Promise<bigint | null> {
  try {
    const value = await getAleoClient().getProgramMappingValue(
      SYSTEM_PROGRAMS.credits,
      'account',
      account,
    );
    if (!value) return null;
    return BigInt(String(value).replace(/u64$/, ''));
  } catch {
    return null;
  }
}

