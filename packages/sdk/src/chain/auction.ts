/**
 * On-chain mapping reads for fairdrop auction contracts.
 *
 * All functions return null on miss or RPC error — callers decide whether to
 * throw or display a loading state. bigint-returning functions return 0n on miss
 * (balance-style semantics: no entry means zero).
 */

import type { BaseAuctionConfig, AuctionState, AuctionStats } from '@fairdrop/types/contracts/auctions';
import { getMappingValue } from './_mapping';
import { parseU128, u128ToBigInt } from '../parse';
import { parseBaseAuctionConfig, parseAuctionState, parseAuctionStats } from '../parse/auction';

// ── Config & state ────────────────────────────────────────────────────────────

/**
 * Fetch the immutable auction config (common fields).
 * Reads auction_configs[auctionId].
 */
export async function fetchAuctionConfig(
  auctionId: string,
  programId: string,
): Promise<BaseAuctionConfig | null> {
  const raw = await getMappingValue(programId, 'auction_configs', auctionId);
  if (!raw) return null;
  try { return parseBaseAuctionConfig(raw); } catch { return null; }
}

/**
 * Fetch the mutable auction lifecycle state.
 * Reads auction_states[auctionId].
 */
export async function fetchAuctionState(
  auctionId: string,
  programId: string,
): Promise<AuctionState | null> {
  const raw = await getMappingValue(programId, 'auction_states', auctionId);
  if (!raw) return null;
  try { return parseAuctionState(raw); } catch { return null; }
}

// ── Treasury & escrow ─────────────────────────────────────────────────────────

/**
 * Fetch the escrowed payment token balance for an auction.
 * Reads escrow_payments[auctionId]. Returns 0n on miss.
 */
export async function fetchEscrowPayments(auctionId: string, programId: string): Promise<bigint> {
  const raw = await getMappingValue(programId, 'escrow_payments', auctionId);
  return raw ? u128ToBigInt(parseU128(raw)) : 0n;
}

/**
 * Fetch the escrowed sale token balance for an auction.
 * Reads escrow_sales[auctionId]. Returns 0n on miss.
 */
export async function fetchEscrowSales(auctionId: string, programId: string): Promise<bigint> {
  const raw = await getMappingValue(programId, 'escrow_sales', auctionId);
  return raw ? u128ToBigInt(parseU128(raw)) : 0n;
}

/**
 * Fetch the accumulated protocol treasury balance for an auction program.
 * Reads protocol_treasury[0field]. Returns 0n on miss.
 */
export async function fetchProtocolTreasury(programId: string): Promise<bigint> {
  const raw = await getMappingValue(programId, 'protocol_treasury', '0field');
  return raw ? u128ToBigInt(parseU128(raw)) : 0n;
}

/**
 * Fetch how much the creator has already withdrawn from an auction.
 * Reads creator_withdrawn[auctionId]. Returns 0n on miss.
 */
export async function fetchCreatorWithdrawn(auctionId: string, programId: string): Promise<bigint> {
  const raw = await getMappingValue(programId, 'creator_withdrawn', auctionId);
  return raw ? u128ToBigInt(parseU128(raw)) : 0n;
}

// ── Auction index ─────────────────────────────────────────────────────────────

/**
 * Fetch the creator's current nonce.
 * Reads creator_nonces[creator]. Returns 0n if the creator has no auctions yet.
 * The next auction nonce = current + 1 (incremented inside create_auction).
 */
export async function fetchCreatorNonce(creator: string, programId: string): Promise<bigint> {
  const raw = await getMappingValue(programId, 'creator_nonces', creator);
  if (!raw) return 0n;
  try { return BigInt(raw.replace(/u\d+$/, '').trim()); } catch { return 0n; }
}

/**
 * Fetch global auction stats.
 * Reads stats[0field]. Returns null if no auctions have been created yet.
 */
export async function fetchAuctionStats(programId: string): Promise<AuctionStats | null> {
  const raw = await getMappingValue(programId, 'stats', '0field');
  if (!raw) return null;
  try { return parseAuctionStats(raw); } catch { return null; }
}

/**
 * Fetch the accumulated sqrt weights for a Quadratic auction.
 * Reads sqrt_weights[auctionId]. Returns 0n on miss.
 *
 * Pass the result as `totalSqrtWeight` to claimBid() / claimVested() for
 * Quadratic auctions (D11: finalize asserts against this mapping value).
 */
export async function fetchSqrtWeights(auctionId: string, programId: string): Promise<bigint> {
  const raw = await getMappingValue(programId, 'sqrt_weights', auctionId);
  return raw ? u128ToBigInt(parseU128(raw)) : 0n;
}

/**
 * Walk the creator's linked-list auction index to collect all their auction IDs.
 * Reads creator_latest_auction[creator] then follows auction_prev_by_creator[id]
 * until the sentinel value (0field).
 *
 * Returns auction IDs in reverse-creation order (newest first).
 */
export async function fetchCreatorAuctions(
  creator:   string,
  programId: string,
): Promise<string[]> {
  const ids: string[] = [];
  const latest = await getMappingValue(programId, 'creator_latest_auction', creator);
  if (!latest || latest === '0field') return ids;

  let current = latest;
  while (current && current !== '0field') {
    ids.push(current);
    const prev = await getMappingValue(programId, 'auction_prev_by_creator', current);
    current = prev ?? '0field';
  }
  return ids;
}
