/**
 * Generic auction upsert handler — works for any auction program type
 * (dutch, sealed, raise, ascending, lbp, quadratic).
 *
 * Every registered transition collapses to a single operation:
 *   1. Fetch current on-chain config + state from mappings.
 *   2. Upsert the auctions row (insert on create, update on subsequent transitions).
 *
 * Bid / claim / vesting tracking is intentionally out of scope.
 * Users see their private Bid records via their connected wallet.
 *
 * Adding a new auction type: call createProgramHandlerMap with the new type
 * name and programId. No changes needed to the processor.
 */
import { auctions }                           from '@fairdrop/database';
import { AuctionType }                        from '@fairdrop/types/domain';
import { createLogger }                       from '../logger.js';
import { fetchConfig, fetchState }            from './mapping.js';
import { auctionIdFromPublicInput,
         auctionIdFromFinalizeKey }           from './extractors.js';
import type {
  HandlerEntry,
  ProgramHandlerMap,
  TransitionContext,
  TransitionHandlerFn,
} from './types.js';

export type { HandlerEntry, ProgramHandlerMap, TransitionHandlerFn };

// ── DB status vocabulary ──────────────────────────────────────────────────────
//
// The DB stores the on-chain-derivable status only: 'live' | 'cleared' | 'voided'.
// The three computed statuses in AuctionStatus ('upcoming', 'clearing', 'ended')
// are derived by the API from block height vs start_block / end_block / supply_met
// and never stored on disk.
//
//   DB 'live'    → API upcoming | active | clearing  (depends on current block)
//   DB 'cleared' → API cleared
//   DB 'voided'  → API voided

type DbStatus = 'live' | 'cleared' | 'voided';

// ── Core upsert ───────────────────────────────────────────────────────────────

const log = createLogger('auction');

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
    // Throw so the DB transaction rolls back and the block is retried on the next tick.
    // A null return from getMappingValue means the mapping key wasn't found — this should
    // never happen for a transition that just wrote the key in the same block. If it does,
    // it's a transient RPC error and retrying is correct.
    throw new Error(
      `[${auctionType}] mapping read returned null for auction ${auctionId} ` +
      `(config=${!!config}, state=${!!state}) — will retry`,
    );
  }

  const status: DbStatus = state.voided ? 'voided' : state.cleared ? 'cleared' : 'live';
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
        stateJson:       state  as unknown as Record<string, unknown>,
        updatedAt:       timestamp,
        // Config is immutable; refresh snapshot is harmless.
        configJson:      config as unknown as Record<string, unknown>,
      },
    });
}

// ── Handler map factory ───────────────────────────────────────────────────────

/**
 * Transitions intentionally not registered (auction_id unrecoverable from chain):
 *   claim, claim_vested, claim_voided — consume private Bid records.
 *
 * Transitions not registered because they don't change auction-level state:
 *   push_referral_budget, withdraw_payments, withdraw_unsold.
 *
 * If any of these appear in a known program's block, processor.ts will emit
 * a debug-level log rather than a warning — they are expected gaps.
 */
export const KNOWN_UNHANDLED_TRANSITIONS = new Set([
  'claim',
  'claim_vested',
  'claim_voided',
  'push_referral_budget',
  'withdraw_payments',
  'withdraw_unsold',
]);

export function createProgramHandlerMap(
  auctionType: string,
  programId:   string,
): ProgramHandlerMap {
  const upsert: TransitionHandlerFn = (ctx, auctionId) =>
    upsertAuction(ctx, programId, auctionType, auctionId);

  const base: ProgramHandlerMap = {
    create_auction:         { getAuctionId: auctionIdFromFinalizeKey,   handle: upsert },
    close_auction:          { getAuctionId: auctionIdFromPublicInput,   handle: upsert },
    cancel_auction:         { getAuctionId: auctionIdFromPublicInput,   handle: upsert },
    place_bid_private:      { getAuctionId: auctionIdFromPublicInput,   handle: upsert },
    place_bid_public:       { getAuctionId: auctionIdFromPublicInput,   handle: upsert },
    place_bid_private_ref:  { getAuctionId: auctionIdFromPublicInput,   handle: upsert },
    place_bid_public_ref:   { getAuctionId: auctionIdFromPublicInput,   handle: upsert },
  };

  // Sealed auctions replace place_bid_* with commit/reveal transitions.
  // slash_unrevealed does not modify auction_states — not registered.
  if (auctionType === AuctionType.Sealed) {
    return {
      ...base,
      commit_bid_private:     { getAuctionId: auctionIdFromPublicInput, handle: upsert },
      commit_bid_public:      { getAuctionId: auctionIdFromPublicInput, handle: upsert },
      commit_bid_private_ref: { getAuctionId: auctionIdFromPublicInput, handle: upsert },
      commit_bid_public_ref:  { getAuctionId: auctionIdFromPublicInput, handle: upsert },
      // reveal_bid: auction_id only in private Commitment record; extract from finalize key.
      reveal_bid:             { getAuctionId: auctionIdFromFinalizeKey, handle: upsert },
    };
  }

  return base;
}
