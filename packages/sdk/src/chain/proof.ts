/**
 * On-chain mapping reads for fairdrop_proof_v3.aleo.
 */

import type { CreatorReputation } from '@fairdrop/types/contracts/utilities';
import { PROGRAMS } from '@fairdrop/config';
import { getMappingValue } from './_mapping';
import { parseCreatorReputation } from '../parse/utilities';

const PROOF_PROGRAM = PROGRAMS.proof.programId;

/**
 * Fetch a creator's reputation stats.
 * Reads reputation[creator]. Returns null if the creator has no recorded activity.
 */
export async function fetchCreatorReputation(creator: string): Promise<CreatorReputation | null> {
  const raw = await getMappingValue(PROOF_PROGRAM, 'reputation', creator);
  if (!raw) return null;
  try { return parseCreatorReputation(raw); } catch { return null; }
}

/**
 * Check whether a bidder key has participated in an auction.
 * Reads participated[bidderKey] where bidderKey = BHP256(BidderKey{bidder, auction_id}).
 * Returns false on miss (not participated).
 */
export async function fetchHasParticipated(bidderKey: string): Promise<boolean> {
  const raw = await getMappingValue(PROOF_PROGRAM, 'participated', bidderKey);
  return raw?.trim() === 'true';
}

/**
 * Check whether an address is authorised to call issue_receipt.
 * Reads allowed_callers[address]. Returns false on miss.
 */
export async function fetchIsAllowedProofCaller(address: string): Promise<boolean> {
  const raw = await getMappingValue(PROOF_PROGRAM, 'allowed_callers', address);
  return raw?.trim() === 'true';
}
