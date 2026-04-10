/**
 * On-chain mapping reads for fairswap_dex_v2.aleo.
 *
 * All functions return null (or 0n for balances) on miss or RPC error.
 * Key derivation (computePoolKey, computeLpBalKey, computeProtocolFeeKey)
 * requires @provablehq/sdk WASM to be loaded.
 */

import { PROGRAMS } from '@fairdrop/config';
import { getMappingValue } from '../chain/_mapping';
import { parseStruct, parseField, parseU16, parseU32, parseU128, u128ToBigInt } from '../parse/leo';
import { computePoolKey, computeLpBalKey, computeProtocolFeeKey } from '../hash/keys';

const DEX_PROGRAM = PROGRAMS.fairswap.programId;

// ── Domain type ───────────────────────────────────────────────────────────────

/** Camelcase pool state as returned by fetchPool. Fields are JS-native types. */
export interface PoolState {
  tokenA:    string;   // field literal — canonical lesser ID
  tokenB:    string;   // field literal — canonical greater ID
  reserveA:  bigint;
  reserveB:  bigint;
  lpSupply:  bigint;
  feeBps:    number;
  priceACum: bigint;
  priceBCum: bigint;
  lastBlock: number;
}

// ── Reads ─────────────────────────────────────────────────────────────────────

/**
 * Fetch the pool state for a (tokenA, tokenB) pair.
 * Canonical ordering is applied automatically — token order does not matter.
 * Returns null if the pool does not exist.
 */
export async function fetchPool(tokenA: string, tokenB: string): Promise<PoolState | null> {
  let poolKey: string;
  try { poolKey = computePoolKey(tokenA, tokenB); }
  catch { return null; }

  const raw = await getMappingValue(DEX_PROGRAM, 'pools', poolKey);
  if (!raw) return null;
  try { return parsePoolState(raw); } catch { return null; }
}

/**
 * Fetch the public LP balance for a (holder, poolKey) pair.
 * Returns 0n if the holder has no balance.
 *
 * Use computePoolKey() to derive poolKey from token IDs.
 */
export async function fetchLpBalance(holder: string, poolKey: string): Promise<bigint> {
  let key: string;
  try { key = computeLpBalKey(holder, poolKey); }
  catch { return 0n; }

  const raw = await getMappingValue(DEX_PROGRAM, 'lp_balances', key);
  return raw ? u128ToBigInt(parseU128(raw)) : 0n;
}

/**
 * Fetch accumulated protocol fees for a (poolKey, tokenId) pair.
 * Fees accrue in the input token — query once per token side if needed.
 * Returns 0n if no fees have accrued.
 */
export async function fetchProtocolFees(poolKey: string, tokenId: string): Promise<bigint> {
  let key: string;
  try { key = computeProtocolFeeKey(poolKey, tokenId); }
  catch { return 0n; }

  const raw = await getMappingValue(DEX_PROGRAM, 'protocol_fees', key);
  return raw ? u128ToBigInt(parseU128(raw)) : 0n;
}

/**
 * Fetch whether the DEX is paused.
 * Returns false if the mapping has no entry (not paused).
 */
export async function fetchDexPaused(): Promise<boolean> {
  const raw = await getMappingValue(DEX_PROGRAM, 'paused', '0field');
  return raw?.trim() === 'true';
}

// ── Parser ────────────────────────────────────────────────────────────────────

function parsePoolState(raw: string): PoolState {
  const p = parseStruct(raw);
  return {
    tokenA:    `${parseField(p['token_a']    ?? '0field')}field`,
    tokenB:    `${parseField(p['token_b']    ?? '0field')}field`,
    reserveA:  u128ToBigInt(parseU128(p['reserve_a']   ?? '0u128')),
    reserveB:  u128ToBigInt(parseU128(p['reserve_b']   ?? '0u128')),
    lpSupply:  u128ToBigInt(parseU128(p['lp_supply']   ?? '0u128')),
    feeBps:    parseU16(p['fee_bps']    ?? '0u16'),
    priceACum: u128ToBigInt(parseU128(p['price_a_cum'] ?? '0u128')),
    priceBCum: u128ToBigInt(parseU128(p['price_b_cum'] ?? '0u128')),
    lastBlock: parseU32(p['last_block'] ?? '0u32'),
  };
}
