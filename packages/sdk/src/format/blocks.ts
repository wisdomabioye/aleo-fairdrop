/**
 * Block-height-to-wall-clock estimation.
 *
 * Aleo produces one block approximately every 10 seconds on mainnet (testnet may vary).
 * Estimates are inherently approximate — display as "~N min" not precise timestamps.
 */

const SECONDS_PER_BLOCK = 10;

/**
 * Estimate the wall-clock Date at which `targetBlock` will be reached.
 *
 * @param targetBlock  — The block height to estimate.
 * @param currentBlock — The latest known chain block height.
 * @param now          — Reference timestamp in ms (default: Date.now()). Useful for tests.
 */
export function estimateDate(
  targetBlock: number,
  currentBlock: number,
  now: number = Date.now(),
): Date {
  const blocksRemaining = targetBlock - currentBlock;
  const msRemaining     = blocksRemaining * SECONDS_PER_BLOCK * 1000;
  return new Date(now + msRemaining);
}

/**
 * Estimate the number of minutes until `targetBlock` is reached.
 * Returns a negative value if the block is already in the past.
 */
export function estimateMinutes(targetBlock: number, currentBlock: number): number {
  return ((targetBlock - currentBlock) * SECONDS_PER_BLOCK) / 60;
}
