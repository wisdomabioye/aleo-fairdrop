import { useRef, useState, useCallback } from 'react';
import { buildMerkleTree } from '@fairdrop/sdk/hash';
import type { MerkleProof } from '@fairdrop/sdk/hash';

export interface MerkleWorkerResponse {
  root:   string;
  proofs: Record<string, MerkleProof>;
}

/**
 * Builds a BHP256 Merkle allowlist tree on the main thread.
 *
 * Previous approach spawned a dedicated Web Worker, but the second
 * @provablehq/sdk WASM instance failed to load reliably in a separate
 * worker context. With BHP256 caching (singleton hasher in _bhp.ts),
 * the computation is fast enough for typical allowlists (< 1000 addresses)
 * to run synchronously after a single yield for the UI to update.
 */
export function useMerkleBuilder() {
  const timerRef               = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [building, setBuilding] = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  const build = useCallback((
    addresses: string[],
    onDone: (result: MerkleWorkerResponse) => void,
  ) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setError(null);
    setBuilding(true);

    // Yield one frame so React can render the "Computing tree…" state
    // before the synchronous computation begins.
    timerRef.current = setTimeout(() => {
      try {
        const { root, proofs } = buildMerkleTree(addresses);
        const response: MerkleWorkerResponse = {
          root,
          proofs: Object.fromEntries(proofs),
        };
        onDone(response);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBuilding(false);
        timerRef.current = null;
      }
    }, 0);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { build, building, error, clearError };
}
