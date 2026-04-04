# Fairdrop SDK Implementation Plan

## Current State Assessment

### What exists (`packages/sdk` — 901 LOC)

| Module | Status | Notes |
|---|---|---|
| `/parse` | Complete | Leo value parsers, struct/record accessors, ASCII↔u128 codec |
| `/credits` | Complete | Unit conversion, constants, isCreditsToken |
| `/registry` | Complete | fetchTokenInfo, fetchTokenBalance, fetchTokenRole |
| `/cache` | Complete | localStorage cache for configs, index, gate, token meta |
| `/format` | Complete | Block-time estimation, URL sanitization |
| `/hash` | Partial | Only BidderKey and RefListKey; all other op hashes missing |
| `/client` | Complete | AleoNetworkClient singleton |
| `/constants` | Complete | SYSTEM_PROGRAMS, ZERO_ADDRESS |

### Supporting packages (already solid)
- `@fairdrop/types` — comprehensive types: contracts, domain, API, indexer, primitives
- `@fairdrop/config` — FairdropConfig, PROGRAMS from programs.json

### Critical gaps

1. **Op hash computation** — no helpers for AuctionKey, ConfigOp, AllowedCallerOp, WithdrawalOp, ApproveUpgradeOp, ApproveOpMsg
2. **Mapping readers** — no functions to read auction state, bids, escrow, referral earnings, vesting, config values
3. **Transaction builders** — no functions to build inputs arrays for any contract transition
4. **Multisig workflow** — no off-chain signing, signature aggregation, or approve_op helpers
5. **Record management** — no private record scanning, decryption, or categorization
6. **Build pipeline** — `private: true`, no build script, exports point to raw `.ts` files; not installable outside the monorepo

---

## Architecture Decision

### Single installable SDK, not a split publish

Keep the existing package separation (`sdk`, `types`, `config`) inside the monorepo — they serve different audiences (types is used by the indexer and API, config by deployment scripts). However, `@fairdrop/sdk` becomes the **single published package** that re-exports the relevant parts of types and config, giving external consumers one install.

```
npm install @fairdrop/sdk
```

Internally the monorepo keeps `@fairdrop/types` and `@fairdrop/config` as private workspace packages consumed by `@fairdrop/sdk`.

### Isomorphic by default

The current SDK is browser-only (localStorage, WASM loaded by the browser). The plan introduces a **storage abstraction** and **lazy WASM loading** so the same package works in:
- Browser (React app, wallet adapter)
- Node.js (indexer service, governance scripts, tests)

### Function-first, class wrappers for ergonomics

Core builders are **pure functions** — they take inputs and return the Leo inputs array. No class state, no side effects, easy to unit test. Thin class wrappers (`DutchAuctionClient`, `MultisigClient`) are provided for ergonomics in application code. React hooks live in the app layer, not in the SDK.

---

## Target Module Structure

```
packages/sdk/src/
│
├── core/                      (environment-agnostic — no I/O, no WASM)
│   ├── parse/                 (EXISTING — Leo value parsers)
│   ├── credits/               (EXISTING — unit conversion, constants)
│   ├── format/                (EXISTING — block time, URL)
│   ├── constants.ts           (EXISTING — SYSTEM_PROGRAMS, ZERO_ADDRESS)
│   └── types.ts               (re-exports from @fairdrop/types for consumers)
│
├── hash/                      (EXPAND — all BHP256 op hash helpers)
│   ├── auction.ts             (computeAuctionId, computeBidderKey)
│   ├── governance.ts          (computeConfigOpHash, computeAllowedCallerOpHash,
│   │                           computeWithdrawalOpHash, computeApproveOpHash,
│   │                           computeUpgradeOpHash, computeUpdateAdminOpHash)
│   └── index.ts
│
├── chain/                     (NEW — on-chain mapping reads, RPC queries)
│   ├── client.ts              (EXISTING AleoNetworkClient singleton)
│   ├── auction.ts             (fetchAuctionConfig, fetchAuctionState,
│   │                           fetchEscrow, fetchBidderKey, fetchAuctionIndex)
│   ├── config.ts              (fetchProtocolConfig — fee_bps, paused, etc.)
│   ├── gate.ts                (fetchGateConfig, fetchAdmission)
│   ├── referral.ts            (fetchReferralCode, fetchEarned, fetchRefIndex)
│   ├── vesting.ts             (fetchVestingState)
│   └── index.ts
│
├── transactions/              (NEW — transaction input builders, one file per contract)
│   ├── dutch.ts
│   ├── ascending.ts
│   ├── lbp.ts
│   ├── quadratic.ts
│   ├── raise.ts
│   ├── sealed.ts
│   ├── config.ts
│   ├── gate.ts
│   ├── proof.ts
│   ├── ref.ts
│   ├── vest.ts
│   └── index.ts
│
├── multisig/                  (NEW — governance off-chain workflow)
│   ├── sign.ts                (signApproveOp, signApproveUpgrade, signUpdateAdmin)
│   ├── submit.ts              (buildApproveOpInputs, buildApproveUpgradeInputs)
│   └── index.ts
│
├── records/                   (NEW — private record management)
│   ├── scan.ts                (scanBidRecords, scanVestingRecords,
│   │                           scanReferralRecords, scanReceiptRecords)
│   ├── categorize.ts          (groupByAuction, filterClaimable, filterExpired)
│   └── index.ts
│
├── cache/                     (REFACTOR — storage abstraction layer)
│   ├── storage.ts             (IStorage interface: get/set/remove)
│   ├── local-storage.ts       (browser localStorage adapter)
│   ├── memory.ts              (in-memory adapter for Node.js / tests)
│   ├── auction-config.ts      (EXISTING — updated to use IStorage)
│   ├── auction-index.ts       (EXISTING — updated to use IStorage)
│   ├── gate-config.ts         (EXISTING — updated to use IStorage)
│   ├── token-meta.ts          (EXISTING — updated to use IStorage)
│   └── index.ts
│
├── registry/                  (EXISTING — token_registry.aleo queries)
│
└── index.ts                   (root barrel — public API surface)
```

---

## Module Specifications

### `hash/governance.ts`

Every governance operation in the protocol requires a pre-computed op hash. These mirror the Leo BHP256 calls in each contract's finalize block. All functions take plain JS values, serialize to Leo struct strings, and return a `field` string.

```typescript
// Mirrors: BHP256::hash_to_field(AuctionKey { creator, nonce, program_salt })
computeAuctionId(creator: string, nonce: bigint, programSalt: string): string

// Mirrors: BHP256::hash_to_field(ConfigOp { fn_key, op_value, nonce })
computeConfigOpHash(fnKey: string, opValue: string, nonce: bigint): string

// Mirrors: BHP256::hash_to_field(AllowedCallerOp { caller, allowed, nonce })
computeAllowedCallerOpHash(caller: string, allowed: boolean, nonce: bigint): string

// Mirrors: BHP256::hash_to_field(WithdrawalOp { amount, recipient, nonce })
computeWithdrawalOpHash(amount: bigint, recipient: string, nonce: bigint): string

// Mirrors: BHP256::hash_to_field(ApproveOpMsg { op_hash, request_id })
computeApproveOpMsgHash(opHash: string, requestId: bigint): string

// Mirrors: BHP256::hash_to_field(ApproveUpgradeOp { contract_key, checksum, request_id })
computeUpgradeOpHash(contractKey: string, checksum: number[], requestId: bigint): string

// Mirrors: BHP256::hash_to_field(UpdateAdminOp { old_admin, new_admin, request_id })
computeUpdateAdminOpHash(oldAdmin: string, newAdmin: string, requestId: bigint): string
```

**Implementation note:** All hash functions call the same `hashStruct(leoString)` internal helper that already exists in `src/hash.ts`. The only work is serializing each struct to the correct Leo struct string format, matching field order exactly.

---

### `chain/auction.ts`

Reads auction mapping state for any auction type. All functions return `null` on miss — callers decide whether to throw or display a loading state.

```typescript
fetchAuctionConfig(auctionId: string, programId: string): Promise<BaseAuctionConfig | null>
fetchAuctionState(auctionId: string, programId: string): Promise<AuctionState | null>
fetchEscrowPayments(auctionId: string, programId: string): Promise<bigint>
fetchEscrowSales(auctionId: string, programId: string): Promise<bigint>
fetchProtocolTreasury(programId: string): Promise<bigint>
fetchCreatorRevenue(auctionId: string, programId: string): Promise<bigint>
fetchAuctionIndex(programId: string): Promise<string[]>      // traverses linked list
fetchCreatorAuctions(creator: string, programId: string): Promise<string[]>
fetchBidderRecord(bidderKey: string, programId: string): Promise<BidRecord | null>
```

---

### `transactions/dutch.ts` (representative — all 6 auctions follow this pattern)

Transaction builders return the `inputs` array ready to pass to `wallet.executeTransaction()`. They do **not** call the wallet — that stays in the app layer. This keeps builders pure and testable.

```typescript
interface CreateAuctionInputs {
  inputs:    (string | Record<string, unknown>)[];
  programId: string;
  functionName: string;
  fee:       number;
}

buildCreateDutchAuction(params: DutchAuctionParams, token: Record<string, unknown>): CreateAuctionInputs

buildPlaceBidPublic(auctionId: string, quantity: bigint, paymentAmount: bigint): TxInputs

buildPlaceBidPrivate(auctionId: string, quantity: bigint, creditsRecord: Record<string, unknown>): TxInputs

buildCloseAuction(auctionId: string, closer: string, filled: boolean, volume: bigint, closerReward: bigint): TxInputs

buildWithdrawPayments(auctionId: string, amount: bigint): TxInputs

buildWithdrawTreasuryFees(amount: bigint, recipient: string, opNonce: bigint): TxInputs

buildCancelAuction(auctionId: string, saleTokenId: string, supply: bigint): TxInputs

buildClaimVoided(bidRecord: Record<string, unknown>): TxInputs
```

---

### `multisig/sign.ts`

Off-chain signing workflow. Uses the wallet adapter's `sign()` method (or a raw private key in Node.js scripts).

```typescript
// Step 1: Compute the message hash that admins sign
prepareApproveOpSignature(opHash: string, requestId: bigint): { msgHash: string }

// Step 2: Each admin signs msgHash → signature string
// (done by wallet adapter or snarkvm CLI — not SDK responsibility)

// Step 3: Build the inputs for the approve_op transition
buildApproveOpInputs(
  opHash:    string,
  requestId: bigint,
  sigs: [
    { sig: string; admin: string },
    { sig: string; admin: string },
    { sig: string; admin: string },
  ]
): TxInputs

buildApproveUpgradeInputs(
  contractKey: string,
  checksum:    number[],
  requestId:   bigint,
  sigs: [...]
): TxInputs

buildUpdateAdminInputs(
  oldAdmin: string,
  newAdmin: string,
  requestId: bigint,
  sigs: [...]
): TxInputs
```

---

### `records/scan.ts`

Private records returned by the wallet adapter. The SDK categorizes and enriches them.

```typescript
// Filter and type-narrow records by shape (field presence heuristics)
isBidRecord(rec: unknown): rec is BidRecord
isVestingRecord(rec: unknown): rec is VestingRecord
isReferralRecord(rec: unknown): rec is ReferralCode
isReceiptRecord(rec: unknown): rec is ParticipationReceipt

// Scan all user records and group by type
scanUserRecords(records: unknown[]): {
  bids:      BidRecord[];
  vesting:   VestingRecord[];
  referrals: ReferralCode[];
  receipts:  ParticipationReceipt[];
}

// Higher-level: which bid records are claimable/refundable for a given auction?
filterClaimableBids(bids: BidRecord[], state: AuctionState): BidRecord[]
filterVoidedBids(bids: BidRecord[], state: AuctionState): BidRecord[]
```

---

### `cache/storage.ts`

Thin abstraction so the cache layer works in both browser and Node.

```typescript
export interface IStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

// Browser adapter (default in browser environments)
export class LocalStorageAdapter implements IStorage { ... }

// In-memory adapter (Node.js, tests, SSR)
export class MemoryStorageAdapter implements IStorage { ... }
```

All existing cache files (`auction-config.ts`, `auction-index.ts`, etc.) are updated to accept an `IStorage` parameter rather than calling `localStorage` directly.

---

## Build Pipeline

The current package has no build step — it exports raw `.ts` files, which only works inside the Turborepo. To make it installable externally:

### `tsup.config.ts` (add to `packages/sdk/`)

```typescript
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index:        'src/index.ts',
    core:         'src/core/index.ts',
    hash:         'src/hash/index.ts',
    chain:        'src/chain/index.ts',
    transactions: 'src/transactions/index.ts',
    multisig:     'src/multisig/index.ts',
    records:      'src/records/index.ts',
    cache:        'src/cache/index.ts',
    registry:     'src/registry/index.ts',
  },
  format:  ['esm', 'cjs'],
  dts:     true,
  clean:   true,
  external: ['@provablehq/sdk'],   // peer dep — bundled by the app
});
```

### Updated `package.json` exports map

```json
{
  "name": "@fairdrop/sdk",
  "version": "0.2.0",
  "private": false,
  "type": "module",
  "exports": {
    ".":              { "import": "./dist/index.js", "require": "./dist/index.cjs", "types": "./dist/index.d.ts" },
    "./core":         { "import": "./dist/core.js",  ... },
    "./hash":         { "import": "./dist/hash.js",  ... },
    "./chain":        { "import": "./dist/chain.js", ... },
    "./transactions": { "import": "./dist/transactions.js", ... },
    "./multisig":     { "import": "./dist/multisig.js", ... },
    "./records":      { "import": "./dist/records.js", ... },
    "./cache":        { "import": "./dist/cache.js", ... },
    "./registry":     { "import": "./dist/registry.js", ... }
  },
  "scripts": {
    "build":      "tsup",
    "dev":        "tsup --watch",
    "type-check": "tsc --noEmit"
  },
  "peerDependencies": {
    "@provablehq/sdk": ">=0.3.0"
  }
}
```

---

## Implementation Phases

### Phase 1 — Hash completeness (1–2 days)
Expand `src/hash/` with all governance op hash functions. These are pure functions with no I/O — straightforward to implement and test. Unlocks everything else (tx builders, multisig).

**Deliverables:** `hash/governance.ts`, unit tests for every hash function.

---

### Phase 2 — Chain reads (2–3 days)
Implement `chain/` module: mapping readers for all Fairdrop contracts. Each reader follows the same pattern as the existing `registry/token.ts`.

**Deliverables:** `chain/auction.ts`, `chain/config.ts`, `chain/gate.ts`, `chain/referral.ts`, `chain/vesting.ts`.

---

### Phase 3 — Transaction builders (3–5 days)
Implement `transactions/` — one file per contract. Builders are pure functions: they serialize inputs to Leo format but don't submit anything. Start with Dutch (most complex, template for others), then ascending, lbp, quadratic, raise, sealed, then utilities.

**Deliverables:** All 11 transaction files, plus integration with the cache layer for nonce management.

---

### Phase 4 — Cache abstraction + build pipeline (1–2 days)
Refactor `cache/` to use `IStorage`. Add `tsup` build config. Update `package.json` exports. Verify the built output works in both a browser bundle and a Node.js script.

**Deliverables:** `cache/storage.ts`, updated cache files, `tsup.config.ts`, updated `package.json`.

---

### Phase 5 — Multisig workflow (2–3 days)
Implement `multisig/` — the off-chain signing and submission helpers. This requires coordination with the governance key holders, so a CLI script (Node.js) is the primary consumer alongside the SDK.

**Deliverables:** `multisig/sign.ts`, `multisig/submit.ts`, a governance CLI script in `scripts/`.

---

### Phase 6 — Record management (2–3 days)
Implement `records/` — private record scanning, type-narrowing, and filtering. Depends on wallet adapter returning records in a normalized shape (already handled by `recStr`/`recField` helpers).

**Deliverables:** `records/scan.ts`, `records/categorize.ts`.

---

## What NOT to include in the SDK

| Concern | Where it lives instead |
|---|---|
| React hooks (`useAuction`, `useBid`) | `apps/web/src/shared/hooks/` |
| Wallet connection UI | `packages/ui/` |
| Database queries | `packages/database/` |
| Indexer logic | `services/indexer/` |
| Environment config loading | `packages/config/` |
| Deployment scripts | `scripts/` |

The SDK is a **data and transaction layer** — no UI, no wallet connection, no database.

---

## Usage Examples (target API)

```typescript
// 1. Pure hash computation — no WASM, works anywhere
import { computeWithdrawalOpHash } from '@fairdrop/sdk/hash';
const opHash = computeWithdrawalOpHash(1_000_000n, recipientAddress, 1n);

// 2. Build tx inputs — pure, no wallet call
import { buildWithdrawTreasuryFees } from '@fairdrop/sdk/transactions';
const { inputs, programId, functionName, fee } = buildWithdrawTreasuryFees(
  1_000_000n, recipientAddress, 1n
);
await wallet.executeTransaction({ programId, functionName, inputs, fee });

// 3. Read on-chain state
import { fetchAuctionState } from '@fairdrop/sdk/chain';
const state = await fetchAuctionState(auctionId, PROGRAMS.dutch.programId);

// 4. Multisig governance (Node.js script)
import { buildApproveOpInputs, computeWithdrawalOpHash } from '@fairdrop/sdk/multisig';
const opHash = computeWithdrawalOpHash(amount, recipient, nonce);
const inputs = buildApproveOpInputs(opHash, requestId, [sig1, sig2, sig3]);

// 5. Record management
import { scanUserRecords, filterClaimableBids } from '@fairdrop/sdk/records';
const { bids, vesting } = scanUserRecords(walletRecords);
const claimable = filterClaimableBids(bids, auctionState);

// 6. Cache with custom storage (Node.js)
import { MemoryStorageAdapter } from '@fairdrop/sdk/cache';
import { fetchAuctionConfig } from '@fairdrop/sdk/chain';
// chain functions accept optional storage adapter; defaults to localStorage in browser
```

---

## Migration from Current State

The existing exports (`@fairdrop/sdk/parse`, `/credits`, `/format`, `/cache`, `/client`, `/registry`, `/constants`, `/hash`) all remain unchanged and backward-compatible. New modules are additive. The only breaking change is the cache layer's `IStorage` refactor — internal to the monorepo, no external consumers yet.
