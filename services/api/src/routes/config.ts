/**
 * GET /config — serve protocol config.
 *
 * Resolution order:
 *   1. In-process TTL cache (5 min)
 *   2. DB row (written by indexer from fairdrop_config_v1.aleo mappings)
 *   3. Contract defaults (when admin hasn't called any set_* yet)
 *
 * No chain reads from the API. The indexer owns the DB row.
 * To decouple: drop the DB query and always return defaults (or read chain).
 */
import { Hono } from 'hono';
import type { Db } from '@fairdrop/database';
import type { ProtocolConfig } from '@fairdrop/types/domain';
import { DEFAULT_ACCOUNTS } from '@fairdrop/config';
import { getProtocolConfig } from '../queries/config.js';
import { getCachedConfig, setCachedConfig } from '../lib/config-cache.js';
import { json } from '../lib/respond.js';

type Variables = { db: Db };

// Contract defaults — active before any set_* call (mirrors fairdrop_config_v1.aleo constants).
const CONTRACT_DEFAULTS: ProtocolConfig = {
  feeBps:             250,
  creationFee:        '10000',
  closerReward:       '10000',
  slashRewardBps:     2000,
  maxReferralBps:     2000,
  referralPoolBps:    500,
  minAuctionDuration: 360,
  paused:             false,
  protocolAdmin:      DEFAULT_ACCOUNTS.defaultAdminAddress, 
  updatedAt:          new Date(0).toISOString(),
};

export const configRouter = new Hono<{ Variables: Variables }>();

configRouter.get('/', async (c) => {
  const hit = getCachedConfig();
  if (hit) return json(c, hit);

  const db   = c.get('db');
  const data = await getProtocolConfig(db) ?? CONTRACT_DEFAULTS;
  setCachedConfig(data);
  return json(c, data);
});
