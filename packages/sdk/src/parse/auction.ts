/**
 * Struct parsers for fairdrop auction contract mapping values.
 *
 * Each function accepts a raw Leo struct string returned by getProgramMappingValue
 * and returns the corresponding TypeScript type from @fairdrop/types.
 *
 * Also exports buildAuctionParams — converts a stored DB row into the discriminated
 * AuctionParams view-model (extracted from the API mapper so the switch lives once).
 */

import type { BaseAuctionConfig, AuctionState, AuctionStats } from '@fairdrop/types/contracts/auctions';
import type { ProtocolConfig } from '@fairdrop/types/contracts/utilities';
import type { AuctionParams }  from '@fairdrop/types/domain';
import { AuctionType }         from '@fairdrop/types/domain';
import { asField, asAddress, asU128, asU64 } from '@fairdrop/types/primitives';
import {
  parseStruct,
  parseField,
  parseAddress,
  parseU8,
  parseU16,
  parseU32,
  parseU128,
  parseBool,
} from './leo';

/**
 * Parse the common BaseAuctionConfig fields from any auction's auction_configs mapping.
 * Mechanism-specific fields (e.g. DutchParams) are present in the raw struct but
 * not extracted here — use type-specific parsers when needed.
 */
export function parseBaseAuctionConfig(raw: string): BaseAuctionConfig {
  const p = parseStruct(raw);
  return {
    auction_id:        asField(parseField(p['auction_id'] ?? '0field')),
    creator:           asAddress(parseAddress(p['creator'] ?? '')),
    sale_token_id:     asField(parseField(p['sale_token_id'] ?? '0field')),
    payment_token_id:  asField(parseField(p['payment_token_id'] ?? '0field')),
    supply:            asU128(parseU128(p['supply'] ?? '0u128')),
    start_block:       parseU32(p['start_block'] ?? '0u32'),
    end_block:         parseU32(p['end_block'] ?? '0u32'),
    max_bid_amount:    asU128(parseU128(p['max_bid_amount'] ?? '0u128')),
    min_bid_amount:    asU128(parseU128(p['min_bid_amount'] ?? '0u128')),
    sale_scale:        asU128(parseU128(p['sale_scale'] ?? '0u128')),
    gate_mode:         parseU8(p['gate_mode'] ?? '0u8'),
    vest_enabled:      parseBool(p['vest_enabled'] ?? 'false'),
    vest_cliff_blocks: parseU32(p['vest_cliff_blocks'] ?? '0u32'),
    vest_end_blocks:   parseU32(p['vest_end_blocks'] ?? '0u32'),
    fee_bps:           parseU16(p['fee_bps'] ?? '0u16'),
    closer_reward:     asU128(parseU128(p['closer_reward'] ?? '0u128')),
    referral_pool_bps: parseU16(p['referral_pool_bps'] ?? '0u16'),
    metadata_hash:     asField(parseField(p['metadata_hash'] ?? '0field')),
  };
}

/** Parse an AuctionState struct from any auction's auction_states mapping. */
export function parseAuctionState(raw: string): AuctionState {
  const p = parseStruct(raw);
  return {
    total_committed: asU128(parseU128(p['total_committed'] ?? '0u128')),
    total_payments:  asU128(parseU128(p['total_payments']  ?? '0u128')),
    supply_met:      parseBool(p['supply_met']     ?? 'false'),
    ended_at_block:  parseU32(p['ended_at_block']  ?? '0u32'),
    cleared:         parseBool(p['cleared']         ?? 'false'),
    clearing_price:  asU128(parseU128(p['clearing_price'] ?? '0u128')),
    creator_revenue: asU128(parseU128(p['creator_revenue'] ?? '0u128')),
    protocol_fee:    asU128(parseU128(p['protocol_fee']    ?? '0u128')),
    voided:          parseBool(p['voided'] ?? 'false'),
    referral_budget:  asU128(parseU128(p['referral_budget']   ?? '0u128')),
    // Raise + Quadratic only — present only after cleared close; zero for other types.
    effective_supply: asU128(parseU128(p['effective_supply']  ?? '0u128')),
  };
}

/** Parse the Stats struct from any auction's stats[0field] mapping. */
export function parseAuctionStats(raw: string): AuctionStats {
  const p = parseStruct(raw);
  return {
    // U64 is a branded decimal string — strip the suffix, cast to U64.
    total_auctions:          asU64(parseU128(p['total_auctions'] ?? '0u64')),
    total_bids:              asU64(parseU128(p['total_bids'] ?? '0u64')),
    total_payment_collected: asU128(parseU128(p['total_payment_collected'] ?? '0u128')),
  };
}

// ── Params builder ────────────────────────────────────────────────────────────

/**
 * Minimal row shape required by buildAuctionParams. Satisfied by AuctionRow.
 * Dutch / Ascending / Sealed use flat price columns; LBP likewise.
 * Sealed + configJson carry commit_end_block + slash_reward_bps.
 */
export interface ParamsRow {
  type:             string;
  startPrice:       string | null;
  floorPrice:       string | null;
  priceDecayBlocks: number | null;
  priceDecayAmount: string | null;
  ceilingPrice:     string | null;
  priceRiseBlocks:  number | null;
  priceRiseAmount:  string | null;
  extensionWindow:  number | null;
  extensionBlocks:  number | null;
  maxEndBlock:      number | null;
  raiseTarget:      string | null;
  fillMinBps:       number | null;   // Raise + Quadratic flat column
  commitEndBlock:   number | null;   // Sealed flat column
  configJson:       unknown;         // Full config snapshot — used for slash_reward_bps (no flat column)
}

/**
 * Build the discriminated AuctionParams view-model from a stored row.
 * Dutch / Ascending / Sealed / LBP use flat price columns.
 * Sealed additionally reads commit_end_block + slash_reward_bps from configJson.
 * Raise + Quadratic derive their targets from flat columns.
 */
export function buildAuctionParams(row: ParamsRow): AuctionParams {
  const cfg = (row.configJson ?? {}) as Record<string, unknown>;

  switch (row.type as AuctionType) {
    case AuctionType.Dutch:
      return {
        type:               AuctionType.Dutch,
        start_price:        asU128(row.startPrice!),
        floor_price:        asU128(row.floorPrice!),
        price_decay_blocks: row.priceDecayBlocks!,
        price_decay_amount: asU128(row.priceDecayAmount!),
      };

    case AuctionType.Sealed:
      return {
        type:               AuctionType.Sealed,
        start_price:        asU128(row.startPrice!),
        floor_price:        asU128(row.floorPrice!),
        price_decay_blocks: row.priceDecayBlocks!,
        price_decay_amount: asU128(row.priceDecayAmount!),
        commit_end_block:   row.commitEndBlock ?? 0,
        slash_reward_bps:   Number(cfg.slash_reward_bps  ?? 0),  // no flat column
      };

    case AuctionType.Raise:
      return {
        type:         AuctionType.Raise,
        raise_target: asU128(row.raiseTarget ?? '0'),
      };

    case AuctionType.Ascending:
      return {
        type:              AuctionType.Ascending,
        floor_price:       asU128(row.floorPrice!),
        ceiling_price:     asU128(row.ceilingPrice!),
        price_rise_blocks: row.priceRiseBlocks!,
        price_rise_amount: asU128(row.priceRiseAmount!),
        extension_window:  row.extensionWindow ?? 0,
        extension_blocks:  row.extensionBlocks ?? 0,
        max_end_block:     row.maxEndBlock      ?? 0,
      };

    case AuctionType.Lbp:
      return {
        type:        AuctionType.Lbp,
        start_price: asU128(row.startPrice ?? '0'),
        floor_price: asU128(row.floorPrice ?? '0'),
      };

    case AuctionType.Quadratic:
      return {
        type:          AuctionType.Quadratic,
        raise_target:  asU128(row.raiseTarget ?? '0'),
        fill_min_bps:  row.fillMinBps ?? 0,
      };

    default: {
      const _exhaustive: never = row.type as never;
      throw new Error(`[buildAuctionParams] unhandled AuctionType: ${_exhaustive}`);
    }
  }
}

/** Parse a ProtocolConfig struct from fairdrop_config_v2.aleo. */
export function parseProtocolConfig(raw: string): ProtocolConfig {
  const p = parseStruct(raw);
  return {
    fee_bps:              parseU16(p['fee_bps']              ?? '0u16'),
    creation_fee:         asU128(parseU128(p['creation_fee']         ?? '0u128')),
    closer_reward:        asU128(parseU128(p['closer_reward']        ?? '0u128')),
    slash_reward_bps:     parseU16(p['slash_reward_bps']     ?? '0u16'),
    min_auction_duration: parseU32(p['min_auction_duration'] ?? '0u32'),
    referral_pool_bps:    parseU16(p['referral_pool_bps']    ?? '0u16'),
    max_referral_bps:     parseU16(p['max_referral_bps']     ?? '0u16'),
  };
}
