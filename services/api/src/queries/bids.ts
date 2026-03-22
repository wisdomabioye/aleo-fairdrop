import { eq, count, desc } from 'drizzle-orm';
import { bids } from '@fairdrop/database';
import type { Db, BidRow } from '@fairdrop/database';
import { parsePagination } from '../lib/pagination.js';

export async function listBidsByAuction(
  db: Db,
  auctionId: string,
  params: { page?: number; pageSize?: number },
): Promise<{ rows: BidRow[]; total: number }> {
  const { pageSize, offset } = parsePagination(params);

  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(bids)
      .where(eq(bids.auctionId, auctionId))
      .orderBy(desc(bids.placedAtBlock))
      .limit(pageSize)
      .offset(offset),
    db.select({ total: count() }).from(bids).where(eq(bids.auctionId, auctionId)),
  ]);

  return { rows, total: Number(total) };
}
