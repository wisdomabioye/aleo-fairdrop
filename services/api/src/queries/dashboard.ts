import { count, sum, eq, sql, gt } from 'drizzle-orm';
import { auctions, creatorReputation } from '@fairdrop/database';
import type { Db } from '@fairdrop/database';
import type { DashboardStats } from '@fairdrop/types/api';

export async function getDashboardStats(db: Db): Promise<DashboardStats> {
  const [[totals], [cleared], [active], [repAgg], typeRows] = await Promise.all([
    db.select({
      totalAuctions: count(auctions.id),
      totalBids:     sum(auctions.bidCount),
    }).from(auctions),

    db.select({
      clearedAuctions: count(auctions.id),
      totalVolume:     sql<string>`SUM(CAST(${auctions.totalPayments} AS NUMERIC))`,
    }).from(auctions).where(eq(auctions.cleared, true)),

    db.select({ activeAuctions: count(auctions.id) })
      .from(auctions)
      .where(eq(auctions.status, 'live')),

    db.select({
      avgFillRate: sql<number | null>`AVG(
        CAST(${creatorReputation.filledAuctions} AS FLOAT) /
        NULLIF(${creatorReputation.auctionsRun}, 0)
      )`,
    }).from(creatorReputation).where(gt(creatorReputation.auctionsRun, 0)),

    db.select({
      type:  auctions.type,
      count: sql<number>`cast(${count(auctions.id)} as integer)`,
    }).from(auctions).groupBy(auctions.type),
  ]);

  const avgFillRate = repAgg?.avgFillRate ?? 0;

  const typeBreakdown = Object.fromEntries(
    typeRows.map((r) => [r.type, r.count]),
  );

  return {
    totalAuctions:   totals?.totalAuctions   ?? 0,
    activeAuctions:  active?.activeAuctions  ?? 0,
    clearedAuctions: cleared?.clearedAuctions ?? 0,
    totalBids:       Number(totals?.totalBids   ?? 0),
    totalVolume:     String(cleared?.totalVolume ?? '0'),
    avgFillRate:     Math.round(Number(avgFillRate) * 1000) / 1000,
    typeBreakdown,
  };
}
