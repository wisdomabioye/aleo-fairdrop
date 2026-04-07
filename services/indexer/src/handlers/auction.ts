/**
 * Auction upsert handler — single concern: fetch config + state, write auction row.
 *
 * Returns FlatAuctionConfig so the caller (handlers/index.ts) can pass data to
 * other handlers (reputation, stats) without a second RPC round-trip.
 *
 * Intentionally knows nothing about reputation, stats, or other side effects.
 * That composition lives in handlers/index.ts.
 */

import { auctions }                        from '@fairdrop/database';
import { fetchFlatAuctionConfig, fetchFlatAuctionState } from '../lib/chain.js';
import { createLogger }                    from '../logger.js';
import type { TransitionContext }          from './types.js';
import type { FlatAuctionConfig }          from '../types/chain.js';

// ── DB status vocabulary ──────────────────────────────────────────────────────
//
//   DB 'live'    → API upcoming | active | clearing  (depends on current block)
//   DB 'cleared' → API cleared
//   DB 'voided'  → API voided

type DbStatus = 'live' | 'cleared' | 'voided';

const log = createLogger('auction');

// ── Transitions not registered anywhere ──────────────────────────────────────

/**
 * Transitions intentionally not registered (auction_id unrecoverable from chain):
 *   claim, claim_vested, claim_voided — consume private Bid records.
 *
 * Transitions not registered because they don't change auction-level state:
 *   push_referral_budget, withdraw_payments, withdraw_unsold.
 *
 * If any appear in a known program's block, processor.ts emits a debug-level log.
 */
export const KNOWN_UNHANDLED_TRANSITIONS = new Set([
  'claim',
  'claim_vested',
  'claim_voided',
  'push_referral_budget',
  'withdraw_payments',
  'withdraw_unsold',
  // fairdrop_config_v2.aleo CPI transitions called by auction programs:
  'assert_config',
  'assert_ref_bps',
  'check_not_paused',
]);

// ── Core upsert ───────────────────────────────────────────────────────────────

export async function upsertAuction(
  ctx:         TransitionContext,
  programId:   string,
  auctionType: string,
  auctionId:   string,
): Promise<FlatAuctionConfig> {
  const { db, blockHeight, timestamp } = ctx;

  const [config, state] = await Promise.all([
    fetchFlatAuctionConfig(auctionId, programId),
    fetchFlatAuctionState(auctionId, programId),
  ]);

  if (!config || !state) {
    throw new Error(
      `[${auctionType}] mapping read returned null for auction ${auctionId} ` +
      `(config=${!!config}, state=${!!state}) — will retry`,
    );
  }

  log.debug('upserting auction', { auctionId, auctionType, status: state.voided ? 'voided' : state.cleared ? 'cleared' : 'live' });

  const status: DbStatus = state.voided ? 'voided' : state.cleared ? 'cleared' : 'live';
  const endedAtBlock      = state.ended_at_block > 0 ? state.ended_at_block : null;

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

      status,
      totalCommitted:   state.total_committed,
      totalPayments:    state.total_payments,
      supplyMet:        state.supply_met,
      cleared:          state.cleared,
      voided:           state.voided,
      creatorRevenue:   state.creator_revenue,
      protocolFee:      state.protocol_fee,
      referralBudget:   state.referral_budget,
      clearingPrice:    state.clearing_price,

      startPrice:       config.start_price       ?? null,
      floorPrice:       config.floor_price       ?? null,
      priceDecayBlocks: config.price_decay_blocks ?? null,
      priceDecayAmount: config.price_decay_amount ?? null,
      ceilingPrice:     config.ceiling_price      ?? null,
      priceRiseBlocks:  config.price_rise_blocks  ?? null,
      priceRiseAmount:  config.price_rise_amount  ?? null,
      extensionWindow:  config.extension_window   ?? null,
      extensionBlocks:  config.extension_blocks   ?? null,
      maxEndBlock:      config.max_end_block       ?? null,
      raiseTarget:      config.raise_target        ?? null,
      fillMinBps:       config.fill_min_bps        ?? null,
      minBidAmount:     config.min_bid_amount,
      maxBidAmount:     config.max_bid_amount,
      saleScale:        config.sale_scale,
      startBlock:         config.start_block,
      endBlock:           config.end_block,
      commitEndBlock:     config.commit_end_block  ?? null,
      endedAtBlock,
      effectiveEndBlock:  state.effective_end_block ?? null,
      effectiveSupply:    state.effective_supply,
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
        totalCommitted:    state.total_committed,
        totalPayments:     state.total_payments,
        status,
        supplyMet:         state.supply_met,
        cleared:           state.cleared,
        voided:            state.voided,
        clearingPrice:     state.clearing_price,
        endedAtBlock,
        effectiveEndBlock: state.effective_end_block ?? null,
        effectiveSupply:   state.effective_supply,
        creatorRevenue:    state.creator_revenue,
        protocolFee:       state.protocol_fee,
        referralBudget:    state.referral_budget,
        stateJson:         state  as unknown as Record<string, unknown>,
        configJson:        config as unknown as Record<string, unknown>,
        updatedAt:         timestamp,
      },
    });

  return config;
}
