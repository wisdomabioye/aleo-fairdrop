/**
 * On-chain mapping reads for fairdrop_multisig_v2.aleo.
 */

import { PROGRAMS } from '@fairdrop/config';
import { getMappingValue } from './_mapping';

const MULTISIG_PROGRAM = PROGRAMS.multisig.programId;

/**
 * Check whether an op hash has been approved by the multisig.
 * Reads approved_ops[opHash]. Returns false on miss.
 */
export async function fetchIsOpApproved(opHash: string): Promise<boolean> {
  const raw = await getMappingValue(MULTISIG_PROGRAM, 'approved_ops', opHash);
  return raw?.trim() === 'true';
}

/**
 * Check whether an address is a multisig admin.
 * Reads admins[address]. Returns false on miss.
 */
export async function fetchIsAdmin(address: string): Promise<boolean> {
  const raw = await getMappingValue(MULTISIG_PROGRAM, 'admins', address);
  return raw?.trim() === 'true';
}

/**
 * Check whether a request ID has already been executed.
 * Reads executed_ops[requestId]. Returns false on miss.
 */
export async function fetchIsOpExecuted(requestId: bigint): Promise<boolean> {
  const raw = await getMappingValue(MULTISIG_PROGRAM, 'executed_ops', `${requestId}u64`);
  return raw?.trim() === 'true';
}

/**
 * Check whether the multisig has been bootstrapped via initialize().
 * Reads initialized[0field]. Returns false if not yet called.
 */
export async function fetchIsMultisigInitialized(): Promise<boolean> {
  const raw = await getMappingValue(MULTISIG_PROGRAM, 'initialized', '0field');
  return raw?.trim() === 'true';
}

/**
 * Fetch the stored checksum for an approved contract upgrade.
 * Reads approved_upgrades[contractKey].
 * Returns the checksum as a number[] (32 bytes), or null if not approved.
 */
export async function fetchApprovedUpgradeChecksum(contractKey: string): Promise<number[] | null> {
  const raw = await getMappingValue(MULTISIG_PROGRAM, 'approved_upgrades', contractKey);
  if (!raw) return null;
  try {
    // Leo serialises [u8; 32] as "[ 0u8, 1u8, ... ]"
    const matches = raw.matchAll(/(\d+)u8/g);
    return Array.from(matches, m => parseInt(m[1]!, 10));
  } catch {
    return null;
  }
}
