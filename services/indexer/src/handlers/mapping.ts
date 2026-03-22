/**
 * On-chain mapping readers for auction programs.
 *
 * Each function fetches a single mapping entry and parses its Leo struct into
 * a typed object. All fields are optional-safe: type-specific fields absent
 * in some auction variants return null rather than throwing.
 *
 * Mapping keys always take the form "<auction_id>field" (Leo field literal).
 */
import {
  parseAddress, parseBool, parseField,
  parseStruct, parseU128, parseU16, parseU32, parseU8,
} from '@fairdrop/sdk/parse';
import type { AleoRpcClient } from '../client/rpc.js';

const MAPPING_CONFIGS = 'auction_configs';
const MAPPING_STATES  = 'auction_states';

/** All fields present in the auction_configs mapping entry. */
export type AuctionConfig = Awaited<ReturnType<typeof fetchConfig>>;

/** All fields present in the auction_states mapping entry. */
export type AuctionState = Awaited<ReturnType<typeof fetchState>>;

export async function fetchConfig(
  rpc:       AleoRpcClient,
  programId: string,
  auctionId: string,
) {
  const raw = await rpc.getMappingValue(programId, MAPPING_CONFIGS, `${auctionId}field`);
  if (!raw) return null;
  const f = parseStruct(raw);

  const optField = (k: string) => f[k] ? parseField(f[k]!)  : null;
  const optU128  = (k: string) => f[k] ? parseU128(f[k]!)   : null;
  const optU32   = (k: string) => f[k] ? parseU32(f[k]!)    : null;

  return {
    auction_id:         parseField(f['auction_id']!),
    creator:            parseAddress(f['creator']!),
    sale_token_id:      parseField(f['sale_token_id']!),
    payment_token_id:   parseField(f['payment_token_id']!),
    supply:             parseU128(f['supply']!),
    start_block:        parseU32(f['start_block']!),
    end_block:          parseU32(f['end_block']!),
    gate_mode:          parseU8(f['gate_mode']!),
    vest_enabled:       parseBool(f['vest_enabled']!),
    vest_cliff_blocks:  parseU32(f['vest_cliff_blocks']!),
    vest_end_blocks:    parseU32(f['vest_end_blocks']!),
    fee_bps:            parseU16(f['fee_bps']!),
    closer_reward:      parseU128(f['closer_reward']!),
    referral_pool_bps:  parseU16(f['referral_pool_bps']!),
    // Optional — present in Dutch/Sealed/Ascending, absent in Raise/Quadratic
    metadata_hash:      optField('metadata_hash'),
    start_price:        optU128('start_price'),
    floor_price:        optU128('floor_price'),
    price_decay_blocks: optU32('price_decay_blocks'),
    price_decay_amount: optU128('price_decay_amount'),
    min_bid_amount:     optU128('min_bid_amount'),
    max_bid_amount:     optU128('max_bid_amount'),
    sale_scale:         optU128('sale_scale'),
    // Ascending-specific
    ceiling_price:      optU128('ceiling_price'),
    price_rise_blocks:  optU32('price_rise_blocks'),
    price_rise_amount:  optU128('price_rise_amount'),
    // Sealed-specific
    commit_end_block:   optU32('commit_end_block'),
    slash_reward_bps:   f['slash_reward_bps'] ? parseU16(f['slash_reward_bps']!) : null,
    // Raise-specific
    raise_target:       optU128('raise_target'),
  };
}

export async function fetchState(
  rpc:       AleoRpcClient,
  programId: string,
  auctionId: string,
) {
  const raw = await rpc.getMappingValue(programId, MAPPING_STATES, `${auctionId}field`);
  if (!raw) return null;
  const f = parseStruct(raw);
  return {
    total_committed: parseU128(f['total_committed']!),
    total_payments:  parseU128(f['total_payments']!),
    supply_met:      parseBool(f['supply_met']!),
    ended_at_block:  parseU32(f['ended_at_block']!),
    cleared:         parseBool(f['cleared']!),
    clearing_price:  parseU128(f['clearing_price']!),
    creator_revenue: parseU128(f['creator_revenue']!),
    protocol_fee:    parseU128(f['protocol_fee']!),
    voided:          parseBool(f['voided']!),
    referral_budget: parseU128(f['referral_budget']!),
  };
}
