/**
 * Thin typed wrapper over the Aleo REST API.
 * Uses native fetch — no WASM SDK required for the indexer.
 *
 * Base URL convention:
 *   ALEO_RPC_URL = https://api.explorer.aleo.org/v1/testnet
 *   → GET /block/{height}                          → AleoBlock
 *   → GET /latest/height                           → number
 *   → GET /program/{id}/mapping/{name}/{key}       → string (Leo plaintext)
 *
 * Rate limits (api.explorer.aleo.org):
 *   5 requests/second · 100,000 requests/day
 *
 * The throttle enforces a minimum gap of 1000/MAX_RPS ms between requests,
 * serialising all outbound calls through a single queue so concurrent code
 * paths (e.g. Promise.all in handlers) cannot burst past the limit.
 */
import type { AleoBlock } from '../types/aleo.js';

const MAX_RPS        = 5;
const MIN_INTERVAL   = Math.ceil(1000 / MAX_RPS); // 200 ms between calls

export class AleoRpcClient {
  /** Timestamp of the last dispatched request. */
  private lastCallAt = 0;
  /** Pending calls queue — serialised to avoid bursting. */
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly base: string) {}

  /**
   * Throttled GET — all requests pass through this method.
   * Calls are serialised; each waits until MIN_INTERVAL ms has elapsed
   * since the previous one before dispatching.
   */
  private get<T>(path: string): Promise<T> {
    // Chain onto the queue so concurrent callers wait their turn.
    const result = this.queue.then(async () => {
      const now  = Date.now();
      const wait = this.lastCallAt + MIN_INTERVAL - now;
      if (wait > 0) await sleep(wait);
      this.lastCallAt = Date.now();

      const url = `${this.base}${path}`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });

      if (res.status === 429) {
        // Back off and retry once on rate-limit response.
        console.warn(`[rpc] 429 rate limited — backing off 2s (${url})`);
        await sleep(2000);
        const retry = await fetch(url, { headers: { Accept: 'application/json' } });
        if (!retry.ok) throw new Error(`[rpc] GET ${url} → ${retry.status} ${retry.statusText}`);
        return retry.json() as Promise<T>;
      }

      if (!res.ok) throw new Error(`[rpc] GET ${url} → ${res.status} ${res.statusText}`);
      return res.json() as Promise<T>;
    });

    // Advance the queue pointer (suppress unhandled rejection on queue itself).
    this.queue = result.then(() => undefined, () => undefined);
    return result;
  }

  /** Latest confirmed block height. */
  getLatestHeight(): Promise<number> {
    return this.get<number>('/latest/height');
  }

  /** Single block by height. */
  getBlock(height: number): Promise<AleoBlock> {
    return this.get<AleoBlock>(`/block/${height}`);
  }

  /**
   * Read a mapping value as a Leo plaintext string.
   * Returns null if the key does not exist in the mapping.
   */
  async getMappingValue(
    programId:   string,
    mappingName: string,
    key:         string,
  ): Promise<string | null> {
    try {
      return await this.get<string>(`/program/${programId}/mapping/${mappingName}/${key}`);
    } catch (err) {
      if (err instanceof Error && err.message.includes('404')) return null;
      throw err;
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
