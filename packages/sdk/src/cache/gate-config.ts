/**
 * localStorage cache for GateConfig from fairdrop_gate_v3.aleo.
 *
 * Gate config is registered once per auction at create_auction time and never
 * updated on-chain. No TTL needed.
 */

import type { GateConfig } from '@fairdrop/types/contracts/utilities';
import { cacheKey, getPersisted, setPersisted } from './persist';

const NS = 'gate-config';

export function getCachedGateConfig(auctionId: string): GateConfig | null {
  return getPersisted<GateConfig>(cacheKey(NS, auctionId));
}

export function setCachedGateConfig(auctionId: string, config: GateConfig): void {
  setPersisted(cacheKey(NS, auctionId), config);
}
