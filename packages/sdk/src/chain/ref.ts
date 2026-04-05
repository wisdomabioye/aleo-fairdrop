/**
 * On-chain mapping reads for fairdrop_ref_v2.aleo.
 */

import type { ReferralConfig, ReferralRecord } from '@fairdrop/types/contracts/utilities';
import { PROGRAMS } from '@fairdrop/config';
import { getMappingValue } from './_mapping';
import { parseU128, u128ToBigInt } from '../parse';
import { parseReferralConfig, parseReferralRecord } from '../parse/utilities';

const REF_PROGRAM = PROGRAMS.ref.programId;

/**
 * Fetch the referral code registration for a code ID.
 * Reads registrations[codeId]. Returns null if the code is not registered.
 */
export async function fetchReferralConfig(codeId: string): Promise<ReferralConfig | null> {
  const raw = await getMappingValue(REF_PROGRAM, 'registrations', codeId);
  if (!raw) return null;
  try { return parseReferralConfig(raw); } catch { return null; }
}

/**
 * Fetch a specific referral record (per-bidder attribution).
 * Reads referral_records[key] where key = BHP256(bidder_key, code_id).
 * Returns null if not found.
 */
export async function fetchReferralRecord(key: string): Promise<ReferralRecord | null> {
  const raw = await getMappingValue(REF_PROGRAM, 'referral_records', key);
  if (!raw) return null;
  try { return parseReferralRecord(raw); } catch { return null; }
}

/**
 * Fetch the earned commission balance for a bidder key.
 * Reads earned[bidderKey]. Returns 0n on miss.
 */
export async function fetchEarned(bidderKey: string): Promise<bigint> {
  const raw = await getMappingValue(REF_PROGRAM, 'earned', bidderKey);
  return raw ? u128ToBigInt(parseU128(raw)) : 0n;
}

/**
 * Fetch the referral reserve for an auction (the budget available to claim).
 * Reads referral_reserve[auctionId]. Returns 0n on miss.
 */
export async function fetchReferralReserve(auctionId: string): Promise<bigint> {
  const raw = await getMappingValue(REF_PROGRAM, 'referral_reserve', auctionId);
  return raw ? u128ToBigInt(parseU128(raw)) : 0n;
}

/**
 * Fetch the total number of referrals attributed to a code.
 * Reads referral_count[codeId]. Returns 0n on miss.
 */
export async function fetchReferralCount(codeId: string): Promise<bigint> {
  const raw = await getMappingValue(REF_PROGRAM, 'referral_count', codeId);
  if (!raw) return 0n;
  try { return BigInt(raw.replace(/u\d+$/, '').trim()); } catch { return 0n; }
}

/**
 * Fetch the bidder key stored at a referral list position.
 * Reads referral_list[listKey] where listKey = computeRefListKey(codeId, index).
 * Returns the raw field string (bidder key) or null if not found.
 */
export async function fetchReferralListEntry(listKey: string): Promise<string | null> {
  const raw = await getMappingValue(REF_PROGRAM, 'referral_list', listKey);
  return raw?.trim() ?? null;
}

/**
 * Check whether the referral reserve has been funded for an auction.
 * Reads reserve_funded[auctionId]. Returns false on miss.
 */
export async function fetchIsReserveFunded(auctionId: string): Promise<boolean> {
  const raw = await getMappingValue(REF_PROGRAM, 'reserve_funded', auctionId);
  return raw?.trim() === 'true';
}

/**
 * Check whether an address is authorised to call record_referral.
 * Reads allowed_callers[address]. Returns false on miss.
 */
export async function fetchIsAllowedRefCaller(address: string): Promise<boolean> {
  const raw = await getMappingValue(REF_PROGRAM, 'allowed_callers', address);
  return raw?.trim() === 'true';
}
