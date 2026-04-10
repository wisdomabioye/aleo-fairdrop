/**
 * On-chain mapping reads for fairdrop_vest_v3.aleo.
 *
 * Vesting allocations are stored as private records (VestedAllocation) —
 * there are no public state mappings for individual allocations.
 * The only public mapping is allowed_callers, which governs which programs
 * (auction contracts) may call create_vest.
 */

import { PROGRAMS } from '@fairdrop/config';
import { getMappingValue } from './_mapping';

const VEST_PROGRAM = PROGRAMS.vest.programId;

/**
 * Check whether an address is authorised to call create_vest.
 * Reads allowed_callers[address]. Returns false on miss.
 *
 * Auction contracts are registered as allowed callers at deployment time
 * via set_allowed_caller (multisig-approved).
 */
export async function fetchIsAllowedVestCaller(address: string): Promise<boolean> {
  const raw = await getMappingValue(VEST_PROGRAM, 'allowed_callers', address);
  return raw?.trim() === 'true';
}
