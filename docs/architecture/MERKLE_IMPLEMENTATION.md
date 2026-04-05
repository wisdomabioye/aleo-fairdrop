# Merkle Gate — End-to-End Implementation

Complete implementation guide for the Merkle allowlist gate (`gate_mode = 1`) and credential gate (`gate_mode = 2`) in `fairdrop_gate_v2.aleo`.

---

## Table of Contents

1. [On-chain spec](#1-on-chain-spec)
2. [BHP256 in TypeScript](#2-bhp256-in-typescript)
3. [SDK — `merkle.ts`](#3-sdk--merkletsats)
4. [SDK — `computeCredentialMsgHash`](#4-sdk--computecredentialmsghashtss)
5. [SDK exports](#5-sdk-exports)
6. [Web Worker](#6-web-worker)
7. [Creator UI — `GateVestStep.tsx`](#7-creator-ui--gateveststeptsx)
8. [Bidder UI — `GatePage.tsx`](#8-bidder-ui--gatepagetsx)
9. [Credential signer service](#9-credential-signer-service)
10. [Testing checklist](#10-testing-checklist)

---

## 1. On-chain spec

### Gate contract structs (`fairdrop_gate_v2.aleo`)

```leo
struct LeafHash    { addr: address }
struct MerkleNode  { left: field, right: field }
struct BidderKey   { bidder: address, auction_id: field }
struct CredentialMessage { holder: address, auction_id: field, expiry: u32 }
```

### `verify_merkle` transition

```leo
fn verify_merkle(
    public auction_id: field,
    public proof:      [field; 20],   // 20 sibling hashes
    public path_bits:  u32,           // packed bits — bit l = right-child flag at level l
) -> Final
```

**Proof verification (unrolled in Leo):**
```leo
let leaf: field = BHP256::hash_to_field(LeafHash { addr: self.signer });

let bit0  = (path_bits & 1u32) == 1u32;
let node0 = bit0
    ? BHP256::hash_to_field(MerkleNode { left: proof[0], right: leaf   })  // leaf is RIGHT
    : BHP256::hash_to_field(MerkleNode { left: leaf,     right: proof[0] }); // leaf is LEFT

// ... repeated for levels 1–19, each consuming proof[l] and the previous node

assert_eq(node19, allowlists.get(auction_id));
```

**path_bits encoding:** bit `l` = 1 means the current node is the **right child** at level `l` (so the sibling `proof[l]` is on the left). This is exactly `(leafIndex >> l) & 1`, so `pathBits = leafIndex & 0xFFFFF` (lower 20 bits of the leaf array position).

### `verify_credential` transition

```leo
fn verify_credential(
    public auction_id: field,
    public issuer:     address,
    sig:               signature,   // private — ZK-verified in transition body
    public expiry:     u32,
) -> Final

// Transition body (ZK):
let msg: field = BHP256::hash_to_field(CredentialMessage {
    holder:     self.signer,
    auction_id: auction_id,
    expiry:     expiry,
});
assert(signature::verify(sig, issuer, msg));
```

### `check_admission` (CPI from `place_bid_*`)

```leo
fn check_admission(public auction_id: field) -> Final
// Reads verified[BHP256(BidderKey { bidder, auction_id })]
// Asserts true for gated auctions
```

All four `place_bid_*` transitions call `check_admission` via CPI before recording the bid.

---

## 2. BHP256 in TypeScript

Confirmed from `@provablehq/wasm/dist/testnet/aleo_wasm.d.ts`:

```ts
class BHP256 {
  constructor();
  hash(input: Array<any>): Field;   // input = bit array from Plaintext.toBitsLe()
  free(): void;
}

class Plaintext {
  static fromString(plaintext: string): Plaintext;  // parses Leo struct literal string
  toBitsLe(): Array<any>;
  free(): void;
}

class Field {
  toString(): string;   // returns "Nfield" Leo literal, e.g. "123...field"
  free(): void;
}
```

The existing `hashStruct` in `packages/sdk/src/hash/_bhp.ts` wraps this correctly:

```ts
// _bhp.ts — already implemented, do not change
export function hashStruct(leoStructLiteral: string): string {
  const struct = Plaintext.fromString(leoStructLiteral);
  const bits   = struct.toBitsLe();
  const bhp    = new BHP256();
  const field  = bhp.hash(bits);
  const result = field.toString();   // → "Nfield"
  field.free(); bhp.free(); struct.free();
  return result;
}
```

All Merkle and credential hash functions call `hashStruct` with the correctly-ordered Leo struct literal. Field order must exactly match the Leo struct definition — the WASM serializes in declaration order, same as Leo.

---

## 3. SDK — `merkle.ts`

**File:** `packages/sdk/src/hash/merkle.ts`

```ts
import { hashStruct }  from './_bhp';
import { ZERO_ADDRESS } from '../constants';

const DEPTH = 20;  // matches fairdrop_gate_v2.aleo — max 2^20 addresses

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
// Computed once; all-empty subtrees at any level share the same hash.

function buildEmptyHashes(): string[] {
  const h: string[] = [leafHash(ZERO_ADDRESS)];
  for (let l = 1; l <= DEPTH; l++) {
    h.push(nodeHash(h[l - 1], h[l - 1]));
  }
  return h;
}

// ── Public types ──────────────────────────────────────────────────────────────

export interface MerkleProof {
  /** 20 sibling field literals — passed directly to verify_merkle as proof[]. */
  siblings: string[];
  /** Packed u32 — lower 20 bits of the leaf index. Passed as path_bits. */
  pathBits: number;
}

export interface MerkleTree {
  /** BHP256 root field — register as merkle_root in GateParams at auction creation. */
  root:   string;
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
 * Uses sparse computation — only occupied nodes and their ancestors are hashed.
 * Empty sibling subtrees use precomputed constant hashes, so cost is O(N * DEPTH)
 * rather than O(2^DEPTH).
 *
 * @param addresses  List of aleo1... addresses to allow. Order determines leaf index.
 *                   Duplicate addresses are deduplicated (last index wins for proof).
 * @returns          Root field to put on-chain + per-address proof objects.
 */
export function buildMerkleTree(addresses: string[]): MerkleTree {
  if (addresses.length > 2 ** DEPTH) {
    throw new Error(`Allowlist exceeds max tree size (${2 ** DEPTH})`);
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
    addrToIndex.set(addr, i);   // last wins on duplicates
  });

  // Levels 1–20: bubble up — only compute parents of non-empty children
  for (let l = 1; l <= DEPTH; l++) {
    for (const [idx] of levelMaps[l - 1]) {
      const parent = idx >> 1;
      if (levelMaps[l].has(parent)) continue;   // already computed from the other child
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
      const posAtLevel  = leafIdx >> l;         // position of current node at level l
      const siblingIdx  = posAtLevel ^ 1;       // flip LSB to get sibling position
      siblings.push(levelMaps[l].get(siblingIdx) ?? empty[l]);
    }
    proofs.set(addr, {
      siblings,
      pathBits: leafIdx & ((1 << DEPTH) - 1),  // lower 20 bits = path direction flags
    });
  }

  return { root, proofs };
}
```

### Why `pathBits = leafIndex`

The Leo contract checks `(path_bits >> l) & 1`:
- `1` → current node is RIGHT child → sibling is on the LEFT → `MerkleNode { left: proof[l], right: currentNode }`
- `0` → current node is LEFT child  → sibling is on the RIGHT → `MerkleNode { left: currentNode, right: proof[l] }`

Position `leafIdx` in the leaf array: at level `l`, `(leafIdx >> l) & 1` is exactly 1 when the node is a right child. So `pathBits = leafIdx & 0xFFFFF` encodes the full 20-level path in one u32.

---

## 4. SDK — `computeCredentialMsgHash`

Add to `packages/sdk/src/hash/keys.ts`:

```ts
/**
 * Compute the message hash a credential issuer must sign.
 * Mirrors: BHP256::hash_to_field(CredentialMessage { holder, auction_id, expiry })
 *
 * Field order is canonical (G29) — must match the Leo struct exactly.
 * Used by the credential-signer service before calling Signature.sign().
 */
export function computeCredentialMsgHash(
  holder:    string,   // aleo1... address of the bidder
  auctionId: string,   // field
  expiry:    number,   // u32 block height
): string {
  return hashStruct(`{ holder: ${holder}, auction_id: ${auctionId}, expiry: ${expiry}u32 }`);
}
```

---

## 5. SDK exports

Update `packages/sdk/src/hash/index.ts`:

```ts
export {
  computeTokenOwnerKey,
  computeAuctionId,
  computeBidderKey,
  computeRefListKey,
  computeConfigOpHash,
  computeAllowedCallerOpHash,
  computeWithdrawalOpHash,
  computeApproveOpMsgHash,
  computeUpgradeOpHash,
  computeUpdateAdminOpHash,
  computeCredentialMsgHash,   // ← new
  generateTokenId,
  generateNonce,
} from './keys';

export { buildMerkleTree, type MerkleProof, type MerkleTree } from './merkle';  // ← new
```

---

## 6. Web Worker

BHP256 is WASM — it blocks the main thread for large allowlists. Run it in a worker.

**File:** `apps/frontend/src/workers/merkle-builder.worker.ts`

```ts
import { buildMerkleTree } from '@fairdrop/sdk/hash';
import type { MerkleProof } from '@fairdrop/sdk/hash';

export interface MerkleWorkerRequest {
  addresses: string[];
}

export interface MerkleWorkerResponse {
  root:   string;
  proofs: Record<string, MerkleProof>;   // Map → plain object for postMessage transfer
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
```

**Hook:** `apps/frontend/src/shared/hooks/useMerkleBuilder.ts`

```ts
import { useRef, useState, useCallback } from 'react';
import type { MerkleWorkerResponse } from '@/workers/merkle-builder.worker';

export function useMerkleBuilder() {
  const workerRef = useRef<Worker | null>(null);
  const [building, setBuilding]   = useState(false);
  const [error,    setError]      = useState<string | null>(null);

  const build = useCallback((
    addresses: string[],
    onDone: (result: MerkleWorkerResponse) => void,
  ) => {
    workerRef.current?.terminate();
    setError(null);
    setBuilding(true);

    const worker = new Worker(
      new URL('../workers/merkle-builder.worker.ts', import.meta.url),
      { type: 'module' },
    );
    workerRef.current = worker;

    worker.onmessage = (e: MessageEvent<{ ok: boolean; data?: MerkleWorkerResponse; error?: string }>) => {
      setBuilding(false);
      if (e.data.ok && e.data.data) {
        onDone(e.data.data);
      } else {
        setError(e.data.error ?? 'Unknown error');
      }
      worker.terminate();
    };

    worker.onerror = (e) => {
      setBuilding(false);
      setError(e.message);
      worker.terminate();
    };

    worker.postMessage({ addresses });
  }, []);

  return { build, building, error };
}
```

---

## 7. Creator UI — `GateVestStep.tsx`

When `form.gateMode === 1`, replace the static `merkleRoot` input with this panel:

```tsx
import { useMerkleBuilder } from '@/shared/hooks/useMerkleBuilder';
import type { MerkleWorkerResponse } from '@/workers/merkle-builder.worker';

// Inside GateVestStep component:

const { build, building } = useMerkleBuilder();
const [proofBundle, setProofBundle] = useState<MerkleWorkerResponse | null>(null);
const [addressText, setAddressText] = useState('');

function handleBuild() {
  const addresses = addressText
    .split(/[\n,]+/)
    .map((a) => a.trim())
    .filter((a) => a.startsWith('aleo1'));

  if (addresses.length === 0) return;

  build(addresses, (result) => {
    onChange({ merkleRoot: result.root });
    setProofBundle(result);
  });
}

function downloadProofs() {
  if (!proofBundle) return;
  const blob = new Blob([JSON.stringify(proofBundle.proofs, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'merkle-proofs.json';
  a.click();
  URL.revokeObjectURL(url);
}
```

```tsx
{form.gateMode === 1 && (
  <div className="space-y-3">
    <Label>Allowlist (one address per line or comma-separated)</Label>
    <Textarea
      rows={6}
      placeholder="aleo1abc...\naleo1def..."
      value={addressText}
      onChange={(e) => setAddressText(e.target.value)}
      className="font-mono text-xs"
      disabled={building}
    />

    <Button type="button" onClick={handleBuild} disabled={building || !addressText.trim()}>
      {building ? <><Spinner className="mr-2 size-4" />Computing tree…</> : 'Build Merkle Tree'}
    </Button>

    {proofBundle && (
      <div className="space-y-2">
        <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs">
          <p className="text-emerald-400 font-medium">Tree built</p>
          <p className="font-mono text-muted-foreground break-all mt-0.5">{proofBundle.root}</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={downloadProofs}>
          Download proofs.json
        </Button>
        <p className="text-xs text-muted-foreground">
          Distribute each address's entry from proofs.json to your allowlisted bidders.
        </p>
      </div>
    )}
  </div>
)}
```

The `merkleRoot` field in the form is auto-filled by `onChange({ merkleRoot: result.root })`. It is what gets passed into `GateParams.merkle_root` at auction creation.

---

## 8. Bidder UI — `GatePage.tsx`

The `MerkleGateForm` is already implemented (see `GatePage.tsx`). It accepts:

```ts
{
  "siblings": ["0field", "123...field", ...],   // 20 elements
  "path_bits": [false, true, ...]               // 20 booleans — OR use the packed number
}
```

The form packs `path_bits` into a u32 and calls `verifyMerkle(auctionId, siblings, pathBits)` from `@fairdrop/sdk/transactions`.

The proof JSON the creator distributes (from `proofs.json` above) has a slightly different shape:
```ts
{ siblings: string[]; pathBits: number }  // MerkleProof from the SDK
```

Update the `MerkleGateForm` placeholder and parsing to accept this format directly:

```tsx
// In MerkleGateForm, replace the parse block:
let raw: { siblings: string[]; pathBits?: number; path_bits?: (string | boolean)[] };
raw = JSON.parse(proofJson);

// Accept either SDK format (pathBits: number) or legacy array format
const pathBits: number = typeof raw.pathBits === 'number'
  ? raw.pathBits
  : (raw.path_bits ?? []).reduce(
      (acc: number, bit: string | boolean, i: number) =>
        (bit === true || bit === 'true') ? acc | (1 << i) : acc,
      0,
    );

parsedRef.current = { siblings: raw.siblings, pathBits };
```

This makes the bidder experience: download your entry from `proofs.json`, paste it into the gate page, submit.

---

## 9. Credential signer service

The credential-signer service (see `services/credential-signer/README.md`) uses `computeCredentialMsgHash` from the SDK:

```ts
// src/signing.ts
import { PrivateKey, Signature } from '@provablehq/sdk';
import { computeCredentialMsgHash } from '@fairdrop/sdk/hash';
import { env } from './env.js';

const privateKey   = PrivateKey.from_string(env.issuerPrivateKey);
export const issuerAddress = privateKey.to_address().to_string();

export function issueCredential(
  holderAddress: string,
  auctionId:     string,
  expiry:        number,
): { signature: string; expiry: number; issuer: string } {
  const msgHash = computeCredentialMsgHash(holderAddress, auctionId, expiry);
  const sig     = Signature.sign(privateKey, msgHash);
  return { signature: sig.to_string(), expiry, issuer: issuerAddress };
}
```

The `msgHash` computed here must produce the same field value as `BHP256::hash_to_field(CredentialMessage { ... })` in the Leo transition body. The `hashStruct` function uses `Plaintext.fromString` which deserializes via the same WASM that the Aleo VM uses — struct field order must match the Leo definition exactly.

---

## 10. Testing checklist

Before deploying to testnet:

- [ ] **Leaf hash consistency** — compute `leafHash(knownAddress)` in TypeScript, verify it matches `BHP256::hash_to_field(LeafHash { addr: knownAddress })` from a Leo test
- [ ] **Node hash consistency** — compute `nodeHash(left, right)` in TypeScript, verify against `BHP256::hash_to_field(MerkleNode { left, right })` in Leo
- [ ] **Root consistency** — build a 3-address tree in TypeScript, manually verify root against a Leo program that builds the same tree
- [ ] **`verify_merkle` end-to-end** — pick an address from the tree, submit its TypeScript-generated proof on testnet, confirm the transaction finalizes
- [ ] **Wrong address rejection** — submit proof for address A at position B, confirm transaction fails in finalize
- [ ] **`computeCredentialMsgHash` consistency** — sign a known `(holder, auctionId, expiry)` tuple with both the service and a Leo test, confirm `sig.verify(issuer, msg)` passes on-chain
- [ ] **Expiry enforcement** — submit a credential with `expiry < block.height`, confirm transaction fails
- [ ] **pathBits edge cases** — test addresses at index 0 (all zeros), 1, 2, 2^20-1 (all ones)
