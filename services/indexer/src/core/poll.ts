/**
 * Main poll loop — fetches new blocks and feeds them to the processor.
 *
 * Strategy:
 *   - On startup, resume from the last checkpoint (stored in DB).
 *   - Each iteration fetches up to BATCH_SIZE blocks (≤ 50) in one request
 *     via getBlockRange, staying behind the finality buffer.
 *   - If fully caught up, waits POLL_INTERVAL_MS before checking again.
 *   - Graceful shutdown on SIGTERM / SIGINT.
 */
import { eq }                   from 'drizzle-orm';
import { indexerCheckpoints }   from '@fairdrop/database';
import type { Db }              from '@fairdrop/database';
import type { AleoRpcClient }   from '../client/rpc.js';
import { BlockProcessor }       from './processor.js';
import { createLogger }         from '../logger.js';
import { env }                  from '../env.js';

const log = createLogger('poll');

export class PollLoop {
  private running     = false;
  private readonly processor: BlockProcessor;

  constructor(
    private readonly db:  Db,
    private readonly rpc: AleoRpcClient,
  ) {
    this.processor = new BlockProcessor(db, rpc);
  }

  async start(): Promise<void> {
    this.running = true;

    process.on('SIGTERM', () => this.stop('SIGTERM'));
    process.on('SIGINT',  () => this.stop('SIGINT'));

    log.info(`starting — confirmation depth: ${env.confirmationDepth}, start block: ${env.startBlock}`);

    while (this.running) {
      try {
        await this.tick();
      } catch (err) {
        log.error('tick error', err);
      }

      if (this.running) {
        await sleep(env.pollIntervalMs);
      }
    }

    log.info('stopped');
  }

  stop(signal: string): void {
    log.info(`received ${signal} — stopping after current tick`);
    this.running = false;
  }

  private async tick(): Promise<void> {
    const [tipHeight, fromHeight] = await Promise.all([
      this.rpc.getLatestHeight(),
      this.getResumeHeight(),
    ]);

    // Stay behind the finality buffer.
    const safeHeight = tipHeight - env.confirmationDepth;
    
    if (fromHeight > safeHeight) {
      log.debug(`caught up`, { tip: tipHeight, from: fromHeight, safe: safeHeight });
      return;
    }

    // getBlockRange is capped at 50 by the API; env.batchSize is already clamped to 50.
    const toHeight = Math.min(fromHeight + env.batchSize - 1, safeHeight);
    log.info(`processing blocks ${fromHeight}–${toHeight}`, { tip: tipHeight });

    const blocks = await this.rpc.getBlockRange(fromHeight, toHeight);

    for (const block of blocks) {
      if (!this.running) break;
      await this.processor.processBlock(block, tipHeight);
    }
  }

  /** Resume from the block after the last processed one, or from the configured start block. */
  private async getResumeHeight(): Promise<number> {
    const rows = await this.db
      .select()
      .from(indexerCheckpoints)
      .where(eq(indexerCheckpoints.programId, 'global'))
      .limit(1);

    return rows[0] ? rows[0].lastBlockHeight + 1 : env.startBlock;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
