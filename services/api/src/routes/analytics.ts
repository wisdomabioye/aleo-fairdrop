import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Db } from '@fairdrop/database';
import {
  getVolumeByPeriod,
  getAuctionTypeMetrics,
  getFillDistribution,
  getAttributeBreakdown,
} from '../queries/analytics.js';
import { json } from '../lib/respond.js';

type Variables = { db: Db };

export const analyticsRouter = new Hono<{ Variables: Variables }>();

// GET /analytics/volume-by-period?bucket=weekly|monthly
analyticsRouter.get('/volume-by-period', async (c) => {
  const raw = c.req.query('bucket') ?? 'weekly';
  if (raw !== 'weekly' && raw !== 'monthly') {
    throw new HTTPException(400, { message: 'bucket must be "weekly" or "monthly"' });
  }
  // Map to DATE_TRUNC unit — validated above, sql.raw is safe
  const bucket = raw === 'weekly' ? 'week' : 'month';
  const db     = c.get('db');
  const data   = await getVolumeByPeriod(db, bucket);
  return json(c, data);
});

// GET /analytics/by-type
analyticsRouter.get('/by-type', async (c) => {
  const db   = c.get('db');
  const data = await getAuctionTypeMetrics(db);
  return json(c, data);
});

// GET /analytics/fill-distribution
analyticsRouter.get('/fill-distribution', async (c) => {
  const db   = c.get('db');
  const data = await getFillDistribution(db);
  return json(c, data);
});

// GET /analytics/attributes
analyticsRouter.get('/attributes', async (c) => {
  const db   = c.get('db');
  const data = await getAttributeBreakdown(db);
  return json(c, data);
});
