import { pgTable, text, integer, timestamp, index } from 'drizzle-orm/pg-core';

/**
 * One row per indexed program. Persisted after each processed block
 * so the indexer can resume from the correct position after a restart.
 */
export const indexerCheckpoints = pgTable('indexer_checkpoints', {
  programId:       text('program_id').primaryKey(),
  lastBlockHeight: integer('last_block_height').notNull(),
  lastBlockHash:   text('last_block_hash').notNull(),
  lastProcessedAt: timestamp('last_processed_at').notNull(),
  status:          text('status').notNull().default('offline'),  // SyncStatus
  lag:             integer('lag').notNull().default(0),
});

/**
 * Processed transition IDs — idempotency guard.
 * The indexer inserts here before writing domain rows. On restart, any
 * transition already in this table is skipped, preventing duplicate rows
 * if the indexer reprocesses the last N blocks.
 */
export const indexerTransitions = pgTable('indexer_transitions', {
  transitionId:   text('transition_id').primaryKey(),
  programId:      text('program_id').notNull(),
  transitionName: text('transition_name').notNull(),
  blockHeight:    integer('block_height').notNull(),
  processedAt:    timestamp('processed_at').notNull(),
}, (t) => [
  index('indexer_transitions_block_height_idx').on(t.blockHeight),
  index('indexer_transitions_program_id_idx').on(t.programId),
]);
