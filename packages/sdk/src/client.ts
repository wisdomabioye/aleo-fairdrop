/**
 * AleoNetworkClient singleton — browser-only.
 *
 * Initialized lazily from the rpcUrl passed by the app's env config.
 * Call initAleoClient(rpcUrl) once at app startup (in providers/QueryProvider
 * or env.ts), then use aleoClient anywhere.
 *
 * Cache-Control headers prevent the browser from serving stale mapping values
 * after on-chain state changes.
 */

import { AleoNetworkClient } from '@provablehq/sdk';

let _client: AleoNetworkClient | null = null;

/** Initialize the singleton. Idempotent — subsequent calls with the same URL are no-ops. */
export function initAleoClient(rpcUrl: string): void {
  if (_client) return;
  _client = new AleoNetworkClient(rpcUrl);
  _client.setHeader('Cache-Control', 'no-cache');
  _client.setHeader('Pragma', 'no-cache');
}

/** Get the initialized client. Throws if initAleoClient() was never called. */
export function getAleoClient(): AleoNetworkClient {
  if (!_client) {
    throw new Error('[sdk/client] AleoNetworkClient not initialized. Call initAleoClient(rpcUrl) first.');
  }
  return _client;
}
