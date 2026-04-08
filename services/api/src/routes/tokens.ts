import { Hono } from 'hono';
import type { Db } from '@fairdrop/database';
import { getToken, getTokensBatch } from '../lib/tokens.js';
import { json } from '../lib/respond.js';
import { env } from '../env.js';

type Variables = { db: Db };

export const tokensRouter = new Hono<{ Variables: Variables }>();

// GET /tokens/:id
tokensRouter.get('/:id', async (c) => {
  const info = await getToken(c.get('db'), env.aleoRpcUrl, c.req.param('id'));
  if (!info) return c.json({ error: 'not found' }, 404);
  return json(c, info);
});

// GET /tokens?ids=id1,id2,...
tokensRouter.get('/', async (c) => {
  const ids = c.req.query('ids')?.split(',').filter(Boolean) ?? [];
  if (ids.length === 0) return json(c, {});
  const map = await getTokensBatch(c.get('db'), env.aleoRpcUrl, ids);
  return json(c, Object.fromEntries(map));
});
