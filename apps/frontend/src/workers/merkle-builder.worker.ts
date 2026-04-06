import { initializeWasm } from '@provablehq/sdk';
import { buildMerkleTree } from '@fairdrop/sdk/hash';
import type { MerkleProof } from '@fairdrop/sdk/hash';

await initializeWasm();

export interface MerkleWorkerRequest {
  addresses: string[];
}

export interface MerkleWorkerResponse {
  root:   string;
  /** Map serialised to plain object for postMessage transfer. */
  proofs: Record<string, MerkleProof>;
}

self.onmessage = (e: MessageEvent<MerkleWorkerRequest>) => {
  try {
    const { root, proofs } = buildMerkleTree(e.data.addresses);
    const response: MerkleWorkerResponse = {
      root,
      proofs: Object.fromEntries(proofs),
    };
    self.postMessage({ ok: true, data: response });
  } catch (err) {
    self.postMessage({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
