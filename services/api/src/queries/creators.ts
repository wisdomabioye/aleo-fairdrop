import { eq, desc, inArray, gt } from 'drizzle-orm';
import { creatorReputation } from '@fairdrop/database';
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

/** Top creators ordered by filledAuctions descending. */
export async function listTopCreators(
  db:    Db,
  limit: number = 20,
): Promise<CreatorReputationRow[]> {
  return db
    .select()
    .from(creatorReputation)
    .where(gt(creatorReputation.filledAuctions, 0))
    .orderBy(desc(creatorReputation.filledAuctions), desc(creatorReputation.auctionsRun))
    .limit(limit);
}
