/**
 * On-chain reads for fairdrop_config_v3.aleo.
 *
 * Protocol configuration is set by governance and rarely changes.
 * Auction contracts snapshot it at create_auction time (D16 pattern).
 */

import type { ProtocolConfig } from '@fairdrop/types/contracts/utilities';
import { PROGRAMS } from '@fairdrop/config';
import { getMappingValue } from './_mapping';
import { parseProtocolConfig } from '../parse/auction';

const CONFIG_PROGRAM = PROGRAMS.config.programId;

/**
 * Fetch the current protocol config from fairdrop_config_v3.aleo.
 * Reads config[0field]. Returns null if not yet initialized.
 */
export async function fetchProtocolConfig(): Promise<ProtocolConfig | null> {
  const raw = await getMappingValue(CONFIG_PROGRAM, 'config', '0field');
  if (!raw) return null;
  try { return parseProtocolConfig(raw); } catch { return null; }
}

/**
 * Fetch the paused state of the protocol.
 * Reads paused[0field]. Returns false if not set (not paused).
 */
export async function fetchPaused(): Promise<boolean> {
  const raw = await getMappingValue(CONFIG_PROGRAM, 'paused', '0field');
  if (!raw) return false;
  return raw.trim() === 'true';
}
