/**
 * Block processor — routes confirmed transitions to registered handlers.
 *
 * For each accepted execute transaction in a block:
 *   1. Check idempotency: skip transitions already in indexer_transitions.
 *   2. Look up registry[programId][fnName] — skip if no handler registered.
 *   3. Resolve auction_id via the handler's getAuctionId extractor.
 *   4. Call handler(ctx, auctionId).
 *   5. Record transition in indexer_transitions.
 *
 * All writes per block are in a single DB transaction — either the whole block
 * commits or nothing does. The checkpoint is updated inside the same tx.
 * If any handler throws (e.g. transient mapping read failure), the transaction
 * rolls back and the block will be retried on the next poll tick.
 *
 * The processor has no knowledge of specific transitions or auction types.
 * Handler dispatch is fully data-driven via the AuctionRegistry.
 */
import { eq }                                           from 'drizzle-orm';
import { indexerTransitions, indexerCheckpoints }       from '@fairdrop/database';
import type { Db, DbTx }                               from '@fairdrop/database';
import type { AleoRpcClient }                           from '../client/rpc.js';
import type { AleoBlock, AleoTransition, FinalizeOperation } from '../types/aleo.js';
import { buildAuctionRegistry, type AuctionRegistry }  from '../handlers/index.js';
import { KNOWN_UNHANDLED_TRANSITIONS }                 from '../handlers/auction.js';
import { createLogger }                                from '../logger.js';

const log = createLogger('processor');

export class BlockProcessor {
  private readonly registry: AuctionRegistry;

  constructor(
    private readonly db:  Db,
    private readonly rpc: AleoRpcClient,
  ) {
    this.registry = buildAuctionRegistry();
  }

  async processBlock(block: AleoBlock, tipHeight: number): Promise<void> {
    const blockHeight = block.header.metadata.height;
    const timestamp   = new Date(block.header.metadata.timestamp * 1000);

    await this.db.transaction(async (tx) => {
      for (const confirmed of block.transactions) {
        if (confirmed.status !== 'accepted') continue;
        if (!confirmed.transaction.execution)  continue;

        const txId = confirmed.transaction.id;

        for (const transition of confirmed.transaction.execution.transitions) {
          await this.processTransition(
            tx,
            transition,
            confirmed.finalize ?? [],
            blockHeight,
            timestamp,
            txId,
          );
        }
      }

      await tx
        .insert(indexerCheckpoints)
        .values({
          programId:       'global',
          lastBlockHeight: blockHeight,
          lastBlockHash:   block.block_hash,
          lastProcessedAt: new Date(),
          status:          'syncing',
          lag:             tipHeight - blockHeight,
        })
        .onConflictDoUpdate({
          target: indexerCheckpoints.programId,
          set: {
            lastBlockHeight: blockHeight,
            lastBlockHash:   block.block_hash,
            lastProcessedAt: new Date(),
            lag:             tipHeight - blockHeight,
          },
        });
    });
  }

  private async processTransition(
    db:          DbTx,
    transition:  AleoTransition,
    finalizeOps: FinalizeOperation[],
    blockHeight: number,
    timestamp:   Date,
    txId:        string,
  ): Promise<void> {
    const { program: programId, function: fnName, id: transitionId } = transition;

    // Not a fairdrop program — skip silently (most blocks).
    const programMap = this.registry[programId];
    if (!programMap) return;

    // Idempotency — skip transitions already recorded (e.g. on indexer restart).
    const existing = await db
      .select({ transitionId: indexerTransitions.transitionId })
      .from(indexerTransitions)
      .where(eq(indexerTransitions.transitionId, transitionId))
      .limit(1);

    if (existing.length > 0) return;

    const entry = programMap[fnName];
    if (!entry) {
      if (KNOWN_UNHANDLED_TRANSITIONS.has(fnName)) {
        log.debug(`${programId}::${fnName} — intentionally skipped`);
      } else {
        log.warn(`${programId}::${fnName} — no handler registered (registry may be out of date)`, {
          txId,
          blockHeight,
        });
      }
      await db.insert(indexerTransitions).values({
        transitionId,
        programId,
        transitionName: fnName,
        blockHeight,
        processedAt:    timestamp,
      }).onConflictDoNothing();
      return;
    }

    const auctionId = entry.getAuctionId(transition, finalizeOps);
    if (!auctionId) {
      log.warn(`${programId}::${fnName} — could not resolve auction_id`, { txId, blockHeight });
    } else {
      // ctx.db typed as Db | DbTx — DbTx satisfies all query operations needed by handlers.
      const ctx = { db: db as Db | DbTx, rpc: this.rpc, transition, blockHeight, timestamp, txId };
      await entry.handle(ctx, auctionId);
    }

    await db.insert(indexerTransitions).values({
      transitionId,
      programId,
      transitionName: fnName,
      blockHeight,
      processedAt:    timestamp,
    }).onConflictDoNothing();
  }
}
