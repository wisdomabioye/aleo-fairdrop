import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Db } from '@fairdrop/database';
import type { CreatorReputationResponse } from '@fairdrop/types/domain';
import { computeTier } from '@fairdrop/types/domain';
import { getCreatorReputation, listTopCreators, getAvgFillRates, type CreatorSortKey } from '../queries/creators.js';
import { json } from '../lib/respond.js';

type Variables = { db: Db };

export const creatorsRouter = new Hono<{ Variables: Variables }>();

function toResponse(
  row:         { address: string; auctionsRun: number; filledAuctions: number; volume: string },
  avgFillRate: number,
): CreatorReputationResponse {
  return {
    address:            row.address,
    auctionsRun:        row.auctionsRun,
    filledAuctions:     row.filledAuctions,
    volumeMicrocredits: row.volume,
    fillRate:           avgFillRate,
    tier:               computeTier(row.auctionsRun, row.filledAuctions),
  };
}

const VALID_SORT = new Set<CreatorSortKey>(['fillRate', 'volume', 'auctionsRun', 'bidCount']);

// GET /creators?sort=fillRate|volume|auctionsRun|bidCount&limit=N
creatorsRouter.get('/', async (c) => {
  const db    = c.get('db');
  const limit = Math.min(Number(c.req.query('limit') ?? 20), 100);
  const rawSort = c.req.query('sort') ?? 'fillRate';
  const sort: CreatorSortKey = VALID_SORT.has(rawSort as CreatorSortKey)
    ? (rawSort as CreatorSortKey)
    : 'fillRate';
  const rows      = await listTopCreators(db, limit, sort);
  const fillRates = await getAvgFillRates(db, rows.map(r => r.address));
  return json(c, { items: rows.map(r => toResponse(r, fillRates.get(r.address) ?? 0)) });
});

// GET /creators/:address
creatorsRouter.get('/:address', async (c) => {
  const db      = c.get('db');
  const address = c.req.param('address');
  const row     = await getCreatorReputation(db, address);
  if (!row) throw new HTTPException(404, { message: `No reputation record for ${address}` });
  const fillRates = await getAvgFillRates(db, [address]);
  return json(c, toResponse(row, fillRates.get(address) ?? 0));
});
