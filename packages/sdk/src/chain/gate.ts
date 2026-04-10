/**
 * On-chain mapping reads for fairdrop_gate_v3.aleo.
 */

import type { GateConfig } from '@fairdrop/types/contracts/utilities';
import { PROGRAMS } from '@fairdrop/config';
import { getMappingValue } from './_mapping';
import { assembleGateConfig } from '../parse/utilities';

const GATE_PROGRAM = PROGRAMS.gate.programId;

/**
 * Fetch the gate configuration for an auction.
 * Reads gate_modes, allowlists, and credential_issuers in parallel.
 * Returns null if the auction has no registered gate.
 */
export async function fetchGateConfig(auctionId: string): Promise<GateConfig | null> {
  const [mode, root, issuer] = await Promise.all([
    getMappingValue(GATE_PROGRAM, 'gate_modes',          auctionId),
    getMappingValue(GATE_PROGRAM, 'allowlists',          auctionId),
    getMappingValue(GATE_PROGRAM, 'credential_issuers',  auctionId),
  ]);
  if (!mode) return null; // no gate registered for this auction
  return assembleGateConfig(mode, root, issuer);
}

/**
 * Check whether a bidder key has been verified for a gated auction.
 * Reads verified[bidderKey]. Returns false on miss.
 */
export async function fetchIsVerified(bidderKey: string): Promise<boolean> {
  const raw = await getMappingValue(GATE_PROGRAM, 'verified', bidderKey);
  return raw?.trim() === 'true';
}

/**
 * Check whether a gate has been registered for an auction.
 * Reads gate_registered[auctionId].
 */
export async function fetchIsGateRegistered(auctionId: string): Promise<boolean> {
  const raw = await getMappingValue(GATE_PROGRAM, 'gate_registered', auctionId);
  return raw?.trim() === 'true';
}

/**
 * Check whether an address is authorised to call register_gate.
 * Reads allowed_callers[address]. Returns false on miss.
 */
export async function fetchIsAllowedGateCaller(address: string): Promise<boolean> {
  const raw = await getMappingValue(GATE_PROGRAM, 'allowed_callers', address);
  return raw?.trim() === 'true';
}
