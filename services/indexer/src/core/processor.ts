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
 *
 * The processor has no knowledge of specific transitions or auction types.
 * Handler dispatch is fully data-driven via the AuctionRegistry.
 */
import { eq }                                           from 'drizzle-orm';
import { indexerTransitions, indexerCheckpoints }       from '@fairdrop/database';
import type { Db }                                      from '@fairdrop/database';
import type { AleoRpcClient }                           from '../client/rpc.js';
import type { AleoBlock, AleoTransition, FinalizeOperation } from '../types/aleo.js';
import { buildAuctionRegistry, type AuctionRegistry }  from '../handlers/index.js';

export class BlockProcessor {
  private readonly registry: AuctionRegistry;

  constructor(
    private readonly db:  Db,
    private readonly rpc: AleoRpcClient,
  ) {
    this.registry = buildAuctionRegistry();
  }

  async processBlock(block: AleoBlock): Promise<void> {
    const blockHeight = block.header.metadata.height;
    const timestamp   = new Date(block.header.metadata.timestamp * 1000);

    await this.db.transaction(async (tx) => {
      for (const confirmed of block.transactions) {
        if (confirmed.status !== 'accepted') continue;
        if (!confirmed.transaction.execution)  continue;

        const txId = confirmed.transaction.id;

        for (const transition of confirmed.transaction.execution.transitions) {
          await this.processTransition(
            tx as unknown as Db,
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
          lag:             0,
        })
        .onConflictDoUpdate({
          target: indexerCheckpoints.programId,
          set: {
            lastBlockHeight: blockHeight,
            lastBlockHash:   block.block_hash,
            lastProcessedAt: new Date(),
          },
        });
    });
  }

  private async processTransition(
    db:          Db,
    transition:  AleoTransition,
    finalizeOps: FinalizeOperation[],
    blockHeight: number,
    timestamp:   Date,
    txId:        string,
  ): Promise<void> {
    const { program: programId, function: fnName, id: transitionId } = transition;

    // Not a fairdrop program — skip without logging (most blocks will hit this).
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
      // Registered program but unhandled transition (e.g. claim, claim_vested).
      // Still record it so we don't re-examine on restart.
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
      console.warn(
        `[processor] ${programId}::${fnName}: could not resolve auction_id ` +
        `(tx: ${txId}) — skipping handler, recording transition`,
      );
    } else {
      const ctx = { db, rpc: this.rpc, transition, blockHeight, timestamp, txId };
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
