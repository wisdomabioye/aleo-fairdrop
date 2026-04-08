import { Hono } from 'hono';
import { indexerCheckpoints } from '@fairdrop/database';
import type { IndexerStatus, SyncStatus } from '@fairdrop/types/indexer';
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
    const res = await fetch(`${env.aleoRpcUrl}/blocks/latest/height`, {
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
        const d = (await res.json()) as {height: number}
        chainTip = d.height
    }
  } catch {
    // Non-fatal — best-effort chain tip
  }

  const maxIndexed = checkpoints.reduce(
    (max, cp) => Math.max(max, cp.lastBlockHeight),
    0,
  );

  // When the RPC call fails, fall back to the max lag stored by the indexer itself.
  // This keeps lagBlocks stable instead of flipping to null on every failed RPC attempt.
  const lagBlocks = chainTip != null
    ? chainTip - maxIndexed
    : checkpoints.length > 0
      ? Math.max(...checkpoints.map((cp) => cp.lag))
      : null;

  return json(c, {
    indexedBlock: maxIndexed,
    chainTip,
    lagBlocks,
    programs:     checkpoints.map((cp) => ({
      programId:       cp.programId,
      lastBlockHeight: cp.lastBlockHeight,
      lastBlockHash:   cp.lastBlockHash,
      lastProcessedAt: cp.lastProcessedAt,
      status:          cp.status as SyncStatus,
      lag:             cp.lag,
    })),
  } satisfies IndexerStatus);
});
