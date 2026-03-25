import { Hono } from 'hono';
import type { Db } from '@fairdrop/database';
import { getTokenInfo } from '../lib/token-cache.js';
import { json } from '../lib/respond.js';
import { env } from '../env.js';

type Variables = { db: Db };

export const tokensRouter = new Hono<{ Variables: Variables }>();

// GET /tokens/:id/metadata
tokensRouter.get('/:id/metadata', async (c) => {
  const tokenId = c.req.param('id');
  const tokenInfo = await getTokenInfo(env.aleoRpcUrl, tokenId);
  return json(c, tokenInfo);
});
