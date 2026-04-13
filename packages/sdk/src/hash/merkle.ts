/**
 * BHP256 sparse Merkle tree builder for the Fairdrop allowlist gate.
 *
 * Mirrors the 20-level tree used by fairdrop_gate_v3.aleo verify_merkle.
 * Uses sparse computation — only occupied nodes and their ancestors are hashed,
 * with precomputed empty-subtree constants filling the gaps.
 * Cost: O(N × DEPTH) not O(2^DEPTH).
 */

import { hashStruct }  from './_bhp';
import { ZERO_ADDRESS } from '../constants';

const DEPTH = 20; // matches fairdrop_gate_v3.aleo — max 2^20 addresses

// ── Internal hash helpers ─────────────────────────────────────────────────────

function leafHash(addr: string): string {
  return hashStruct(`{ addr: ${addr} }`);
}

function nodeHash(left: string, right: string): string {
  return hashStruct(`{ left: ${left}, right: ${right} }`);
}

// ── Empty subtree precomputation ──────────────────────────────────────────────
// empty[0] = BHP256(LeafHash { addr: ZERO_ADDRESS })
// empty[l] = BHP256(MerkleNode { left: empty[l-1], right: empty[l-1] })
// All-empty subtrees at any depth share the same hash (constant per level).
// Cached after first computation — these never change.

let _emptyCache: string[] | null = null;

function buildEmptyHashes(): string[] {
  if (_emptyCache) return _emptyCache;
  const h: string[] = [leafHash(ZERO_ADDRESS)];
  for (let l = 1; l <= DEPTH; l++) {
    h.push(nodeHash(h[l - 1], h[l - 1]));
  }
  _emptyCache = h;
  return h;
}

// ── Public types ──────────────────────────────────────────────────────────────

export interface MerkleProof {
  /** 20 sibling field literals — passed directly to verify_merkle as proof[]. */
  siblings: string[];
  /**
   * Packed u32 — lower 20 bits of the leaf index. Passed as path_bits.
   *
   * Bit l = 1 means the node at level l is a RIGHT child, so the sibling
   * (proof[l]) is on the left. Equivalent to (leafIndex >> l) & 1.
   */
  pathBits: number;
}

export interface MerkleTree {
  /** BHP256 root field — register as merkle_root in GateParams at auction creation. */
  root: string;
  /**
   * Per-address proofs. Distribute each entry to the corresponding bidder.
   * Bidder calls verify_merkle(auctionId, proof.siblings, proof.pathBits).
   */
  proofs: Map<string, MerkleProof>;
}

// ── Main builder ──────────────────────────────────────────────────────────────

/**
 * Build a 20-level BHP256 Merkle allowlist tree from a list of Aleo addresses.
 *
 * @param addresses  List of aleo1... addresses to allowlist. Order determines
 *                   leaf index (position 0 is the leftmost leaf). Duplicate
 *                   addresses are deduplicated — last occurrence wins.
 * @returns          Root field to register on-chain + per-address proof objects.
 */
export function buildMerkleTree(addresses: string[]): MerkleTree {
  if (addresses.length > 2 ** DEPTH) {
    throw new Error(`Allowlist exceeds max tree size (${2 ** DEPTH})`);
  }
  if (addresses.length === 0) {
    throw new Error('Allowlist must contain at least one address');
  }

  const empty = buildEmptyHashes();

  // levelMaps[l]: Map<nodeIndex, fieldHash> — only non-empty nodes stored
  const levelMaps: Map<number, string>[] = Array.from(
    { length: DEPTH + 1 },
    () => new Map<number, string>(),
  );

  // Level 0: hash each address into its leaf position
  const addrToIndex = new Map<string, number>();
  addresses.forEach((addr, i) => {
    levelMaps[0].set(i, leafHash(addr));
    addrToIndex.set(addr, i); // last occurrence wins on duplicates
  });

  // Levels 1–20: bubble up — only compute parents of non-empty children
  for (let l = 1; l <= DEPTH; l++) {
    for (const [idx] of levelMaps[l - 1]) {
      const parent = idx >> 1;
      if (levelMaps[l].has(parent)) continue; // already computed from the other child
      const left  = levelMaps[l - 1].get(parent * 2)     ?? empty[l - 1];
      const right = levelMaps[l - 1].get(parent * 2 + 1) ?? empty[l - 1];
      levelMaps[l].set(parent, nodeHash(left, right));
    }
  }

  const root = levelMaps[DEPTH].get(0) ?? empty[DEPTH];

  // Extract proof for every input address
  const proofs = new Map<string, MerkleProof>();
  for (const [addr, leafIdx] of addrToIndex) {
    const siblings: string[] = [];
    for (let l = 0; l < DEPTH; l++) {
      const posAtLevel = leafIdx >> l;   // position of current node at level l
      const siblingIdx = posAtLevel ^ 1; // flip LSB to get sibling position
      siblings.push(levelMaps[l].get(siblingIdx) ?? empty[l]);
    }
    proofs.set(addr, {
      siblings,
      pathBits: leafIdx & ((1 << DEPTH) - 1), // lower 20 bits = path direction flags
    });
  }

  return { root, proofs };
}
