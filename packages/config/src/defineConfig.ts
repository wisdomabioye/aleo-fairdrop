import { PROGRAMS, DEFAULT_ACCOUNTS } from './programs';
import type { ConfigEnv, FairdropConfig, Network } from './types';

const EXPLORER_URLS: Record<Network, string> = {
  testnet: 'https://testnet.explorer.provable.com/transaction',
  mainnet: 'https://explorer.provable.com/transaction',
};

function requireEnv(name: string, value: string | undefined): string {
  if (!value || value.trim() === '') {
    throw new Error(
      `[fairdrop/config] Missing required env var: ${name}. ` +
      `Pass it via defineConfig({ ${name}: process.env.YOUR_VAR }).`,
    );
  }
  return value.trim();
}

function requireNetwork(value: string | undefined): Network {
  const v = requireEnv('network', value);
  if (v !== 'testnet' && v !== 'mainnet') {
    throw new Error(
      `[fairdrop/config] Invalid network "${v}". Expected "testnet" or "mainnet".`,
    );
  }
  return v;
}

/**
 * Build a fully validated FairdropConfig from explicit env vars.
 *
 * Throws immediately on missing or invalid values — fail loudly at startup,
 * not silently at runtime.
 *
 * @example — apps/web (Vite)
 * ```ts
 * export const config = defineConfig({
 *   network: import.meta.env.VITE_ALEO_NETWORK,
 *   rpcUrl:  import.meta.env.VITE_ALEO_RPC_URL,
 * });
 * ```
 *
 * @example — services (Node)
 * ```ts
 * export const config = defineConfig({
 *   network: process.env.ALEO_NETWORK,
 *   rpcUrl:  process.env.ALEO_RPC_URL,
 * });
 * ```
 */
export function defineConfig(env: ConfigEnv): FairdropConfig {
  const network = requireNetwork(env.network);
  const rpcUrl  = requireEnv('rpcUrl', env.rpcUrl);

  return {
    network,
    rpcUrl,
    explorerUrl: EXPLORER_URLS[network],
    programs:    PROGRAMS,
    accounts:    DEFAULT_ACCOUNTS,
  };
}
