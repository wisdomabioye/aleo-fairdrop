/**
 * Generic auction upsert handler — works for any auction program type
 * (dutch, sealed, raise, ascending, lbp, quadratic).
 *
 * Every transition that touches auction state collapses to a single operation:
 *   1. Fetch current on-chain config + state from mappings.
 *   2. Upsert the auctions row (insert on create, update on subsequent transitions).
 *
 * Bid / claim / vesting tracking is intentionally out of scope.
 * Users see their private Bid records via their connected wallet.
 *
 * programId and auctionType are injected at registry build time via
 * createProgramHandlerMap(). No program IDs are hardcoded here.
 */
import { auctions }                              from '@fairdrop/database';
import {
  parseAddress, parseBool, parseField,
  parseStruct, parseU128, parseU16, parseU32, parseU8,
} from '@fairdrop/sdk/parse';
import type { AleoRpcClient }                    from '../client/rpc.js';
import type { AleoTransition, FinalizeOperation } from '../types/aleo.js';
import type { TransitionContext }                from './types.js';

// ── Mapping names — must match on-chain program exactly ──────────────────────

const MAPPING_CONFIGS = 'auction_configs';
const MAPPING_STATES  = 'auction_states';

// ── Handler types ─────────────────────────────────────────────────────────────

export type TransitionHandlerFn = (ctx: TransitionContext, auctionId: string) => Promise<void>;

export type AuctionIdExtractor = (
  transition:  AleoTransition,
  finalizeOps: FinalizeOperation[],
) => string | null;

export interface HandlerEntry {
  getAuctionId: AuctionIdExtractor;
  handle:       TransitionHandlerFn;
}

/** Flat map of transition name → handler entry. Processor dispatches blindly. */
export type ProgramHandlerMap = Record<string, HandlerEntry>;

// ── Auction-id extractors ─────────────────────────────────────────────────────

/**
 * Resolve auction_id from finalize mapping operations.
 * Used for create_auction — the auction_id is the key inserted into
 * auction_configs in the finalize block, not a direct public input.
 *
 * NOTE: The Aleo REST API may expose key as plaintext or as a hash ID.
 * If only hash IDs are available this will return null; in that case
 * a getMappingValue fallback would be needed (verify against a live node).
 */
function auctionIdFromFinalizeOps(
  _transition: AleoTransition,
  ops:         FinalizeOperation[],
): string | null {
  const op = ops.find((o) => o.key != null && o.mapping_id?.includes(MAPPING_CONFIGS));
  return op?.key ?? null;
}

/**
 * Resolve auction_id from writes to `auction_states` in finalize ops.
 * Used for transitions where auction_id is not a public input (e.g. reveal_bid
 * receives the auction_id only via the private Commitment record).
 */
function auctionIdFromStateFinalizeOps(
  _transition: AleoTransition,
  ops:         FinalizeOperation[],
): string | null {
  const op = ops.find((o) => o.key != null && o.mapping_id?.includes(MAPPING_STATES));
  return op?.key ?? null;
}

/**
 * Resolve auction_id from the first public field-typed input.
 * Scans all inputs and returns the value of the first one whose Leo string
 * ends with the "field" suffix (e.g. "12345field").
 *
 * This handles transitions where the Bid record is inputs[0] (private, no
 * value) and auction_id is a later positional input — e.g. place_bid_private.
 */
function auctionIdFromPublicInput(
  transition: AleoTransition,
  _ops:       FinalizeOperation[],
): string | null {
  for (const input of transition.inputs) {
    if (input.value?.trim().endsWith('field')) {
      return parseField(input.value);
    }
  }
  return null;
}

// ── Mapping readers ───────────────────────────────────────────────────────────

async function fetchConfig(rpc: AleoRpcClient, programId: string, auctionId: string) {
  const raw = await rpc.getMappingValue(programId, MAPPING_CONFIGS, `${auctionId}field`);
  if (!raw) return null;
  const f = parseStruct(raw);

  // Helper: parse optional field (absent in stub programs or future auction types)
  const optField   = (k: string) => f[k] ? parseField(f[k]!)   : null;
  const optU128    = (k: string) => f[k] ? parseU128(f[k]!)    : null;
  const optU32     = (k: string) => f[k] ? parseU32(f[k]!)     : null;

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

async function fetchState(rpc: AleoRpcClient, programId: string, auctionId: string) {
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

// ── Core upsert ───────────────────────────────────────────────────────────────

async function upsertAuction(
  ctx:         TransitionContext,
  programId:   string,
  auctionType: string,
  auctionId:   string,
): Promise<void> {
  const { db, rpc, blockHeight, timestamp } = ctx;

  const [config, state] = await Promise.all([
    fetchConfig(rpc, programId, auctionId),
    fetchState(rpc, programId, auctionId),
  ]);

  if (!config || !state) {
    console.error(
      `[${auctionType}] upsertAuction: mapping read failed for ${auctionId} ` +
      `(config=${!!config}, state=${!!state}) — skipping`,
    );
    return;
  }

  // Status vocabulary matches DESIGN.md: 'live' | 'cleared' | 'voided'
  // 'ended' (time-expired, not-yet-closed) is computed by the API from end_block vs current block.
  const status = state.voided ? 'voided' : state.cleared ? 'cleared' : 'live';
  // ended_at_block is 0 when the auction hasn't ended yet; store null.
  const endedAtBlock = state.ended_at_block > 0 ? state.ended_at_block : null;

  await db
    .insert(auctions)
    .values({
      id:               auctionId,
      type:             auctionType,
      programId,
      creator:          config.creator,
      metadataHash:     config.metadata_hash,
      saleTokenId:      config.sale_token_id,
      paymentTokenId:   config.payment_token_id,
      supply:           config.supply,
      totalCommitted:   state.total_committed,
      totalPayments:    state.total_payments,
      status,
      supplyMet:        state.supply_met,
      cleared:          state.cleared,
      voided:           state.voided,
      startPrice:       config.start_price,
      floorPrice:       config.floor_price,
      clearingPrice:    state.clearing_price,
      priceDecayBlocks: config.price_decay_blocks,
      priceDecayAmount: config.price_decay_amount,
      minBidAmount:     config.min_bid_amount,
      maxBidAmount:     config.max_bid_amount,
      saleScale:        config.sale_scale,
      startBlock:       config.start_block,
      endBlock:         config.end_block,
      endedAtBlock,
      creatorRevenue:   state.creator_revenue,
      protocolFee:      state.protocol_fee,
      referralBudget:   state.referral_budget,
      configJson:       config as unknown as Record<string, unknown>,
      stateJson:        state  as unknown as Record<string, unknown>,
      feeBps:           config.fee_bps,
      closerReward:     config.closer_reward,
      gateMode:         config.gate_mode,
      vestEnabled:      config.vest_enabled,
      vestCliffBlocks:  config.vest_cliff_blocks,
      vestEndBlocks:    config.vest_end_blocks,
      createdAtBlock:   blockHeight,
      createdAt:        timestamp,
      updatedAt:        timestamp,
    })
    .onConflictDoUpdate({
      target: auctions.id,
      set: {
        // State fields — refreshed on every transition.
        totalCommitted:  state.total_committed,
        totalPayments:   state.total_payments,
        status,
        supplyMet:       state.supply_met,
        cleared:         state.cleared,
        voided:          state.voided,
        clearingPrice:   state.clearing_price,
        endedAtBlock,
        creatorRevenue:  state.creator_revenue,
        protocolFee:     state.protocol_fee,
        referralBudget:  state.referral_budget,
        stateJson:       state as unknown as Record<string, unknown>,
        updatedAt:       timestamp,
        // Config snapshot refreshed on conflict — harmless since config is immutable.
        configJson:      config as unknown as Record<string, unknown>,
      },
    });
}

// ── Handler map factory ───────────────────────────────────────────────────────

/**
 * Builds a flat ProgramHandlerMap for a single auction program.
 *
 * Only transitions that affect auction-level state are registered:
 *   create_auction     — inserts the auctions row; creator from auction_configs mapping.
 *   close_auction      — refreshes state (cleared, clearing_price, revenue).
 *   cancel_auction     — refreshes state (voided).
 *   place_bid_*        — refreshes state (total_committed) so the UI stays current.
 *
 * claim / claim_vested / claim_voided are intentionally absent: they operate
 * on private Bid records whose auction_id is not recoverable from on-chain data.
 *
 * Adding a new auction type: call createProgramHandlerMap with the new type
 * name and programId. No changes needed to the processor.
 */
export function createProgramHandlerMap(
  auctionType: string,
  programId:   string,
): ProgramHandlerMap {
  const upsert: TransitionHandlerFn = (ctx, auctionId) =>
    upsertAuction(ctx, programId, auctionType, auctionId);

  const fromInput    = auctionIdFromPublicInput;
  const fromFinalize = auctionIdFromFinalizeOps;
  const fromState    = auctionIdFromStateFinalizeOps;

  const base: ProgramHandlerMap = {
    create_auction:         { getAuctionId: fromFinalize, handle: upsert },
    close_auction:          { getAuctionId: fromInput,    handle: upsert },
    cancel_auction:         { getAuctionId: fromInput,    handle: upsert },
    place_bid_private:      { getAuctionId: fromInput,    handle: upsert },
    place_bid_public:       { getAuctionId: fromInput,    handle: upsert },
    place_bid_private_ref:  { getAuctionId: fromInput,    handle: upsert },
    place_bid_public_ref:   { getAuctionId: fromInput,    handle: upsert },
  };

  // Sealed auctions replace place_bid_* with commit/reveal transitions.
  // slash_unrevealed is not registered — it does not modify auction_states.
  if (auctionType === 'sealed') {
    return {
      ...base,
      commit_bid_private:     { getAuctionId: fromInput, handle: upsert },
      commit_bid_public:      { getAuctionId: fromInput, handle: upsert },
      commit_bid_private_ref: { getAuctionId: fromInput, handle: upsert },
      commit_bid_public_ref:  { getAuctionId: fromInput, handle: upsert },
      // reveal_bid: auction_id only in private Commitment record; extract from state ops.
      reveal_bid:             { getAuctionId: fromState, handle: upsert },
    };
  }

  return base;
}
