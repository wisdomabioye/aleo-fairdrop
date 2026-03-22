/**
 * Aleo protocol program IDs — canonical names that never change.
 *
 * Fairdrop-owned program IDs live in `@fairdrop/config` (PROGRAMS).
 * This file covers Aleo protocol programs that are not part of the Fairdrop
 * deployment and therefore do not belong in PROGRAMS.
 *
 * Usage:
 *   import { SYSTEM_PROGRAMS } from '@fairdrop/sdk/constants';
 *   wallet.requestRecords(SYSTEM_PROGRAMS.tokenRegistry);
 */
export const SYSTEM_PROGRAMS = {
  tokenRegistry: 'token_registry.aleo',
  credits:       'credits.aleo',
} as const;
