import { Hono } from 'hono';
import type { Db } from '@fairdrop/database';
import { getDashboardStats } from '../queries/dashboard.js';
import { json } from '../lib/respond.js';

type Variables = { db: Db };

export const dashboardRouter = new Hono<{ Variables: Variables }>();

// GET /dashboard/stats
dashboardRouter.get('/stats', async (c) => {
  const db   = c.get('db');
  const stats = await getDashboardStats(db);
  return json(c, stats);
});
