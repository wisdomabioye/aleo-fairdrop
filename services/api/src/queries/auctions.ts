import { eq, and, gt, gte, lt, lte, desc, asc, count, sql } from 'drizzle-orm';
import { auctions, indexerCheckpoints } from '@fairdrop/database';
import type { Db, AuctionRow } from '@fairdrop/database';
import type { AuctionListParams } from '@fairdrop/types/api';
import { AuctionStatus } from '@fairdrop/types/domain';
import type { RawPagination } from '../lib/pagination.js';

/** Snapshot of the indexer's current position — used by mappers and queries. */
export interface BlockContext {
  currentBlock:    number;
  lastProcessedAt: Date | null;
}

/**
 * Build the exact WHERE condition for a requested AuctionStatus.
 *
 * All data needed for status computation lives in the auctions table
 * (start_block, end_block, supply_met, cleared, voided) plus the current
 * block height from the indexer checkpoint. This gives exact filtering
 * and correct pagination totals for every status value.
 */
function statusCondition(status: AuctionStatus, currentBlock: number) {
  const live = eq(auctions.status, 'live');
  switch (status) {
    case AuctionStatus.Upcoming:
      return and(live, gt(auctions.startBlock, currentBlock));
    case AuctionStatus.Active:
      return and(
        live,
        lte(auctions.startBlock, currentBlock),
        gte(auctions.endBlock,   currentBlock),
        eq(auctions.supplyMet,   false),
      );
    case AuctionStatus.Clearing:
      return and(live, eq(auctions.supplyMet, true));
    case AuctionStatus.Ended:
      return and(
        live,
        lt(auctions.endBlock,  currentBlock),
        eq(auctions.supplyMet, false),
      );
    case AuctionStatus.Cleared:
      return eq(auctions.status, 'cleared');
    case AuctionStatus.Voided:
      return eq(auctions.status, 'voided');
    default: {
      const _exhaustive: never = status;
      throw new Error(`[statusCondition] unhandled AuctionStatus: ${_exhaustive}`);
    }
  }
}

export async function listAuctions(
  db:           Db,
  params:       AuctionListParams,
  currentBlock: number,
  pag:          RawPagination,
): Promise<{ rows: AuctionRow[]; total: number }> {
  const { pageSize, offset } = pag;

  const conditions = [];
  if (params.type)    conditions.push(eq(auctions.type,        params.type));
  if (params.creator) conditions.push(eq(auctions.creator,     params.creator));
  if (params.token)   conditions.push(eq(auctions.saleTokenId, params.token));
  if (params.status)  conditions.push(statusCondition(params.status, currentBlock));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const sortCol = (() => {
    switch (params.sort) {
      case 'endBlock':    return auctions.endBlock;
      case 'volume':      return sql`CAST(${auctions.totalCommitted} AS NUMERIC)`;
      case 'progressPct': return sql`CAST(${auctions.totalCommitted} AS NUMERIC) / NULLIF(CAST(${auctions.supply} AS NUMERIC), 0)`;
      default:            return auctions.createdAtBlock;
    }
  })();
  const order = params.order === 'asc' ? asc(sortCol) : desc(sortCol);

  const [rows, [{ total }]] = await Promise.all([
    db.select().from(auctions).where(where).orderBy(order).limit(pageSize).offset(offset),
    db.select({ total: count() }).from(auctions).where(where),
  ]);

  return { rows, total: Number(total) };
}

export async function getAuction(db: Db, id: string): Promise<AuctionRow | null> {
  const [row] = await db.select().from(auctions).where(eq(auctions.id, id)).limit(1);
  return row ?? null;
}

/**
 * Returns the indexer's current block height and when it was processed.
 * Routes fetch this once and pass it to both listAuctions() and the mappers
 * so the same block snapshot is used for filtering and status computation.
 */
export async function getBlockContext(db: Db): Promise<BlockContext> {
  const [row] = await db
    .select({
      lastBlockHeight: indexerCheckpoints.lastBlockHeight,
      lastProcessedAt: indexerCheckpoints.lastProcessedAt,
    })
    .from(indexerCheckpoints)
    .orderBy(desc(indexerCheckpoints.lastBlockHeight))
    .limit(1);

  return {
    currentBlock:    row?.lastBlockHeight ?? 0,
    lastProcessedAt: row?.lastProcessedAt ?? null,
  };
}
