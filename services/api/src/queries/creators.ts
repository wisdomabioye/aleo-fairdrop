import { eq, desc, inArray, gt, sql } from 'drizzle-orm';
import { creatorReputation, auctions }  from '@fairdrop/database';
import type { Db, CreatorReputationRow } from '@fairdrop/database';

export async function getCreatorReputation(
  db:      Db,
  address: string,
): Promise<CreatorReputationRow | null> {
  const [row] = await db
    .select()
    .from(creatorReputation)
    .where(eq(creatorReputation.address, address))
    .limit(1);
  return row ?? null;
}

/** Batch-fetch creator reputations for a set of addresses. Returns a Map keyed by address. */
export async function getCreatorReputationBatch(
  db:        Db,
  addresses: string[],
): Promise<Map<string, CreatorReputationRow>> {
  if (addresses.length === 0) return new Map();
  const rows = await db
    .select()
    .from(creatorReputation)
    .where(inArray(creatorReputation.address, addresses));
  return new Map(rows.map((r) => [r.address, r]));
}

/**
 * Average fill percentage per creator from cleared auctions.
 * Pure SQL aggregation — no rows loaded into memory.
 * Uses auctions_creator_idx for an index scan.
 */
export async function getAvgFillRates(
  db:        Db,
  addresses: string[],
): Promise<Map<string, number>> {
  if (addresses.length === 0) return new Map();
  const rows = await db
    .select({
      creator:     auctions.creator,
      avgFillRate: sql<number>`coalesce(avg(least(cast(${auctions.totalCommitted} as numeric) / nullif(cast(${auctions.supply} as numeric), 0), 1.0)), 0)`.as('avg_fill_rate'),
    })
    .from(auctions)
    .where(inArray(auctions.creator, addresses))
    .groupBy(auctions.creator);

  return new Map(rows.map(r => [r.creator, Number(r.avgFillRate)]));
}

export type CreatorSortKey = 'fillRate' | 'volume' | 'auctionsRun' | 'bidCount';

/**
 * Top creators with configurable sort.
 *
 * - fillRate:   computed (filledAuctions / auctionsRun) — not a stored column
 * - volume:     CAST to NUMERIC — stored as text, plain ORDER BY is lexicographic
 * - auctionsRun: direct column
 * - bidCount:   requires a JOIN to auctions (SUM bid_count per creator)
 *               JOIN uses ON not USING — subquery exposes 'creator', not 'address'
 */
export async function listTopCreators(
  db:    Db,
  limit: number = 20,
  sort:  CreatorSortKey = 'fillRate',
): Promise<CreatorReputationRow[]> {
  const base = db
    .select()
    .from(creatorReputation)
    .where(gt(creatorReputation.auctionsRun, 0));

  if (sort === 'volume') {
    return base
      .orderBy(sql`CAST(${creatorReputation.volume} AS NUMERIC) DESC NULLS LAST`)
      .limit(limit);
  }

  if (sort === 'auctionsRun') {
    return base
      .orderBy(desc(creatorReputation.auctionsRun))
      .limit(limit);
  }

  if (sort === 'fillRate') {
    return base
      .orderBy(
        sql`${creatorReputation.filledAuctions}::float / NULLIF(${creatorReputation.auctionsRun}, 0) DESC NULLS LAST`,
        desc(creatorReputation.auctionsRun),
      )
      .limit(limit);
  }

  // bidCount — LEFT JOIN to auctions, aggregate bid_count per creator.
  // ON bids.creator = creatorReputation.address (NOT USING — subquery col is 'creator')
  if (sort === 'bidCount') {
    const bidCounts = db.$with('bid_counts').as(
      db.select({
        creator:   auctions.creator,
        totalBids: sql<number>`cast(sum(${auctions.bidCount}) as integer)`.as('total_bids'),
      })
      .from(auctions)
      .groupBy(auctions.creator),
    );

    return db
      .with(bidCounts)
      .select({ cr: creatorReputation })
      .from(creatorReputation)
      .leftJoin(bidCounts, eq(bidCounts.creator, creatorReputation.address))
      .where(gt(creatorReputation.auctionsRun, 0))
      .orderBy(sql`${bidCounts.totalBids} DESC NULLS LAST`)
      .limit(limit)
      .then((rows) => rows.map((r) => r.cr));
  }

  // Fallback — should be unreachable with typed sort param
  return base
    .orderBy(desc(creatorReputation.filledAuctions), desc(creatorReputation.auctionsRun))
    .limit(limit);
}
