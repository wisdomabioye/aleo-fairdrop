import { Hono } from 'hono';
import { indexerCheckpoints } from '@fairdrop/database';
import type { Db } from '@fairdrop/database';
import { json } from '../lib/respond.js';
import { env } from '../env.js';

type Variables = { db: Db };

export const indexerRouter = new Hono<{ Variables: Variables }>();

// GET /indexer/status
indexerRouter.get('/status', async (c) => {
  const db = c.get('db');

  const checkpoints = await db.select().from(indexerCheckpoints);

  let chainTip: number | null = null;
  try {
    const res = await fetch(`${env.aleoRpcUrl}/latest/height`, {
      headers: { Accept: 'application/json' },
    });
    if (res.ok) chainTip = (await res.json()) as number;
  } catch {
    // Non-fatal — best-effort chain tip
  }

  const maxIndexed = checkpoints.reduce(
    (max, cp) => Math.max(max, cp.lastBlockHeight),
    0,
  );

  return json(c, {
    indexedBlock: maxIndexed,
    chainTip,
    lag:          chainTip != null ? chainTip - maxIndexed : null,
    programs:     checkpoints.map((cp) => ({
      programId:       cp.programId,
      lastBlockHeight: cp.lastBlockHeight,
      lastBlockHash:   cp.lastBlockHash,
      lastProcessedAt: cp.lastProcessedAt,
      status:          cp.status,
      lag:             cp.lag,
    })),
  });
});
