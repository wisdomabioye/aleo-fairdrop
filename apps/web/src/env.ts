/**
 * Single source of truth for all runtime config.
 *
 * Reads import.meta.env, validates all required vars, and builds the
 * FairdropConfig via defineConfig (which validates network + rpcUrl).
 * Throws at module load time — misconfiguration is caught at startup,
 * not buried in a user flow.
 */

import { defineConfig } from '@fairdrop/config';
import type { FairdropConfig } from '@fairdrop/config';
import { Network } from '@provablehq/aleo-types';

function requireEnv(key: string): string {
  const value = (import.meta.env as Record<string, string | undefined>)[key];
  if (!value || value.trim() === '') {
    throw new Error(
      `[fairdrop/web] Missing required env var: ${key}. ` +
      `Copy .env.example → .env and fill in all values.`,
    );
  }
  return value.trim();
}

// Build and validate the full protocol config (throws on bad network / missing rpcUrl)
export const config: FairdropConfig = defineConfig({
  network: import.meta.env.VITE_ALEO_NETWORK,
  rpcUrl:  import.meta.env.VITE_ALEO_RPC_URL,
});

// Web-app-specific vars not covered by FairdropConfig
export const API_URL      = requireEnv('VITE_API_URL');
export const IPFS_GATEWAY = requireEnv('VITE_IPFS_GATEWAY');

// Wallet adapter network constant derived from config
export const WALLET_NETWORK: Network =
  config.network === 'mainnet' ? Network.MAINNET : Network.TESTNET;
