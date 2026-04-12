/**
 * Protocol config handler — syncs fairdrop_config_v3.aleo mappings to the DB.
 *
 * Registered in the handler registry for PROGRAMS.config.programId so the
 * processor dispatches set_* transitions here automatically.
 *
 * Write rule: mappings not yet set on-chain fall back to CONFIG_DEFAULTS
 * (mirroring the contract's get_or_use values). The DB row is always written.
 *
 * To decouple from the indexer: remove this file, drop the config table,
 * and point GET /config at the chain directly.
 */
import { eq }               from 'drizzle-orm';
import { protocolConfig }   from '@fairdrop/database';
import {
  parseBool, parseU16, parseU32, parseU128,
} from '@fairdrop/sdk/parse';
import { PROGRAMS, CONFIG_DEFAULTS } from '@fairdrop/config';
import { _abi as configAbi } from '@fairdrop/sdk/contracts/config';
import type { Db }          from '@fairdrop/database';
import type { AleoRpcClient } from '../client/rpc.js';
import type { ConfigHandlerEntry, ProgramHandlerMap, TransitionContext } from './types.js';
import { createLogger }     from '../logger.js';

const log        = createLogger('config');
const CONFIG_ID  = 1;
const CONFIG_KEY = '0field';

// Mappings to read, in declaration order.
// Derived from the ABI — stays in sync when leo-abigen regenerates.
const MAPPING_NAMES = (configAbi.mappings as Array<{ name: string }>)
  .filter(m => m.name !== 'consumed_ops')
  .map(m => m.name);

const SET_TRANSITIONS = (configAbi.functions as Array<{ name: string }>)
  .filter(f => f.name.startsWith('set_'))
  .map(f => f.name);

// ── Chain reader ──────────────────────────────────────────────────────────────

async function readConfigFromChain(rpc: AleoRpcClient) {
  const pid     = PROGRAMS.config.programId;
  const entries = await Promise.all(
    MAPPING_NAMES.map(async name =>
      [name, await rpc.getMappingValue(pid, name, CONFIG_KEY)] as const,
    ),
  );
  const raw = Object.fromEntries(entries) as Record<string, string | null>;

  return {
    feeBps:             raw.fee_bps              ? parseU16(raw.fee_bps)              : CONFIG_DEFAULTS.feeBps,
    creationFee:        raw.creation_fee         ? parseU128(raw.creation_fee)        : CONFIG_DEFAULTS.creationFee,
    closerReward:       raw.closer_reward        ? parseU128(raw.closer_reward)       : CONFIG_DEFAULTS.closerReward,
    slashRewardBps:     raw.slash_reward_bps     ? parseU16(raw.slash_reward_bps)     : CONFIG_DEFAULTS.slashRewardBps,
    maxReferralBps:     raw.max_referral_bps     ? parseU16(raw.max_referral_bps)     : CONFIG_DEFAULTS.maxReferralBps,
    referralPoolBps:    raw.referral_pool_bps    ? parseU16(raw.referral_pool_bps)    : CONFIG_DEFAULTS.referralPoolBps,
    minAuctionDuration: raw.min_auction_duration ? parseU32(raw.min_auction_duration) : CONFIG_DEFAULTS.minAuctionDuration,
    paused:             raw.paused               ? parseBool(raw.paused)              : CONFIG_DEFAULTS.paused,
    updatedAt:          new Date(),
  };
}

// ── DB upsert ─────────────────────────────────────────────────────────────────

async function upsertConfig(
  db:   Db,
  data: Awaited<ReturnType<typeof readConfigFromChain>>,
) {
  await db
    .insert(protocolConfig)
    .values({ id: CONFIG_ID, ...data })
    .onConflictDoUpdate({ target: protocolConfig.id, set: { ...data } });
}

// ── Transition handler ────────────────────────────────────────────────────────

async function handleConfigTransition(ctx: TransitionContext): Promise<void> {
  const data = await readConfigFromChain(ctx.rpc);
  await upsertConfig(ctx.db as Db, data);
  log.info('config: protocol_config updated', { blockHeight: ctx.blockHeight });
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Register all set_* transitions for fairdrop_config_v3.aleo. */
export function buildConfigHandlerMap(): ProgramHandlerMap {
  const entry: ConfigHandlerEntry = {
    kind:   'config',
    handle: (ctx) => handleConfigTransition(ctx),
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
  await upsertConfig(db, data);
  log.info('config: protocol_config seeded from chain');
}
