/**
 * Auction struct parsers — shared between indexer (Node) and frontend (browser).
 *
 * Returns types from @fairdrop/types/contracts/auctions — no local redefinition.
 * Branded scalar casts (asField, asU128 …) are the adapter between raw Leo strings
 * and the strongly-typed contract interfaces.
 */

import type { BaseAuctionConfig, AuctionState, AuctionStats } from '@fairdrop/types/contracts/auctions';
import { asField, asAddress, asU128, asU64 } from '@fairdrop/types/primitives';
import {
  parseStruct,
  parseField,
  parseAddress,
  parseU8,
  parseU16,
  parseU32,
  parseBool,
  stripSuffix,
} from './leo';

/** Parse a raw Leo struct string into a BaseAuctionConfig. */
export function parseBaseAuctionConfig(raw: string): BaseAuctionConfig {
  const p = parseStruct(raw);
  return {
    auction_id:        asField(parseField(p['auction_id'] ?? '')),
    creator:           asAddress(parseAddress(p['creator'] ?? '')),
    sale_token_id:     asField(parseField(p['sale_token_id'] ?? '')),
    payment_token_id:  asField(parseField(p['payment_token_id'] ?? '')),
    supply:            asU128(stripSuffix(p['supply'] ?? '0')),
    start_block:       parseU32(p['start_block'] ?? '0u32'),
    end_block:         parseU32(p['end_block'] ?? '0u32'),
    max_bid_amount:    asU128(stripSuffix(p['max_bid_amount'] ?? '0')),
    min_bid_amount:    asU128(stripSuffix(p['min_bid_amount'] ?? '0')),
    sale_scale:        asU128(stripSuffix(p['sale_scale'] ?? '1')),
    gate_mode:         parseU8(p['gate_mode'] ?? '0u8'),
    vest_enabled:      parseBool(p['vest_enabled'] ?? 'false'),
    vest_cliff_blocks: parseU32(p['vest_cliff_blocks'] ?? '0u32'),
    vest_end_blocks:   parseU32(p['vest_end_blocks'] ?? '0u32'),
    fee_bps:           parseU16(p['fee_bps'] ?? '0u16'),
    closer_reward:     asU128(stripSuffix(p['closer_reward'] ?? '0')),
    referral_pool_bps: parseU16(p['referral_pool_bps'] ?? '0u16'),
    metadata_hash:     asField(parseField(p['metadata_hash'] ?? '0')),
  };
}

/** Parse a raw Leo struct string into an AuctionState. */
export function parseAuctionState(raw: string): AuctionState {
  const p = parseStruct(raw);
  return {
    total_committed: asU128(stripSuffix(p['total_committed'] ?? '0')),
    total_payments:  asU128(stripSuffix(p['total_payments'] ?? '0')),
    supply_met:      parseBool(p['supply_met'] ?? 'false'),
    ended_at_block:  parseU32(p['ended_at_block'] ?? '0u32'),
    cleared:         parseBool(p['cleared'] ?? 'false'),
    clearing_price:  asU128(stripSuffix(p['clearing_price'] ?? '0')),
    creator_revenue: asU128(stripSuffix(p['creator_revenue'] ?? '0')),
    protocol_fee:    asU128(stripSuffix(p['protocol_fee'] ?? '0')),
    voided:          parseBool(p['voided'] ?? 'false'),
    referral_budget: asU128(stripSuffix(p['referral_budget'] ?? '0')),
  };
}

/** Parse a raw Leo struct string into AuctionStats. */
export function parseAuctionStats(raw: string): AuctionStats {
  const p = parseStruct(raw);
  return {
    total_auctions:          asU64(stripSuffix(p['total_auctions'] ?? '0')),
    total_bids:              asU64(stripSuffix(p['total_bids'] ?? '0')),
    total_payment_collected: asU128(stripSuffix(p['total_payment_collected'] ?? '0')),
  };
}
