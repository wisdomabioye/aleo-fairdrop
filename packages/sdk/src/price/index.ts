/**
 * @fairdrop/sdk/price — client-side auction price formulas.
 *
 * All functions are deterministic from on-chain config — no RPC calls needed.
 * Operate over a block range to generate chart data or spot prices.
 */

import type { DutchParams, AscendingParams, LbpParams } from '@fairdrop/types/contracts/auctions';

// ── Dutch ─────────────────────────────────────────────────────────────────────

/**
 * Dutch price at a given block.
 * Steps down by `price_decay_amount` every `price_decay_blocks`, floored at `floor_price`.
 */
export function computeDutchPriceAt(
  params:     DutchParams,
  startBlock: number,
  block:      number,
): bigint {
  const start   = BigInt(params.start_price);
  const floor   = BigInt(params.floor_price);
  const elapsed = BigInt(Math.max(0, block - startBlock));
  const steps   = elapsed / BigInt(params.price_decay_blocks);
  const decayed = steps * BigInt(params.price_decay_amount);
  const price   = start - decayed;
  return price > floor ? price : floor;
}

/**
 * Generate a Dutch price curve as [block, price] points.
 * Samples at each decay step boundary for a compact, accurate chart.
 */
export function dutchPriceCurve(
  params:     DutchParams,
  startBlock: number,
  endBlock:   number,
): Array<{ block: number; price: bigint }> {
  const decayBlocks = Number(params.price_decay_blocks);
  const points: Array<{ block: number; price: bigint }> = [];

  points.push({ block: startBlock, price: computeDutchPriceAt(params, startBlock, startBlock) });

  for (let b = startBlock + decayBlocks; b < endBlock; b += decayBlocks) {
    points.push({ block: b, price: computeDutchPriceAt(params, startBlock, b) });
  }

  points.push({ block: endBlock, price: computeDutchPriceAt(params, startBlock, endBlock) });
  return points;
}

// ── Ascending ─────────────────────────────────────────────────────────────────

/**
 * Ascending price at a given block.
 * Steps up by `price_rise_amount` every `price_rise_blocks`, capped at `ceiling_price`.
 */
export function computeAscendingPriceAt(
  params:     AscendingParams,
  startBlock: number,
  block:      number,
): bigint {
  const floor   = BigInt(params.floor_price);
  const ceiling = BigInt(params.ceiling_price);
  const elapsed = BigInt(Math.max(0, block - startBlock));
  const steps   = elapsed / BigInt(params.price_rise_blocks);
  const risen   = steps * BigInt(params.price_rise_amount);
  const price   = floor + risen;
  return price < ceiling ? price : ceiling;
}

/**
 * Generate an Ascending price curve as [block, price] points.
 * Samples at each rise step boundary.
 */
export function ascendingPriceCurve(
  params:     AscendingParams,
  startBlock: number,
  endBlock:   number,
): Array<{ block: number; price: bigint }> {
  const riseBlocks = Number(params.price_rise_blocks);
  const points: Array<{ block: number; price: bigint }> = [];

  points.push({ block: startBlock, price: computeAscendingPriceAt(params, startBlock, startBlock) });

  for (let b = startBlock + riseBlocks; b < endBlock; b += riseBlocks) {
    points.push({ block: b, price: computeAscendingPriceAt(params, startBlock, b) });
  }

  points.push({ block: endBlock, price: computeAscendingPriceAt(params, startBlock, endBlock) });
  return points;
}

// ── LBP ──────────────────────────────────────────────────────────────────────

/**
 * LBP theoretical price at a given block, assuming remaining supply = full supply.
 *
 * formula: floor + (start - floor) × (time_remaining / duration)
 *
 * This is an upper bound — actual price is lower as supply fills.
 * Label charts clearly: "Theoretical ceiling (no bids assumed)".
 */
export function computeLbpPriceAt(
  params:     LbpParams,
  startBlock: number,
  endBlock:   number,
  block:      number,
): bigint {
  const start    = BigInt(params.start_price);
  const floor    = BigInt(params.floor_price);
  const duration = BigInt(Math.max(1, endBlock - startBlock));
  const elapsed  = BigInt(Math.min(Math.max(0, block - startBlock), endBlock - startBlock));
  const remaining = duration - elapsed;
  return floor + (start - floor) * remaining / duration;
}

/**
 * Generate a LBP theoretical price curve as [block, price] points.
 * Sampled at regular intervals (max ~100 points).
 */
export function lbpPriceCurve(
  params:     LbpParams,
  startBlock: number,
  endBlock:   number,
): Array<{ block: number; price: bigint }> {
  const duration = endBlock - startBlock;
  const step     = Math.max(1, Math.floor(duration / 100));
  const points: Array<{ block: number; price: bigint }> = [];

  for (let b = startBlock; b <= endBlock; b += step) {
    points.push({ block: b, price: computeLbpPriceAt(params, startBlock, endBlock, b) });
  }

  if (points[points.length - 1]?.block !== endBlock) {
    points.push({ block: endBlock, price: computeLbpPriceAt(params, startBlock, endBlock, endBlock) });
  }

  return points;
}

// ── Dutch next-drop helper ────────────────────────────────────────────────────

/**
 * Returns the number of blocks until the next Dutch price step,
 * and the price after that drop. Returns null when already at floor.
 */
export function dutchNextDrop(
  params:       DutchParams,
  startBlock:   number,
  currentBlock: number,
): { blocksRemaining: number; nextPrice: bigint } | null {
  const current = computeDutchPriceAt(params, startBlock, currentBlock);
  const floor   = BigInt(params.floor_price);
  if (current <= floor) return null;

  const decayBlocks   = Number(params.price_decay_blocks);
  const elapsed       = currentBlock - startBlock;
  const blocksIntoStep = elapsed % decayBlocks;
  const blocksRemaining = decayBlocks - blocksIntoStep;
  const nextPrice = current - BigInt(params.price_decay_amount);

  return { blocksRemaining, nextPrice: nextPrice > floor ? nextPrice : floor };
}
