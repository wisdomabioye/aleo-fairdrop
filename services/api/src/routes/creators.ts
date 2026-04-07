import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Db } from '@fairdrop/database';
import type { CreatorReputationResponse } from '@fairdrop/types/domain';
import { computeTier } from '@fairdrop/types/domain';
import { getCreatorReputation, listTopCreators } from '../queries/creators.js';
import { json } from '../lib/respond.js';

type Variables = { db: Db };

export const creatorsRouter = new Hono<{ Variables: Variables }>();

function toResponse(row: { address: string; auctionsRun: number; filledAuctions: number; volume: string }): CreatorReputationResponse {
  return {
    address:            row.address,
    auctionsRun:        row.auctionsRun,
    filledAuctions:     row.filledAuctions,
    volumeMicrocredits: row.volume,
    fillRate:           row.auctionsRun > 0 ? row.filledAuctions / row.auctionsRun : 0,
    tier:               computeTier(row.auctionsRun, row.filledAuctions),
  };
}

// GET /creators — top creators by filled auctions
creatorsRouter.get('/', async (c) => {
  const db    = c.get('db');
  const limit = Math.min(Number(c.req.query('limit') ?? 20), 100);
  const rows  = await listTopCreators(db, limit);
  return json(c, { items: rows.map(toResponse) });
});

// GET /creators/:address
creatorsRouter.get('/:address', async (c) => {
  const db      = c.get('db');
  const address = c.req.param('address');
  const row     = await getCreatorReputation(db, address);
  if (!row) throw new HTTPException(404, { message: `No reputation record for ${address}` });
  return json(c, toResponse(row));
});
