function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val || val.trim() === '') {
    throw new Error(`[indexer] Missing required env var: ${name}`);
  }
  return val.trim();
}

function requirePositiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  if (isNaN(n) || n <= 0) throw new Error(`[indexer] ${name} must be a positive integer, got: "${raw}"`);
  return n;
}

export const env = {
  databaseUrl:          requireEnv('DATABASE_URL'),
  aleoNetwork:          requireEnv('ALEO_NETWORK'),
  aleoRpcUrl:           requireEnv('ALEO_RPC_URL'),
  /** Blocks behind chain tip to wait before indexing (finality buffer). */
  confirmationDepth:    requirePositiveInt('INDEXER_CONFIRMATION_DEPTH', 10),
  /** Poll interval in milliseconds. */
  pollIntervalMs:       requirePositiveInt('INDEXER_POLL_INTERVAL_MS', 5000),
  /**
   * Max blocks fetched per iteration via getBlockRange (API cap: 50).
   * Each batch = 1 RPC call. Each create_auction event = 2 extra mapping reads.
   * At 5 req/s (api.explorer.aleo.org limit) and 100k req/day budget,
   * keep this ≤ 50; default 50 saturates the API's batch limit.
   */
  batchSize:            Math.min(requirePositiveInt('INDEXER_BATCH_SIZE', 50), 50),
  /**
   * Block height to start from on cold start (no DB checkpoint).
   * Set to the fairdrop contract deployment block to skip irrelevant history.
   * Default 1 is safe but slow for a fresh chain.
   */
  startBlock:           requirePositiveInt('INDEXER_START_BLOCK', 1),
} as const;
