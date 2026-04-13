/**
 * Pure parsers for Aleo record plaintexts → typed SDK record objects.
 *
 * These are framework-free utilities. React hooks that call requestRecords()
 * can delegate to these instead of repeating the parsing logic.
 *
 * Note on stripVisibility:
 *   Bid record fields (auction_id, quantity, payment_amount) come without a
 *   visibility suffix — do NOT strip.
 *   Commitment record fields (auction_id, commitment, nonce) carry a
 *   `.private` suffix in the plaintext — stripVisibility is required.
 *   This mirrors the confirmed-working frontend hook behaviour.
 */

import { parsePlaintext, stripVisibility, parseU128, u128ToBigInt } from '../parse';
import type { WalletRecord, WalletBidRecord, WalletSealedCommitment } from '@fairdrop/types/primitives';

/**
 * All record names that represent a bid receipt across auction types.
 * Dutch/Ascending/Sealed use "Bid"; other types use type-specific names.
 */
export const BID_RECORD_NAMES: ReadonlySet<string> = new Set([
  'Bid',          // Dutch, Ascending, Sealed
  'RaiseBid',     // Raise
  'LBPBid',       // LBP
  'QuadraticBid', // Quadratic
]);

/**
 * Parse a raw WalletRecord into a WalletBidRecord.
 * Returns null if the record is not a Bid or the plaintext is malformed.
 *
 * @param entry      Raw wallet record (must have been fetched with includePlaintext: true).
 * @param programId  Program this record belongs to.
 */
export function parseBidRecord(
  entry:     WalletRecord,
  programId: string,
): WalletBidRecord | null {
  if (!BID_RECORD_NAMES.has(entry.recordName)) return null;
  try {
    const fields = parsePlaintext(entry.recordPlaintext);
    return {
      id:             entry.commitment,
      programId,
      auction_id:     fields['auction_id']     ?? '',
      quantity:       u128ToBigInt(parseU128(fields['quantity']       ?? '0u128')),
      payment_amount: u128ToBigInt(parseU128(fields['payment_amount'] ?? '0u128')),
      spent:          entry.spent,
      _record:        entry.recordPlaintext,
    };
  } catch {
    return null;
  }
}

/**
 * Parse a raw WalletRecord into a WalletSealedCommitment.
 * Returns null if the record is not a Commitment or the plaintext is malformed.
 *
 * @param entry      Raw wallet record (must have been fetched with includePlaintext: true).
 * @param programId  Program this record belongs to.
 */
export function parseCommitmentRecord(
  entry:     WalletRecord,
  programId: string,
): WalletSealedCommitment | null {
  if (entry.recordName !== 'Commitment') return null;
  try {
    const fields = parsePlaintext(entry.recordPlaintext);
    return {
      id:             entry.commitment,
      programId,
      auction_id:     stripVisibility(fields['auction_id']  ?? ''),
      quantity:       u128ToBigInt(parseU128(fields['quantity']       ?? '0u128')),
      payment_amount: u128ToBigInt(parseU128(fields['payment_amount'] ?? '0u128')),
      commitment:     stripVisibility(fields['commitment']  ?? ''),
      nonce:          stripVisibility(fields['nonce']       ?? ''),
      spent:          entry.spent,
      _record:        entry.recordPlaintext,
    };
  } catch {
    return null;
  }
}
