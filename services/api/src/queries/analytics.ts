import { count, sql, inArray, and, eq } from 'drizzle-orm';
import type { SQL }                     from 'drizzle-orm';
import { auctions }                     from '@fairdrop/database';
import type { Db }                      from '@fairdrop/database';
import { AuctionType, GateMode }        from '@fairdrop/types/domain';
import { GateModeValue }                from '@fairdrop/types/contracts/utilities';
import type {
  VolumePeriod,
  AuctionTypeMetrics,
  FillDistribution,
  FillBucket,
  AttributeBreakdown,
} from '@fairdrop/types/api';

// ── Shared filter ─────────────────────────────────────────────────────────────

/**
 * Matches auctions that ran to completion (cleared or ended-but-not-voided).
 * NOTE: 'ended'/'upcoming' are API-computed, never stored in DB — do not use them here.
 */
const completedFilter: SQL = sql`(
  ${auctions.cleared} = true
  OR (${auctions.endedAtBlock} IS NOT NULL AND ${auctions.voided} = false)
)`;

// ── Volume over time ──────────────────────────────────────────────────────────

/**
 * Volume and auction count bucketed by close date (updated_at of cleared auctions).
 * bucket: 'week' | 'month' — caller must validate and map from query param before passing.
 */
export async function getVolumeByPeriod(
  db:     Db,
  bucket: 'week' | 'month',
): Promise<VolumePeriod[]> {
  // sql.raw is safe here — bucket is already validated to 'week' | 'month' by the route handler.
  const truncExpr = sql`DATE_TRUNC(${sql.raw(`'${bucket}'`)}, ${auctions.updatedAt})`;

  const rows = await db
    .select({
      // ::text ensures a string is returned regardless of PG driver date serialisation
      period: sql<string>`${truncExpr}::text`,
      volume: sql<string>`COALESCE(SUM(CAST(${auctions.totalPayments} AS NUMERIC)), 0)::text`,
      count:  sql<number>`cast(${count(auctions.id)} as integer)`,
    })
    .from(auctions)
    .where(eq(auctions.cleared, true))
    .groupBy(truncExpr)
    .orderBy(truncExpr);

  return rows as VolumePeriod[];
}

// ── Auction type performance ──────────────────────────────────────────────────

/**
 * Per-type performance metrics.
 *
 * avgFillPct uses a FILTER to restrict to completed auctions only, which:
 *   - excludes live auctions (fill is in-progress, not meaningful as a final stat)
 *   - excludes Sealed auctions still in commit phase (total_committed = 0 until reveal)
 *
 * successRate and avgFillPct are null when a type has no completed auctions.
 */
export async function getAuctionTypeMetrics(db: Db): Promise<AuctionTypeMetrics[]> {
  const rows = await db
    .select({
      type:         auctions.type,
      total:        sql<number>`cast(count(*) as integer)`,
      clearedCount: sql<number>`cast(sum(${auctions.cleared}::int) as integer)`,
      successRate:  sql<number | null>`
        sum(${auctions.cleared}::int)::float / NULLIF(count(*), 0)
      `,
      avgFillPct: sql<number | null>`
        AVG(
          CASE
            WHEN ${auctions.type} IN (${AuctionType.Raise}, ${AuctionType.Quadratic})
              THEN CAST(${auctions.totalPayments} AS NUMERIC) /
                   NULLIF(CAST(${auctions.raiseTarget} AS NUMERIC), 0)
            ELSE
              CAST(${auctions.totalCommitted} AS NUMERIC) /
              NULLIF(CAST(${auctions.supply} AS NUMERIC), 0)
          END
        ) FILTER (WHERE ${completedFilter})
      `,
      avgBids:     sql<number>`AVG(${auctions.bidCount})`,
      totalVolume: sql<string>`
        COALESCE(SUM(
          CASE WHEN ${auctions.cleared}
               THEN CAST(${auctions.totalPayments} AS NUMERIC)
               ELSE 0
          END
        ), 0)::text
      `,
    })
    .from(auctions)
    .groupBy(auctions.type);

  return rows.map((r) => ({
    type:         r.type,
    total:        r.total,
    clearedCount: r.clearedCount,
    successRate:  r.successRate  != null ? Number(r.successRate)  : null,
    avgFillPct:   r.avgFillPct   != null ? Number(r.avgFillPct)   : null,
    avgBids:      Number(r.avgBids ?? 0),
    totalVolume:  r.totalVolume,
  }));
}

// ── Fill distribution ─────────────────────────────────────────────────────────

async function buildFillHistogram(
  db:       Db,
  types:    AuctionType[],
  fillExpr: SQL,
): Promise<FillBucket[]> {
  // Bucket expression: FLOOR(LEAST(100, fill% * 100) / 10) * 10
  const bucketExpr = sql`cast(FLOOR(LEAST(100, ${fillExpr} * 100) / 10) * 10 as integer)`;

  const rows = await db
    .select({
      bucketFloor: bucketExpr,
      count:       sql<number>`cast(count(*) as integer)`,
    })
    .from(auctions)
    .where(and(inArray(auctions.type, types), completedFilter))
    .groupBy(bucketExpr)
    .orderBy(bucketExpr);

  // Guarantee all 10 buckets exist (0–90) even if a bucket has no auctions
  const map = new Map(rows.map((r) => [r.bucketFloor as number, r.count]));
  return Array.from({ length: 10 }, (_, i) => ({
    bucketFloor: i * 10,
    count:       map.get(i * 10) ?? 0,
  }));
}

/**
 * Two separate fill histograms — fill semantics differ by type group.
 * Both run in parallel.
 */
export async function getFillDistribution(db: Db): Promise<FillDistribution> {
  const supplyFillExpr: SQL = sql`
    CAST(${auctions.totalCommitted} AS NUMERIC) /
    NULLIF(CAST(${auctions.supply} AS NUMERIC), 0)
  `;

  const raiseFillExpr: SQL = sql`
    CAST(${auctions.totalPayments} AS NUMERIC) /
    NULLIF(CAST(${auctions.raiseTarget} AS NUMERIC), 0)
  `;

  const [supplyFill, raiseFill] = await Promise.all([
    buildFillHistogram(
      db,
      [AuctionType.Dutch, AuctionType.Sealed, AuctionType.Lbp, AuctionType.Ascending],
      supplyFillExpr,
    ),
    buildFillHistogram(
      db,
      [AuctionType.Raise, AuctionType.Quadratic],
      raiseFillExpr,
    ),
  ]);

  return { supplyFill, raiseFill };
}

// ── Attributes ────────────────────────────────────────────────────────────────

/**
 * Gate mode split + vesting adoption counts.
 * DB stores gate_mode as integer (0/1/2) — mapped to GateMode string here, not in the client.
 */
export async function getAttributeBreakdown(db: Db): Promise<AttributeBreakdown> {
  const GATE_LABEL: Record<number, GateMode> = {
    [GateModeValue.Open]:       GateMode.Open,
    [GateModeValue.Merkle]:     GateMode.Merkle,
    [GateModeValue.Credential]: GateMode.Credential,
  };

  const [gateRows, vestRows] = await Promise.all([
    db.select({
      gateMode: auctions.gateMode,
      count:    sql<number>`cast(count(*) as integer)`,
    }).from(auctions).groupBy(auctions.gateMode),

    db.select({
      vestEnabled: auctions.vestEnabled,
      count:       sql<number>`cast(count(*) as integer)`,
    }).from(auctions).groupBy(auctions.vestEnabled),
  ]);

  const gateMode: Record<GateMode, number> = {
    [GateMode.Open]:       0,
    [GateMode.Merkle]:     0,
    [GateMode.Credential]: 0,
  };
  for (const row of gateRows) {
    const label = GATE_LABEL[row.gateMode];
    if (label != null) gateMode[label] = row.count;
  }

  const vesting = { enabled: 0, disabled: 0 };
  for (const row of vestRows) {
    if (row.vestEnabled) vesting.enabled  = row.count;
    else                 vesting.disabled = row.count;
  }

  return { gateMode, vesting };
}
