/**
 * Indexer chain-reading layer.
 *
 * All mapping reads go through the single AleoRpcClient instance (rate-limited,
 * retry-on-429). Call initChain(rpc) once at startup before using any fetcher.
 *
 * Keeps all chain I/O in one place — handlers never import AleoRpcClient directly.
 */

import { AleoRpcClient } from '../client/rpc.js';
import {
  parseStruct,
  parseField,
  parseAddress,
  parseU8,
  parseU16,
  parseU32,
  parseU128,
  parseBool,
  parseCreatorReputation,
} from '@fairdrop/sdk/parse';
import { asField, asAddress, asU128 } from '@fairdrop/types/primitives';
import { PROGRAMS }    from '@fairdrop/config';
import type { FlatAuctionConfig, FlatAuctionState } from '../types/chain.js';
import type { U128, U32, U16 } from '@fairdrop/types/primitives';
import type { CreatorReputation } from '@fairdrop/types/contracts/utilities';

// ── Singleton ─────────────────────────────────────────────────────────────────

let _rpc: AleoRpcClient | null = null;

export function initChain(rpc: AleoRpcClient): void {
  _rpc = rpc;
}

function getRpc(): AleoRpcClient {
  if (!_rpc) throw new Error('[indexer/chain] Call initChain(rpc) before any chain read.');
  return _rpc;
}

async function getRaw(
  programId: string,
  mapping:   string,
  key:       string,
): Promise<string | null> {
  return getRpc().getMappingValue(programId, mapping, key);
}

// ── Parsers ───────────────────────────────────────────────────────────────────

function parseFlatConfig(raw: string): FlatAuctionConfig {
  const p = parseStruct(raw);

  const u128    = (k: string, fb = '0u128'): U128         => asU128(parseU128(p[k] ?? fb));
  const u128opt = (k: string): U128 | undefined            => p[k] ? asU128(parseU128(p[k]!)) : undefined;
  const u32opt  = (k: string): U32  | undefined            => p[k] ? parseU32(p[k]!) : undefined;
  const u16opt  = (k: string): U16  | undefined            => p[k] ? parseU16(p[k]!) : undefined;

  return {
    // Common — same pattern as parseBaseAuctionConfig in the SDK
    auction_id:        asField(parseField(p['auction_id'] ?? '0field')),
    creator:           asAddress(parseAddress(p['creator'] ?? '')),
    sale_token_id:     asField(parseField(p['sale_token_id'] ?? '0field')),
    payment_token_id:  asField(parseField(p['payment_token_id'] ?? '0field')),
    supply:            u128('supply'),
    start_block:       parseU32(p['start_block'] ?? '0u32'),
    end_block:         parseU32(p['end_block'] ?? '0u32'),
    max_bid_amount:    u128('max_bid_amount'),
    min_bid_amount:    u128('min_bid_amount'),
    sale_scale:        u128('sale_scale'),
    gate_mode:         parseU8(p['gate_mode'] ?? '0u8'),
    vest_enabled:      parseBool(p['vest_enabled'] ?? 'false'),
    vest_cliff_blocks: parseU32(p['vest_cliff_blocks'] ?? '0u32'),
    vest_end_blocks:   parseU32(p['vest_end_blocks'] ?? '0u32'),
    fee_bps:           parseU16(p['fee_bps'] ?? '0u16'),
    closer_reward:     u128('closer_reward'),
    referral_pool_bps: parseU16(p['referral_pool_bps'] ?? '0u16'),
    metadata_hash:     asField(parseField(p['metadata_hash'] ?? '0field')),
    fill_min_bps:      p['fill_min_bps'] ? parseU16(p['fill_min_bps']) : undefined,
    // Type-specific
    start_price:        u128opt('start_price'),
    floor_price:        u128opt('floor_price'),
    price_decay_blocks: u32opt('price_decay_blocks'),
    price_decay_amount: u128opt('price_decay_amount'),
    ceiling_price:      u128opt('ceiling_price'),
    price_rise_blocks:  u32opt('price_rise_blocks'),
    price_rise_amount:  u128opt('price_rise_amount'),
    extension_window:   u32opt('extension_window'),
    extension_blocks:   u32opt('extension_blocks'),
    max_end_block:      u32opt('max_end_block'),
    commit_end_block:   u32opt('commit_end_block'),
    slash_reward_bps:   u16opt('slash_reward_bps'),
    raise_target:       u128opt('raise_target'),
  };
}

function parseFlatState(raw: string): FlatAuctionState {
  const p    = parseStruct(raw);
  const u128 = (k: string): U128 => asU128(parseU128(p[k] ?? '0u128'));

  return {
    total_committed:     u128('total_committed'),
    total_payments:      u128('total_payments'),
    supply_met:          parseBool(p['supply_met'] ?? 'false'),
    ended_at_block:      parseU32(p['ended_at_block'] ?? '0u32'),
    cleared:             parseBool(p['cleared'] ?? 'false'),
    clearing_price:      u128('clearing_price'),
    creator_revenue:     u128('creator_revenue'),
    protocol_fee:        u128('protocol_fee'),
    voided:              parseBool(p['voided'] ?? 'false'),
    referral_budget:     u128('referral_budget'),
    effective_supply:    u128('effective_supply'),
    effective_end_block: p['effective_end_block'] ? parseU32(p['effective_end_block']) : undefined,
  };
}

// ── Public fetchers ───────────────────────────────────────────────────────────

export async function fetchFlatAuctionConfig(
  auctionId: string,
  programId: string,
): Promise<FlatAuctionConfig | null> {
  const raw = await getRaw(programId, 'auction_configs', auctionId);
  if (!raw) return null;
  try { return parseFlatConfig(raw); } catch { return null; }
}

export async function fetchFlatAuctionState(
  auctionId: string,
  programId: string,
): Promise<FlatAuctionState | null> {
  const raw = await getRaw(programId, 'auction_states', auctionId);
  if (!raw) return null;
  try { return parseFlatState(raw); } catch { return null; }
}

export async function fetchSqrtWeight(
  auctionId: string,
  programId: string,
): Promise<string | null> {
  const raw = await getRaw(programId, 'sqrt_weights', auctionId);
  if (!raw) return null;
  try { return parseU128(raw); } catch { return null; }
}

export async function fetchCreatorReputation(
  creator: string,
): Promise<CreatorReputation | null> {
  const raw = await getRaw(PROGRAMS.proof.programId, 'reputation', creator);
  if (!raw) return null;
  try { return parseCreatorReputation(raw); } catch { return null; }
}
