import { eq, and, count, desc } from 'drizzle-orm';
import { auctions, userReputation, referralCodes } from '@fairdrop/database';
import type { Db, UserReputationRow, AuctionRow, ReferralCodeRow } from '@fairdrop/database';
import { parsePagination } from '../lib/pagination.js';

export async function getUserReputation(
  db: Db,
  address: string,
): Promise<UserReputationRow | null> {
  const [row] = await db
    .select()
    .from(userReputation)
    .where(eq(userReputation.address, address))
    .limit(1);
  return row ?? null;
}

/** Count of auctions where the creator cleared (supply was filled). */
export async function getFilledAuctionCount(db: Db, address: string): Promise<number> {
  const [{ total }] = await db
    .select({ total: count() })
    .from(auctions)
    .where(and(eq(auctions.creator, address), eq(auctions.cleared, true)));
  return Number(total);
}

export async function getUserReferralCodes(
  db: Db,
  address: string,
): Promise<ReferralCodeRow[]> {
  return db
    .select()
    .from(referralCodes)
    .where(eq(referralCodes.owner, address));
}

export async function listAuctionsByCreator(
  db: Db,
  address: string,
  params: { page?: number; pageSize?: number },
): Promise<{ rows: AuctionRow[]; total: number }> {
  const { pageSize, offset } = parsePagination(params);

  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(auctions)
      .where(eq(auctions.creator, address))
      .orderBy(desc(auctions.createdAtBlock))
      .limit(pageSize)
      .offset(offset),
    db.select({ total: count() }).from(auctions).where(eq(auctions.creator, address)),
  ]);

  return { rows, total: Number(total) };
}
