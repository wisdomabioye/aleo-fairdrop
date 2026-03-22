import { eq, inArray } from 'drizzle-orm';
import { auctionMetadata } from '@fairdrop/database';
import type { Db, AuctionMetadataRow, NewAuctionMetadata } from '@fairdrop/database';

export async function insertMetadata(
  db: Db,
  row: NewAuctionMetadata,
): Promise<AuctionMetadataRow> {
  const [inserted] = await db
    .insert(auctionMetadata)
    .values(row)
    .onConflictDoNothing()  // idempotent — same hash = same content
    .returning();
  // If onConflictDoNothing skipped the insert, fetch the existing row
  if (!inserted) {
    const [existing] = await db
      .select()
      .from(auctionMetadata)
      .where(eq(auctionMetadata.hash, row.hash))
      .limit(1);
    return existing!;
  }
  return inserted;
}

export async function getMetadataByHash(
  db: Db,
  hash: string,
): Promise<AuctionMetadataRow | null> {
  const [row] = await db
    .select()
    .from(auctionMetadata)
    .where(eq(auctionMetadata.hash, hash))
    .limit(1);
  return row ?? null;
}

/** Batch load metadata rows for a list of hashes. Returns a Map keyed by hash. */
export async function getMetadataByHashes(
  db: Db,
  hashes: string[],
): Promise<Map<string, AuctionMetadataRow>> {
  if (hashes.length === 0) return new Map();
  const rows = await db
    .select()
    .from(auctionMetadata)
    .where(inArray(auctionMetadata.hash, hashes));
  return new Map(rows.map((r) => [r.hash, r]));
}
