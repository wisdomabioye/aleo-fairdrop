/**
 * Batch scanners — filter a raw WalletRecord array into typed record arrays.
 *
 * These are the main entry points for framework-specific code (React hooks,
 * CLI scripts, indexers) to turn a requestRecords() result into typed objects.
 *
 * Usage in a React hook:
 *   const bidRecords = useMemo(
 *     () => scanBidRecords(entries, programId, auctionId),
 *     [entries, programId, auctionId],
 *   );
 */

import type { WalletRecord, WalletBidRecord, WalletSealedCommitment } from '@fairdrop/types/primitives';
import { parseBidRecord, parseCommitmentRecord }                       from './parse';

/**
 * Scan raw wallet records and return all valid Bid records.
 *
 * @param entries    Raw records from requestRecords(programId, true).
 * @param programId  Program these records belong to.
 * @param auctionId  When provided, only Bids for this auction are returned.
 */
export function scanBidRecords(
  entries:    WalletRecord[],
  programId:  string,
  auctionId?: string,
): WalletBidRecord[] {
  const result: WalletBidRecord[] = [];
  for (const entry of entries) {
    const bid = parseBidRecord(entry, programId);
    if (!bid) continue;
    if (auctionId && bid.auction_id !== auctionId) continue;
    result.push(bid);
  }
  return result;
}

/**
 * Scan raw wallet records and return all valid Commitment records.
 *
 * @param entries    Raw records from requestRecords(programId, true).
 * @param programId  Program these records belong to.
 * @param auctionId  When provided, only Commitments for this auction are returned.
 */
export function scanCommitmentRecords(
  entries:    WalletRecord[],
  programId:  string,
  auctionId?: string,
): WalletSealedCommitment[] {
  const result: WalletSealedCommitment[] = [];
  for (const entry of entries) {
    const commitment = parseCommitmentRecord(entry, programId);
    if (!commitment) continue;
    if (auctionId && commitment.auction_id !== auctionId) continue;
    result.push(commitment);
  }
  return result;
}

/**
 * Scan raw wallet records for both Bid and Commitment records in one pass.
 * Useful for cross-program scans like useClaimable where both types matter.
 *
 * @param entries    Raw records from requestRecords(programId, true).
 * @param programId  Program these records belong to.
 */
export function scanAuctionRecords(
  entries:   WalletRecord[],
  programId: string,
): { bids: WalletBidRecord[]; commitments: WalletSealedCommitment[] } {
  const bids:        WalletBidRecord[]        = [];
  const commitments: WalletSealedCommitment[] = [];
  for (const entry of entries) {
    if (entry.recordName === 'Bid') {
      const bid = parseBidRecord(entry, programId);
      if (bid) bids.push(bid);
    } else if (entry.recordName === 'Commitment') {
      const commitment = parseCommitmentRecord(entry, programId);
      if (commitment) commitments.push(commitment);
    }
  }
  return { bids, commitments };
}
