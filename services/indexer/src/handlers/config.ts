/**
 * Protocol config handler — syncs fairdrop_config.aleo mappings to the DB.
 *
 * Registered in the handler registry for PROGRAMS.config.programId so the
 * processor dispatches set_* transitions here automatically.
 *
 * Write rule: if ANY mapping returns null (not yet set by admin), skip.
 * The DB row only exists when every field has been explicitly set on-chain.
 * The API serves contract defaults when the row is absent.
 *
 * To decouple from the indexer: remove this file, drop the config table,
 * and point GET /config at the chain directly.
 */
import { eq }               from 'drizzle-orm';
import { protocolConfig }   from '@fairdrop/database';
import {
  parseBool, parseU16, parseU32, parseU128, parseAddress,
} from '@fairdrop/sdk/parse';
import { PROGRAMS }         from '@fairdrop/config';
import type { Db }          from '@fairdrop/database';
import type { AleoRpcClient } from '../client/rpc.js';
import type { HandlerEntry, ProgramHandlerMap, TransitionContext } from './types.js';
import { createLogger }     from '../logger.js';

const log        = createLogger('config');
const CONFIG_ID  = 1;
const CONFIG_KEY = '0field';

// Mappings to read, in declaration order.
const MAPPING_NAMES = [
  'fee_bps',
  'creation_fee',
  'closer_reward',
  'slash_reward_bps',
  'max_referral_bps',
  'referral_pool_bps',
  'min_auction_duration',
  'paused',
  'protocol_admin',
] as const;

// Transitions that mutate config state — all trigger the same full re-read.
const SET_TRANSITIONS = [
  'set_fee_bps',
  'set_protocol_admin',
  'set_creation_fee',
  'set_closer_reward',
  'set_slash_reward_bps',
  'set_max_referral_bps',
  'set_referral_pool_bps',
  'set_min_auction_duration',
  'set_paused',
] as const;

// ── Chain reader ──────────────────────────────────────────────────────────────

async function readConfigFromChain(rpc: AleoRpcClient) {
  const pid     = PROGRAMS.config.programId;
  const results = await Promise.all(
    MAPPING_NAMES.map(m => rpc.getMappingValue(pid, m, CONFIG_KEY)),
  );

  if (results.some(v => v == null)) return null;

  const [
    feeBpsRaw, creationFeeRaw, closerRewardRaw,
    slashBpsRaw, maxRefBpsRaw, refPoolBpsRaw,
    minDurationRaw, pausedRaw, adminRaw,
  ] = results as string[];

  return {
    feeBps:             parseU16(feeBpsRaw),
    creationFee:        parseU128(creationFeeRaw),
    closerReward:       parseU128(closerRewardRaw),
    slashRewardBps:     parseU16(slashBpsRaw),
    maxReferralBps:     parseU16(maxRefBpsRaw),
    referralPoolBps:    parseU16(refPoolBpsRaw),
    minAuctionDuration: parseU32(minDurationRaw),
    paused:             parseBool(pausedRaw),
    protocolAdmin:      parseAddress(adminRaw),
    updatedAt:          new Date(),
  };
}

// ── DB upsert ─────────────────────────────────────────────────────────────────

async function upsertConfig(
  db:   Db,
  data: NonNullable<Awaited<ReturnType<typeof readConfigFromChain>>>,
) {
  await db
    .insert(protocolConfig)
    .values({ id: CONFIG_ID, ...data })
    .onConflictDoUpdate({ target: protocolConfig.id, set: { ...data } });
}

// ── Transition handler ────────────────────────────────────────────────────────

async function handleConfigTransition(ctx: TransitionContext): Promise<void> {
  const data = await readConfigFromChain(ctx.rpc);
  if (!data) {
    log.debug('config: mapping(s) not yet set on-chain — skipping write');
    return;
  }
  await upsertConfig(ctx.db as Db, data);
  log.info('config: protocol_config updated', { blockHeight: ctx.blockHeight });
}

// Config transitions have no auction_id. Return a fixed sentinel so the
// processor records the transition without a "could not resolve auction_id" warn.
const configIdExtractor = () => 'protocol_config' as string | null;

// ── Public API ────────────────────────────────────────────────────────────────

/** Register all set_* transitions for fairdrop_config.aleo. */
export function buildConfigHandlerMap(): ProgramHandlerMap {
  const entry: HandlerEntry = {
    getAuctionId: configIdExtractor,
    handle:       (ctx) => handleConfigTransition(ctx),
  };
  return Object.fromEntries(SET_TRANSITIONS.map(name => [name, entry]));
}

/**
 * Called once at indexer startup to seed the config row if not already present.
 * Safe to call on every restart — no-ops if the row exists.
 */
export async function bootstrapProtocolConfig(db: Db, rpc: AleoRpcClient): Promise<void> {
  const existing = await db
    .select({ id: protocolConfig.id })
    .from(protocolConfig)
    .where(eq(protocolConfig.id, CONFIG_ID))
    .limit(1);

  if (existing.length > 0) return;

  const data = await readConfigFromChain(rpc);
  if (!data) {
    log.info('config: chain mappings not yet set — table stays empty (API will serve defaults)');
    return;
  }

  await upsertConfig(db, data);
  log.info('config: protocol_config seeded from chain');
}
