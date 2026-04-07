/**
 * Creator reputation upsert handler — single concern: read on-chain reputation,
 * write creatorReputation row.
 *
 * Called from handlers/index.ts on close_auction only.
 * update_reputation CPI fires in close_auction finalize — never in cancel_auction.
 */

import { creatorReputation }         from '@fairdrop/database';
import { fetchCreatorReputation }    from '../lib/chain.js';
import { createLogger }              from '../logger.js';
import type { TransitionContext }    from './types.js';

const log = createLogger('reputation');

export async function upsertCreatorReputation(
  ctx:     TransitionContext,
  creator: string,
): Promise<void> {
  const { db, timestamp } = ctx;

  const rep = await fetchCreatorReputation(creator);
  if (!rep) {
    log.debug('no reputation record found', { creator });
    return;
  }

  await db
    .insert(creatorReputation)
    .values({
      address:        creator,
      auctionsRun:    Number(rep.total_auctions),
      filledAuctions: Number(rep.filled_auctions),
      volume:         String(rep.total_volume),
      updatedAt:      timestamp,
    })
    .onConflictDoUpdate({
      target: creatorReputation.address,
      set: {
        auctionsRun:    Number(rep.total_auctions),
        filledAuctions: Number(rep.filled_auctions),
        volume:         String(rep.total_volume),
        updatedAt:      timestamp,
      },
    });

  log.debug('reputation upserted', { creator, filled: rep.filled_auctions });
}
