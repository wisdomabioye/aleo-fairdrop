/**
 * Main poll loop — fetches new blocks and feeds them to the processor.
 *
 * Strategy:
 *   - On startup, resume from the last checkpoint (stored in DB).
 *   - Each iteration fetches up to BATCH_SIZE blocks behind the finality buffer.
 *   - If fully caught up, waits POLL_INTERVAL_MS before checking again.
 *   - Graceful shutdown on SIGTERM / SIGINT.
 */
import { eq }                   from 'drizzle-orm';
import { indexerCheckpoints }   from '@fairdrop/database';
import type { Db }              from '@fairdrop/database';
import type { AleoRpcClient }   from '../client/rpc.js';
import { BlockProcessor }       from './processor.js';
import { env }                  from '../env.js';

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

    console.log('[poll] starting — confirmation depth:', env.confirmationDepth);

    while (this.running) {
      try {
        await this.tick();
      } catch (err) {
        console.error('[poll] tick error:', err);
      }

      if (this.running) {
        await sleep(env.pollIntervalMs);
      }
    }

    console.log('[poll] stopped');
  }

  stop(signal: string): void {
    console.log(`[poll] received ${signal} — stopping after current tick`);
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
      console.log(`[poll] caught up (tip: ${tipHeight}, from: ${fromHeight}, safe: ${safeHeight})`);
      return;
    }

    const toHeight = Math.min(fromHeight + env.batchSize - 1, safeHeight);
    console.log(`[poll] processing blocks ${fromHeight}–${toHeight} (tip: ${tipHeight})`);

    for (let h = fromHeight; h <= toHeight && this.running; h++) {
      const block = await this.rpc.getBlock(h);
      await this.processor.processBlock(block);
    }
  }

  /** Resume from the block after the last processed one, or from block 1. */
  private async getResumeHeight(): Promise<number> {
    const rows = await this.db
      .select()
      .from(indexerCheckpoints)
      .where(eq(indexerCheckpoints.programId, 'global'))
      .limit(1);

    return rows[0] ? rows[0].lastBlockHeight + 1 : 1;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
