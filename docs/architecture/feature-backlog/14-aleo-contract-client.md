# 14 — ABI-to-TypeScript Binding Generator (`@fairdrop/leo-abigen`)

**Theme:** Developer Experience
**Status:** Planned
**Priority:** High — prerequisite for any typed SDK layer on top of Fairdrop or FairSwap contracts

---

## Problem

Every contract interaction in the codebase hand-rolls the same logic:
- Format Leo values manually (`"100u128"`, `"true"`, `"3443field"`)
- Pass untyped `(string | Record<string, unknown>)[]` inputs to `executeTransaction`
- Parse mapping responses from raw Leo strings in ad-hoc per-contract parse files
- No compile-time guarantee that arguments match the contract
- Private record scanners duplicated per contract domain

This is the Aleo equivalent of crafting raw ABI-encoded calldata by hand for every EVM call.

---

## Package name

**`@fairdrop/leo-abigen`** (monorepo, `packages/leo-abigen/`) — open-source release: **`leo-abigen`**.

Has direct precedent in `ethereum/abigen` / `go-ethereum/abigen`: unambiguously means "ABI → typed code generator", not the Leo source files.

Rejected:
- `aleo-client` — conflicts with `AleoNetworkClient` from `@provablehq/sdk` and the existing `getAleoClient()` singleton in `packages/sdk/src/client.ts`
- `@fairdrop/contracts` / `leo-contracts` — implies Leo source files, not TypeScript bindings

---

## Goal

Consume an `abi.json` (produced by `leo build`) and return a fully typed contract handle:

```typescript
import abi from "./build/abi.json";
import { createAbigen, fromAleoClient } from "@fairdrop/leo-abigen";
import { getAleoClient } from "@fairdrop/sdk/client";
import type { FairswapDexV2 } from "./generated/fairswap-dex-v2";

const dex = createAbigen(abi, {
  fetchMapping: fromAleoClient(getAleoClient()),  // adapter normalises the client
}) as FairswapDexV2;

// Builder mode — always available, no wallet required
const spec = dex.swap.build({
  token_in_id:  CREDITS_RESERVED_TOKEN_ID,
  token_out_id: SALE_TOKEN_ID,
  amount_in:    "1000000" as U128,
  min_out:      "990000"  as U128,
  recipient:    "aleo1..." as Address,
});
// → pass spec to executeTransaction() in the calling hook

// Executor mode — requires executeTransaction injected at creation
const txId = await dex.swap({ amount_in: "1000000" as U128, ... });

// Typed mapping read
const pool = await dex.pools("3443field");
console.log(pool?.reserve_a);  // U128 branded string

// Typed record scanner
const lpTokens = dex.records.lpTokens(walletRecords);
```

---

## ABI Structure

The `abi.json` produced by `leo build` has five top-level keys:

| Key | Purpose |
|-----|---------|
| `program` | Program ID string (`"fairswap_dex_v3.aleo"`) |
| `structs` | Named structs with typed fields |
| `records` | Named records with typed fields + mode |
| `mappings` | On-chain mappings: key type + value type |
| `functions` | Transitions: name, `is_final`, inputs (name + type + mode), outputs |

### Type taxonomy

```
// Types as they appear in function INPUT ty fields:
AleoInputType =
  | { Plaintext: AleoPlaintext }     // mode: "Public" — plaintext-serializable value
  | { Record:    { path: string[], program: string } }  // mode: "None" — record UTXO
  | "Final"                          // finalize future (stripped)

// Types as they appear in struct fields, mapping keys/values, and record fields:
AleoPlaintext =
  | { Primitive: "Field" | "Address" | "Boolean" }
  | { Primitive: { UInt: "U8" | "U16" | "U32" | "U64" | "U128" } }
  | { Struct:    { path: string[], program: string } }
```

**Critical**: `mode: "Public"` function inputs always have `ty: { Plaintext: { ... } }`. The `Plaintext` wrapper is NOT present on struct fields, record fields, or mapping key/value types — those use the inner type directly. Verified against actual `leo build` output.

### Input mode taxonomy

| Mode | Meaning |
|------|---------|
| `"Public"` | Plaintext, serialized as Leo literal string |
| `"None"` | Record input — passed as plaintext string from wallet |

---

## TypeScript Type Mapping

Types align with `@fairdrop/types/primitives` branded scalars for full composability with the rest of the SDK. `@fairdrop/types` is `private: false` and published to npm so both internal and external consumers have access.

| Leo type | In-memory TS type | Serialized form |
|----------|------------------|-----------------|
| `Field` | `Field` = `Brand<string, 'Field'>`, e.g. `"3443"` | `"3443field"` |
| `UInt.U128` | `U128` = `Brand<string, 'U128'>`, e.g. `"1000000"` | `"1000000u128"` |
| `UInt.U64` | `U64` = `Brand<string, 'U64'>`, e.g. `"42"` | `"42u64"` |
| `UInt.U32` | `number` | `"100u32"` |
| `UInt.U16` | `number` | `"30u16"` |
| `UInt.U8` | `number` | `"5u8"` |
| `Address` | `Address` = `Brand<string, 'Address'>` | identity |
| `Boolean` | `boolean` | `"true"` / `"false"` |
| `Struct { path }` | Generated interface | `"{ k: v, ... }"` |
| `Record { path }` | `string` (record plaintext) | passed as-is |
| `Final` (output) | stripped — transitions are fire-and-forget | — |

**Note**: in-memory `Field` value is `"3443"` (no suffix); `"3443field"` is only the serialized form passed to `executeTransaction`. Deserialization strips the suffix back to the bare decimal.

**Rationale for branded strings over `bigint`**: the existing codebase uses `Brand<string, ...>` for `Field`, `U128`, `U64` throughout `@fairdrop/sdk` and `@fairdrop/types`. Using `bigint` here would introduce type incompatibilities at every boundary.

---

## Mapping Reads

### `MappingFetcher` — shared interface in `@fairdrop/types`

The interface lives in `@fairdrop/types/primitives` (added as part of this feature) so both `@fairdrop/sdk/chain/_mapping.ts` and `@fairdrop/leo-abigen` reference the same type. No parallel definitions.

```typescript
// @fairdrop/types/src/primitives/mapping.ts  (new file)
export interface MappingFetcher {
  getMappingValue(
    programId: string,
    mapping:   string,
    key:       string,
  ): Promise<string | null>;
}
```

### `fromAleoClient()` adapter

`AleoNetworkClient.getProgramMappingValue()` returns `Promise<string>` and throws on a missing key — it does **not** satisfy `MappingFetcher` directly. The `fromAleoClient` adapter in `adapters.ts` normalises this:

```typescript
// src/runtime/adapters.ts

// Duck-typed parameter — AleoNetworkClient is not importable without @provablehq/sdk as a dependency.
// Any object with getProgramMappingValue satisfies this.
type NetworkLike = {
  getProgramMappingValue(programId: string, mapping: string, key: string): Promise<string>;
};

export function fromAleoClient(client: NetworkLike): MappingFetcher {
  return {
    getMappingValue: async (programId, mapping, key) => {
      try {
        const v = await client.getProgramMappingValue(programId, mapping, key);
        return v ? String(v) : null;
      } catch {
        return null;
      }
    },
  };
}
```

**WASM note**: mapping reads are pure HTTP — no WASM required. `fromAleoClient` wraps an HTTP call only. The Shield wallet WASM requirement applies to proving (execution) and view-key decryption, not reads.

### Mapping key types

For scalar-keyed mappings (`Field`, `Address`, etc.), the generated reader accepts the pre-serialized Leo literal directly:

```typescript
const pool = await dex.pools("3443field");
```

For composite-keyed mappings (keys derived via `BHP256::hash_to_field`), the key is computed by calling the relevant function from `@fairdrop/sdk/hash` — **not generated by codegen**. The key builder functions require WASM (`BHP256` from `@provablehq/sdk`), which contradicts the WASM-free mapping read guarantee. Generating hash logic inline would hide this WASM dependency.

Instead, the codegen emits a JSDoc comment on the mapping reader pointing to the correct SDK function:

```typescript
/**
 * Read lpBalances[LpBalKey { holder, pool_key }].
 * Key: use computeLpBalKey(holder, poolKey) from @fairdrop/sdk/hash
 * Note: key derivation requires WASM (@provablehq/sdk).
 */
lpBalances(key: string): Promise<U128 | null>;
```

The corresponding `computeLpBalKey` is added to `@fairdrop/sdk/hash/keys.ts` when implementing the DEX SDK layer — keeping all BHP256 key logic centralised in one place.

---

## Private Record Fetching

The third pillar of contract interaction alongside transitions (write) and mappings (read public).

Private records are encrypted UTXOs — the wallet adapter's `requestRecords(programId, true)` returns `WalletRecord[]` (from `@fairdrop/types/primitives`) with decrypted plaintext. The codegen generates typed **record scanners** from the ABI `records` section, using `parseStruct` from `dispatch.ts`.

```typescript
// Generated scanner (in the generated .ts — see Phase 2 codegen output)
export function scanLpTokenRecords(entries: WalletRecord[]): LpTokenRecord[] {
  return _scanLpToken(entries) as LpTokenRecord[];
}

// On the typed client:
const lpTokens = dex.records.lpTokens(walletRecords);
// → LpTokenRecord[] — includes .spent and ._record fields
```

`_record` on each entry holds the plaintext string for use as a transition input — consistent with `WalletTokenRecord._record`, `WalletBidRecord._record` in the existing types.

**Offline decryption** (view key + WASM, for indexer use): deferred to Phase 3. Uses `DecodedRecord<T>` from `@fairdrop/types/primitives`.

---

## Builder vs Executor Model

### `TransitionHandle<A>` — the core type

A callable interface with a `.build()` property. This is valid TypeScript: a callable interface can carry additional named properties.

```typescript
// src/runtime/transition.ts
import type { TransactionOptions } from '@provablehq/aleo-types';

export interface TxOptions {
  fee?:        number;
  privateFee?: boolean;
}

export interface TransitionHandle<A> {
  (args: A, opts?: TxOptions): Promise<string>;              // callable → executor mode
  build(args: A, opts?: TxOptions): TransactionOptions;      // property → builder mode
}
```

At runtime, `createTransitionBuilder` returns a function with `.build` set on it:

```typescript
function createTransitionBuilder<A>(
  programId: string,
  fn:        AbiFunction,
  structs:   AbiStruct[],
  config:    { fee: number; privateFee: boolean; executeTransaction?: ExecFn },
): TransitionHandle<A> {
  const build = (args: A, opts?: TxOptions): TransactionOptions => ({
    program:    programId,
    function:   fn.name,
    // TransactionOptions.inputs is string[] — wallets accept record objects at runtime
    inputs:     serializeInputs(args, fn.inputs, structs) as string[],
    fee:        opts?.fee        ?? config.fee,
    privateFee: opts?.privateFee ?? config.privateFee,
  });

  const execute = async (args: A, opts?: TxOptions): Promise<string> => {
    if (!config.executeTransaction) {
      throw new Error(
        `[leo-abigen] ${fn.name}: executor mode requires 'executeTransaction' in ClientConfig. ` +
        `Use .build() to get a TransactionOptions spec and pass it to executeTransaction() yourself.`
      );
    }
    const result = await config.executeTransaction(build(args, opts));
    if (!result) throw new Error(`[leo-abigen] ${fn.name}: executeTransaction returned undefined`);
    return result.transactionId;
  };

  (execute as TransitionHandle<A>).build = build;
  return execute as TransitionHandle<A>;
}
```

### Builder mode (recommended for React hooks)

```typescript
// Safe outside render cycle — no stale wallet reference
const spec = dex.swap.build(args);
const { executeTransaction } = useWallet();
await executeTransaction(spec);
```

### Executor mode (scripts, tests)

```typescript
const dex = createAbigen(abi, {
  fetchMapping:       fromAleoClient(getAleoClient()),
  executeTransaction: walletAdapter.executeTransaction,
  fee:                300_000,
});
const txId = await dex.swap(args);
```

**Why both**: `executeTransaction` from `useWallet()` is a React hook value — injecting it at client creation captures a stale reference across renders. The `.build()` pattern avoids this entirely and is the recommended React path.

### `.build()` return type — `TransactionOptions`

`.build()` returns `TransactionOptions` from `@provablehq/aleo-types` directly — no `TxSpec` alias, no local redefinition. The result passes to `executeTransaction()` unchanged.

```typescript
// @provablehq/aleo-types (for reference)
interface TransactionOptions {
  program:        string;
  function:       string;
  inputs:         string[];       // wallets accept record objects at runtime despite string[]
  fee?:           number;
  privateFee?:    boolean;
  recordIndices?: number[];       // unused by leo-abigen; wallet fills if needed
}
```

`@provablehq/aleo-types` is a regular dependency of `@fairdrop/leo-abigen` (pure types, no WASM, no runtime). External consumers of `leo-abigen` from npm already have it transitively through any wallet adapter.

---

## Architecture

### Folder structure

```
packages/
  leo-abigen/
    src/
      runtime/                  ← browser-safe, no WASM, publishable
        abi.ts                  ← ABI JSON schema types (AleoType, AbiFunction, etc.)
        dispatch.ts             ← type dispatch: AleoType → serialize/deserialize
        mapping.ts              ← createMappingReader(fetcher, programId, mapping, structs)
        transition.ts           ← createTransitionBuilder → TransitionHandle<A>
        records.ts              ← createRecordScanner(record, structs)
        client.ts               ← createAbigen(abi, config) → dynamic client object
        adapters.ts             ← fromAleoClient(), MappingFetcher re-export
      codegen/                  ← Node.js only, build-time, never imported by runtime
        structs.ts              ← emit struct interfaces
        records.ts              ← emit record interfaces + scanners
        transitions.ts          ← emit TransitionHandle<A> declarations + Args types
        mappings.ts             ← emit mapping reader declarations + key JSDoc
        client.ts               ← emit full typed client interface
        index.ts                ← CLI entry: generateTypes(abi) + arg parsing
      index.ts                  ← re-exports from runtime/ only
    package.json
    tsdown.config.ts
    tsconfig.json
```

`index.ts` sits inside `src/` — consistent with `@fairdrop/sdk` and `@fairdrop/types`.

### `package.json`

```json
{
  "name": "@fairdrop/leo-abigen",
  "version": "0.1.0",
  "private": false,
  "type": "module",
  "files": ["dist"],
  "bin": {
    "leo-abigen": "./dist/codegen.mjs"
  },
  "exports": {
    ".":          "./src/index.ts",
    "./adapters": "./src/runtime/adapters.ts",
    "./codegen":  "./src/codegen/index.ts"
  },
  "publishConfig": {
    "exports": {
      ".": {
        "import": "./dist/index.mjs",
        "types":  "./dist/index.d.mts"
      },
      "./adapters": {
        "import": "./dist/adapters.mjs",
        "types":  "./dist/adapters.d.mts"
      },
      "./codegen": {
        "import": "./dist/codegen.mjs",
        "types":  "./dist/codegen.d.mts"
      }
    }
  },
  "scripts": {
    "build":      "tsdown",
    "type-check": "tsc --noEmit",
    "test":       "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@fairdrop/types":        "workspace:*",
    "@provablehq/aleo-types": "*"
  },
  "devDependencies": {
    "tsdown":     "^0.21.7",
    "typescript": "~5.9.3",
    "vitest":     "^4.1.2"
  }
}
```

`@fairdrop/sdk` is **not** a dependency of `@fairdrop/leo-abigen`. The runtime is self-contained (see `dispatch.ts` below). External consumers of the npm package `leo-abigen` only need `@fairdrop/types`.

### `tsdown.config.ts`

```typescript
import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: {
    index:   'src/index.ts',
    adapters:'src/runtime/adapters.ts',
    codegen: 'src/codegen/index.ts',   // Node.js only — separate entry
  },
  format:    'esm',
  dts:       true,
  sourcemap: true,
  clean:     true,
  outDir:    'dist',
  deps: {
    neverBundle: ['@fairdrop/types', '@provablehq/aleo-types'],
  },
});
```

---

## Module responsibilities

### `abi.ts` — schema types only

```typescript
// Inner plaintext type — used in struct fields, record fields, mapping keys/values.
export type AleoPlaintext =
  | { Primitive: 'Field' | 'Address' | 'Boolean' }
  | { Primitive: { UInt: 'U8' | 'U16' | 'U32' | 'U64' | 'U128' } }
  | { Struct: { path: string[]; program: string } };

// Function input type — Public inputs wrap the plaintext type in { Plaintext: ... }.
// Record inputs use { Record: ... } directly (mode: "None").
export type AleoInputType =
  | { Plaintext: AleoPlaintext }
  | { Record: { path: string[]; program: string } }
  | 'Final';

export interface AbiField   { name: string; ty: AleoPlaintext; mode?: string; }
export interface AbiInput   { name: string; ty: AleoInputType; mode: 'Public' | 'None'; }
// Outputs have mode: "None" in the ABI but we don't use it — transitions are fire-and-forget.
export interface AbiOutput  { ty: AleoInputType; mode?: string; }
// Structs and records use path: string[] (e.g. ["AuctionConfig"]), NOT name: string.
export interface AbiStruct  { path: string[]; fields: AbiField[]; }
export interface AbiRecord  { path: string[]; fields: AbiField[]; }
export interface AbiMapping { name: string; key: AleoPlaintext; value: AleoPlaintext; }
export interface AbiFunction { name: string; is_final: boolean; inputs: AbiInput[]; outputs: AbiOutput[]; }
export interface Abi {
  program:            string;
  structs:            AbiStruct[];
  records:            AbiRecord[];
  mappings:           AbiMapping[];
  functions:          AbiFunction[];
  storage_variables?: unknown[];  // present in leo build output, unused by leo-abigen
}
```

### `dispatch.ts` — type-dispatch serialize/deserialize

Self-contained. **Does not import `@fairdrop/sdk`** — keeping the runtime standalone for open-source consumers. The format/parse logic here is trivially small (the most complex function is `parseStruct` at ~30 lines). In the Fairdrop monorepo, `@fairdrop/sdk/parse` and `@fairdrop/sdk/format` are the canonical sources for the same logic — this file is the standalone equivalent.

```typescript
import type { AleoPlaintext, AleoInputType, AbiStruct } from './abi';

// ── Serialization: TS value → Leo literal string ──────────────────────────────

export function serializeInput(
  value:   unknown,
  ty:      AleoInputType,
  structs: AbiStruct[],
): string {
  if (ty === 'Final') throw new Error('[leo-abigen] cannot serialize Final type');
  // Unwrap Plaintext wrapper — present on mode:"Public" function inputs.
  // Struct fields and record fields do NOT have this wrapper.
  if ('Plaintext' in ty) return serializePlaintext(value, ty.Plaintext, structs);
  if ('Record' in ty)  throw new Error('[leo-abigen] record inputs pass through as-is; do not call serializeInput on them');
  throw new Error(`[leo-abigen] cannot serialize: ${JSON.stringify(ty)}`);
}

function serializePlaintext(
  value:   unknown,
  ty:      AleoPlaintext,
  structs: AbiStruct[],
): string {
  if ('Primitive' in ty) {
    const p = ty.Primitive;
    if (p === 'Boolean') return String(Boolean(value));
    if (p === 'Address') return String(value);
    if (p === 'Field')   return ensureFieldSuffix(String(value));
    const uint = (p as { UInt: string }).UInt;
    if (uint === 'U128') return `${value}u128`;
    if (uint === 'U64')  return `${value}u64`;
    if (uint === 'U32')  return `${value}u32`;
    if (uint === 'U16')  return `${value}u16`;
    if (uint === 'U8')   return `${value}u8`;
  }
  if ('Struct' in ty) {
    const def = resolveStruct(ty.Struct.path, structs);
    const obj = value as Record<string, unknown>;
    const body = def.fields
      .map(f => `${f.name}: ${serializePlaintext(obj[f.name], f.ty, structs)}`)
      .join(', ');
    return `{ ${body} }`;
  }
  throw new Error(`[leo-abigen] cannot serialize: ${JSON.stringify(ty)}`);
}

// ── Deserialization: Leo literal string → TS value ────────────────────────────

// Deserializes mapping values and struct fields — these never have the Plaintext wrapper.
export function deserializeOutput(
  raw:     string,
  ty:      AleoPlaintext,
  structs: AbiStruct[],
): unknown {
  const s = stripVis(raw.trim());
  if ('Primitive' in ty) {
    const p = ty.Primitive;
    if (p === 'Boolean') return s === 'true';
    if (p === 'Address') return s;
    if (p === 'Field')   return stripSuffix(s);           // bare decimal → Field brand
    const uint = (p as { UInt: string }).UInt;
    if (uint === 'U128' || uint === 'U64') return stripSuffix(s);  // string brand
    return parseInt(stripSuffix(s), 10);                  // U32/U16/U8 → number
  }
  if ('Struct' in ty) {
    const def  = resolveStruct(ty.Struct.path, structs);
    const pairs = parseStruct(s);
    const result: Record<string, unknown> = {};
    for (const f of def.fields) {
      result[f.name] = deserializeOutput(pairs[f.name] ?? '', f.ty, structs);
    }
    return result;
  }
  return s;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function ensureFieldSuffix(v: string): string {
  return v.endsWith('field') ? v : `${v}field`;
}

function stripSuffix(raw: string): string {
  return raw.replace(/(?:u\d+|i\d+|field|group|bool|scalar)$/, '').trim();
}

function stripVis(raw: string): string {
  return raw.replace(/\.(private|public)$/, '');
}

function resolveStruct(path: string[], structs: AbiStruct[]): AbiStruct {
  // ABI structs use path: string[] (e.g. ["AuctionConfig"]), not name: string.
  const name = path[path.length - 1]!;
  const def  = structs.find(s => s.path[s.path.length - 1] === name);
  if (!def) throw new Error(`[leo-abigen] unknown struct: ${name}`);
  return def;
}

/**
 * Parse a Leo struct literal into a flat string map.
 * Handles nested braces correctly.
 * e.g. "{ a: 1u64, b: { x: 2u8 } }" → { a: '1u64', b: '{ x: 2u8 }' }
 * Exported so records.ts can reuse it for record plaintext parsing.
 */
export function parseStruct(raw: string): Record<string, string> {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
    throw new Error(`[leo-abigen] expected struct literal, got: "${trimmed.slice(0, 60)}"`);
  }
  const inner = trimmed.slice(1, -1).trim();
  const result: Record<string, string> = {};
  let depth = 0, key = '', value = '', inKey = true;
  for (const ch of inner) {
    if (ch === '{') depth++;
    if (ch === '}') depth--;
    if (inKey) {
      if (ch === ':') { inKey = false; value = ''; }
      else key += ch;
    } else {
      if (ch === ',' && depth === 0) {
        result[key.trim()] = value.trim();
        key = ''; value = ''; inKey = true;
      } else {
        value += ch;
      }
    }
  }
  if (key.trim()) result[key.trim()] = value.trim();
  return result;
}
```

### `mapping.ts`

```typescript
import type { MappingFetcher }           from '@fairdrop/types/primitives';
import type { AbiMapping, AbiStruct }    from './abi';
import { deserializeOutput }             from './dispatch';

export function createMappingReader(
  fetcher:   MappingFetcher,
  programId: string,
  mapping:   AbiMapping,
  structs:   AbiStruct[],
): (key: string) => Promise<unknown> {
  return async (key: string) => {
    const raw = await fetcher.getMappingValue(programId, mapping.name, key);
    if (raw === null) return null;
    // mapping.value is AleoPlaintext — no Plaintext wrapper on mapping value types.
    return deserializeOutput(raw, mapping.value, structs);
  };
}
```

### `transition.ts`

See `TransitionHandle<A>` section above. `serializeInputs` iterates `fn.inputs`, calls `serializeInput` for `Public` mode and passes through the raw string for `None` (record) mode.

```typescript
function serializeInputs(
  args:    Record<string, unknown>,
  inputs:  AbiInput[],
  structs: AbiStruct[],
): (string | Record<string, unknown>)[] {
  return inputs.map(inp => {
      if (inp.mode === 'None') {
        // Record input — pass through as string or Record<string,unknown>.
        // Wallets accept both at runtime; the wallet handles the record object at proving time.
        return args[inp.name] as string | Record<string, unknown>;
      }
      // Public input — inp.ty is { Plaintext: ... }; serializeInput unwraps it.
      return serializeInput(args[inp.name], inp.ty, structs);
    });
}
```

### `records.ts`

```typescript
import type { WalletRecord }        from '@fairdrop/types/primitives';
import type { AbiRecord, AbiStruct } from './abi';
import { deserializeOutput, parseStruct } from './dispatch';

export function createRecordScanner(
  record:  AbiRecord,
  structs: AbiStruct[],
): (entries: WalletRecord[]) => unknown[] {
  // ABI records use path: string[], not name: string.
  const recordName = record.path[record.path.length - 1]!;
  return (entries: WalletRecord[]) =>
    entries
      .filter(e => e.recordName === recordName)
      .map(e => {
        const fields = parseStruct(e.recordPlaintext);  // brace-depth-aware, handles nested structs
        const result: Record<string, unknown> = {};
        for (const f of record.fields) {
          result[f.name] = deserializeOutput(fields[f.name] ?? '', f.ty, structs);
        }
        result['spent']   = e.spent;
        result['_record'] = e.recordPlaintext;
        return result;
      });
}
```

### `client.ts`

```typescript
import type { TransactionOptions }  from '@provablehq/aleo-types';
import type { MappingFetcher }      from '@fairdrop/types/primitives';
import type { Abi, AbiStruct }      from './abi';
import { createMappingReader }      from './mapping';
import { createTransitionBuilder, type TxOptions } from './transition';
import { createRecordScanner }      from './records';

type ExecFn = (spec: TransactionOptions) => Promise<{ transactionId: string } | undefined>;

interface ClientConfig {
  fetchMapping?:       MappingFetcher;
  executeTransaction?: ExecFn;
  fee?:                number;
  privateFee?:         boolean;
}

export function createAbigen(abi: Abi, config: ClientConfig): Record<string, unknown> {
  const client: Record<string, unknown> = {};

  for (const fn of abi.functions) {
    client[fn.name] = createTransitionBuilder(abi.program, fn, abi.structs, {
      fee:                config.fee        ?? 300_000,
      privateFee:         config.privateFee ?? false,
      executeTransaction: config.executeTransaction,
    });
  }

  if (config.fetchMapping) {
    for (const mapping of abi.mappings) {
      client[mapping.name] = createMappingReader(
        config.fetchMapping, abi.program, mapping, abi.structs,
      );
    }
  }

  const records: Record<string, unknown> = {};
  for (const record of abi.records) {
    // AbiRecord has path: string[], not name: string.
    // PascalCase → camelCase + 's': LpToken → lpTokens
    const recordName = record.path[record.path.length - 1]!;
    const scannerName = recordName.charAt(0).toLowerCase() + recordName.slice(1) + 's';
    records[scannerName] = createRecordScanner(record, abi.structs);
  }
  client['records'] = records;

  return client;
}
```

At runtime this is untyped. Type safety comes from casting to the generated interface.

### `codegen/` modules

Each module emits a string fragment of the generated `.ts` file (real implementations, not ambient declarations). The output is a valid TypeScript source file that can be compiled, not a declaration-only `.d.ts`.

| File | Emits |
|------|-------|
| `structs.ts` | One `export interface X { ... }` per ABI struct; `X = struct.path[struct.path.length-1]` |
| `records.ts` | One `export interface XRecord { ... }` per ABI record; `X = record.path[record.path.length-1]`; + `createRecordScanner` wrapper with inlined `AbiRecord` def |
| `transitions.ts` | One `export interface XArgs { ... }` per transition |
| `mappings.ts` | Mapping reader declarations + BHP256 key JSDoc |
| `client.ts` | Full `export interface ProgramNameClient { ... }` using `TransitionHandle<A>` |
| `index.ts` | `generateTypes(abi): string` — assembles all fragments + CLI arg parsing; **must begin with `#!/usr/bin/env node` shebang** for direct CLI execution |

`TransitionHandle<A>` and `TxOptions` come from `@fairdrop/leo-abigen`. `TransactionOptions` (the `.build()` return type) comes directly from `@provablehq/aleo-types`. `createRecordScanner` and `AbiRecord` give scanner functions real implementations:

```typescript
import { createRecordScanner }                                from "@fairdrop/leo-abigen";
import type { TransitionHandle, TxOptions, AbiRecord }        from "@fairdrop/leo-abigen";
import type { TransactionOptions }                            from "@provablehq/aleo-types";
import type { Field, Address, U128, U64, U32, U16, U8 }      from "@fairdrop/types/primitives";
import type { WalletRecord }                                  from "@fairdrop/types/primitives";
```

---

## Codegen Layer — Generated Output for FairSwap DEX

```typescript
// auto-generated — do not edit
// source: fairswap_dex_v3.aleo  abi.json

import { createRecordScanner }                         from "@fairdrop/leo-abigen";
import type { TransitionHandle, TxOptions, AbiRecord } from "@fairdrop/leo-abigen";
import type { TransactionOptions }                     from "@provablehq/aleo-types";
import type { Field, Address, U128 }                  from "@fairdrop/types/primitives";
import type { WalletRecord }                           from "@fairdrop/types/primitives";

// ── Structs ───────────────────────────────────────────────────────────────────

export interface PoolState {
  token_a:     Field;
  token_b:     Field;
  reserve_a:   U128;
  reserve_b:   U128;
  lp_supply:   U128;
  fee_bps:     number;    // U16
  price_a_cum: U128;
  price_b_cum: U128;
  last_block:  number;    // U32
}

// ── Records ───────────────────────────────────────────────────────────────────

export interface LpTokenRecord {
  owner:    Address;
  pool_key: Field;
  amount:   U128;
  spent:    boolean;
  _record:  string;        // plaintext — pass as transition input
}

const _lpTokenRecordDef: AbiRecord = {
  path: ['LpToken'],  // matches WalletRecord.recordName === "LpToken"
  fields: [
    { name: 'owner',    ty: { Primitive: 'Address' } },
    { name: 'pool_key', ty: { Primitive: 'Field' } },
    { name: 'amount',   ty: { Primitive: { UInt: 'U128' } } },
  ],
};
// Pass full structs from the ABI if any record field has a Struct-typed value.
// LpToken fields are all primitives, so [] is safe here.
const _scanLpToken = createRecordScanner(_lpTokenRecordDef, []);

export function scanLpTokenRecords(entries: WalletRecord[]): LpTokenRecord[] {
  return _scanLpToken(entries) as LpTokenRecord[];
}

// ── Transition arg types ──────────────────────────────────────────────────────

export interface SwapArgs {
  token_in_id:  Field;
  token_out_id: Field;
  amount_in:    U128;
  min_out:      U128;
  recipient:    Address;
}

export interface AddLiquidityPrivateArgs {
  token_a_record: string | Record<string, unknown>;   // WalletRecord object or plaintext string
  token_b_record: string | Record<string, unknown>;   // wallets accept both at runtime
  pool_key:       Field;
  amount_a:       U128;
  amount_b:       U128;
  min_lp:         U128;
}

// ... one Args interface per transition ...

// ── Client interface ──────────────────────────────────────────────────────────

export interface FairswapDexV2 {
  // Transitions — dex.swap(args) executes, dex.swap.build(args) returns TransactionOptions
  createPool:               TransitionHandle<CreatePoolArgs>;
  addLiquidity:             TransitionHandle<AddLiquidityArgs>;
  addLiquidityPrivate:      TransitionHandle<AddLiquidityPrivateArgs>;
  addLiquidityCpiPrivateIn: TransitionHandle<AddLiquidityCpiPrivateInArgs>;
  removeLiquidity:          TransitionHandle<RemoveLiquidityArgs>;
  removeLiquidityPrivate:   TransitionHandle<RemoveLiquidityPrivateArgs>;
  swap:                     TransitionHandle<SwapArgs>;
  swapCpiPrivateIn:         TransitionHandle<SwapCpiPrivateInArgs>;
  swapPrivate:              TransitionHandle<SwapPrivateArgs>;
  lpToPrivate:              TransitionHandle<LpToPrivateArgs>;
  lpToPublic:               TransitionHandle<LpToPublicArgs>;
  withdrawProtocolFees:     TransitionHandle<WithdrawProtocolFeesArgs>;
  updateFee:                TransitionHandle<UpdateFeeArgs>;
  toggleProtocolFee:        TransitionHandle<ToggleProtocolFeeArgs>;
  togglePaused:             TransitionHandle<TogglePausedArgs>;

  // Mapping reads — pure HTTP, no WASM
  pools(key: string): Promise<PoolState | null>;

  /**
   * Key: use computeLpBalKey(holder, poolKey) from @fairdrop/sdk/hash
   * Note: key derivation requires WASM (@provablehq/sdk).
   */
  lpBalances(key: string): Promise<U128 | null>;
  protocolFees(key: string): Promise<U128 | null>;
  protocolFeeEnabled(key: string): Promise<boolean | null>;
  paused(key: string): Promise<boolean | null>;
  consumedOps(key: string): Promise<boolean | null>;

  // Record scanners
  records: {
    /**
     * Parse LpToken records from requestRecords() output.
     * @emits LpToken after: addLiquidityPrivate, lpToPrivate
     */
    lpTokens(entries: WalletRecord[]): LpTokenRecord[];
  };
}
```

Usage:

```typescript
import type { FairswapDexV2 }  from "./generated/fairswap-dex-v2";
import rawAbi                  from "./build/abi.json";
import { createAbigen,
         fromAleoClient }      from "@fairdrop/leo-abigen";
import { getAleoClient }       from "@fairdrop/sdk/client";

const dex = createAbigen(rawAbi, {
  fetchMapping: fromAleoClient(getAleoClient()),
}) as FairswapDexV2;

// Builder mode (React hook)
const spec = dex.swap.build({ token_in_id: ..., amount_in: "1000000" as U128, ... });
const { executeTransaction } = useWallet();
await executeTransaction(spec);

// Mapping read
const pool = await dex.pools("3443field");

// Record scan
const lpTokens = dex.records.lpTokens(walletRecords);
```

---

## Record Outputs from Transitions

Several transitions return private records alongside `Final` (`add_liquidity_private` → `LpToken`, `swap_private` → `Token`, `lp_to_private` → `LpToken`). These appear asynchronously in the wallet — the library cannot surface them at call time.

Return type is always `Promise<string>` (transactionId). The `@emits` JSDoc on the relevant mapping scanner serves as the documentation link.

---

## Required Changes to `@fairdrop/types`

This feature requires two changes to `packages/types/`:

**1. Set `"private": false`** in `packages/types/package.json` so the package is publishable alongside `leo-abigen`. External consumers of `leo-abigen` on npm need `@fairdrop/types` for the branded primitive types.

**2. Add `MappingFetcher`** to `packages/types/src/primitives/`:

```typescript
// packages/types/src/primitives/mapping.ts  (new file)
/**
 * Minimal interface for reading Aleo on-chain mapping values.
 * Satisfied by AleoNetworkClient (via fromAleoClient adapter) or any fetch wrapper.
 */
export interface MappingFetcher {
  getMappingValue(
    programId: string,
    mapping:   string,
    key:       string,
  ): Promise<string | null>;
}
```

Re-export from `packages/types/src/primitives/index.ts`:
```typescript
export type { MappingFetcher } from './mapping';
```

This makes `MappingFetcher` available from `@fairdrop/types/primitives` for any package that needs it — including `@fairdrop/sdk/chain/_mapping.ts` which can be updated to import the shared type rather than implicitly defining its own shape.

---

## Turbo + pnpm Integration

### Workspace placement

`packages/leo-abigen/` is picked up automatically by the existing pnpm workspace glob `packages/*`. No workspace config change needed.

### Turbo pipeline — add `codegen` task

The `codegen` task is Turbo-cacheable: its inputs are `abi.json` and the generator source; its outputs are the generated `.ts` file. Add to `turbo.json`:

```json
{
  "tasks": {
    "build": { ... },
    "codegen": {
      "inputs":    ["build/abi.json"],
      "outputs":   ["src/generated/**"],
      "dependsOn": ["@fairdrop/leo-abigen#build"]
    }
  }
}
```

Each contract package adds a `codegen` script pointing to the CLI:

```json
// packages/contracts/fairswap-dex/package.json (future)
{
  "scripts": {
    "build":   "leo build",
    "codegen": "leo-abigen --abi build/abi.json --out src/generated/"
  }
}
```

pnpm resolves the `leo-abigen` bin from the workspace automatically — no relative path needed. After `npm publish`, the identical command works unchanged using the installed package's `bin` entry (`./dist/codegen.mjs`). Do **not** use a relative path like `../../leo-abigen/src/codegen/index.ts` — it breaks if the contract package moves.

### Dependency graph

`→` means "depends on":

```
@provablehq/aleo-types   (external — TransactionOptions, TransactionStatus, etc.)
                                   ↑
@fairdrop/types          @fairdrop/leo-abigen
(private: false)         (@fairdrop/types + @provablehq/aleo-types)
       ↑                          ↑
@fairdrop/sdk                     |
(@provablehq/sdk peer)            |
       ↑             ↑────────────┘
            apps/frontend
contracts/fairswap-dex   → @fairdrop/leo-abigen (build-time codegen CLI only)
```

`@fairdrop/sdk` and `@fairdrop/leo-abigen` are siblings — neither depends on the other. No circular dependencies. External `leo-abigen` consumers need `@fairdrop/types` and `@provablehq/aleo-types`; both are lightweight (no WASM).

---

## Implementation Phases

### Phase 1 — Core runtime (no codegen)

1. Add `MappingFetcher` to `@fairdrop/types/primitives`, set `private: false`
2. `src/runtime/abi.ts` — schema types
3. `src/runtime/dispatch.ts` — self-contained serialize/deserialize with `parseStruct`
4. `src/runtime/mapping.ts` — `createMappingReader`
5. `src/runtime/transition.ts` — `TransitionHandle<A>` + `createTransitionBuilder` with executor error
6. `src/runtime/records.ts` — `createRecordScanner` using `parseStruct` from `dispatch.ts`
7. `src/runtime/adapters.ts` — `fromAleoClient()` + `MappingFetcher` re-export
8. `src/runtime/client.ts` — `createAbigen()` with `records.*` namespace
9. `src/index.ts` — re-exports:
   ```typescript
   // Runtime — public API consumed by app code and generated files
   export { createAbigen }                              from './runtime/client';
   export { fromAleoClient }                            from './runtime/adapters';
   export { createRecordScanner }                       from './runtime/records';
   export { createTransitionBuilder }                   from './runtime/transition';
   export type { TransitionHandle, TxOptions }          from './runtime/transition';
   export type { Abi, AbiRecord, AbiStruct, AbiField,
                 AbiMapping, AbiFunction, AbiInput,
                 AleoPlaintext, AleoInputType }          from './runtime/abi';
   export type { MappingFetcher }                       from '@fairdrop/types/primitives';
   ```
10. Unit tests: `dispatch.ts` (pure, exhaustively testable), `records.ts`, `transition.ts` build path
11. Add `@fairdrop/leo-abigen#build` to turbo pipeline

### Phase 2 — Codegen

1. `src/codegen/structs.ts` — struct interface emitter
2. `src/codegen/records.ts` — record interface + scanner declaration emitter
3. `src/codegen/transitions.ts` — Args interfaces + `TransitionHandle<A>` declarations
4. `src/codegen/mappings.ts` — mapping reader declarations + BHP256 key JSDoc
5. `src/codegen/client.ts` — full typed client interface assembler
6. `src/codegen/index.ts` — `generateTypes(abi)` + CLI (`--abi`, `--out`, `--program-name`)
7. Add `codegen` task to `turbo.json`
8. Add `computeLpBalKey` (and analogues) to `@fairdrop/sdk/hash/keys.ts`
9. Integrate: add `codegen` script to `packages/contracts/fairswap-dex/package.json`

### Phase 3 — Polish

1. Address regex validation + UInt range checks in `serializeInput`
2. `waitForFinalization(txId, fetcher)` — polling helper
3. Leo revert reason extraction from failed tx receipt
4. Offline record scanner: view key + WASM → `DecodedRecord<T>` from `@fairdrop/types/primitives`
5. Multi-contract support: `--external-abi` flag passes external struct definitions to codegen
6. `camelCase` naming option for transition/mapping names in generated interface

---

## Issues & Resolutions (39)

### Batch 1 — Design review

| # | Issue | Resolution |
|---|-------|------------|
| B1-1 | Generated interface invalid TypeScript — same name used as property `{build}` AND callable method | `TransitionHandle<A>` callable interface: `(args: A): Promise<string>` + `build(args: A): TransactionOptions` on the same type |
| B1-2 | `getAleoClient()` doesn't satisfy `MappingFetcher` — it throws on missing key, doesn't return `null` | `fromAleoClient(client)` adapter in `adapters.ts` normalises throws to `null` |
| B1-3 | `@fairdrop/sdk/parse/leo` and `@fairdrop/sdk/format/leo` are not exported subpaths — only `/parse` and `/format` are | Resolved: `dispatch.ts` does not import `@fairdrop/sdk` at all; logic is self-contained |
| B1-4 | `TxOptions` per-call fee override in generated interface but deferred to Phase 3 | Implemented in Phase 1 — `TxOptions` is part of `TransitionHandle<A>` from day one |
| B1-5 | Monorepo CLI path used npm scope `@fairdrop/` in filesystem path | Corrected to `packages/leo-abigen/src/codegen/index.ts` |
| B1-6 | Executor mode silent failure if `executeTransaction` not provided | `createTransitionBuilder` throws a clear descriptive error with the transition name |
| B1-7 | Key builder implementations have no specified strategy — Phase 2 blocker | Key builders NOT generated. Composite key functions added to `@fairdrop/sdk/hash/keys.ts`. Codegen emits JSDoc pointing to the right function. WASM dependency stays explicit and centralised. |
| B1-8 | Generated code imports `@fairdrop/types` which is a private workspace package — external npm consumers can't use it | `@fairdrop/types` set `private: false`, published alongside `leo-abigen` on npm |
| B1-9 | `@fairdrop/sdk` marked optional peer but `deserialize.ts` unconditionally imports from it | `dispatch.ts` is self-contained — no `@fairdrop/sdk` import. `@fairdrop/sdk` is not a dependency of `leo-abigen`. |
| B1-10 | `toCamelCase` utility undefined; naive `+ 's'` pluralization fragile | Defined inline using the record name from `path`: `recordName.charAt(0).toLowerCase() + recordName.slice(1) + 's'` — explicit, no magic. (B4-2 later corrected `record.name` → `record.path[record.path.length-1]`.) |
| B1-11 | `Field` type note mixed in-memory and serialized representations | Table now has two columns: in-memory TS type and serialized Leo form — clearly separated |

### Batch 2 — DRY, structure, and types review

| # | Issue | Resolution |
|---|-------|------------|
| B2-1 | `codegen.ts` flat alongside browser-safe runtime — bundlers may pull it in | `src/codegen/` subdirectory isolated from `src/runtime/`; separate tsdown entry |
| B2-2 | Single `codegen.ts` grows unmaintainable for full ABI code generation | Split into `codegen/structs.ts`, `codegen/records.ts`, `codegen/transitions.ts`, `codegen/mappings.ts`, `codegen/client.ts`, `codegen/index.ts` |
| B2-3 | `index.ts` at package root — inconsistent with `@fairdrop/sdk` and `@fairdrop/types` which put `index.ts` inside `src/` | `index.ts` moved to `src/index.ts` |
| B2-4 | `serialize.ts` as standalone module duplicates `@fairdrop/sdk/format` formatters | No standalone `serialize.ts`. Logic folded into `dispatch.ts` — the only new code is the `AleoType` dispatch. |
| B2-5 | `deserialize.ts` as standalone module duplicates `@fairdrop/sdk/parse` parsers | Same as B2-4 — folded into `dispatch.ts` |
| B2-6 | `MappingFetcher` interface not in `@fairdrop/types` — parallel definitions in SDK and leo-abigen | Added to `@fairdrop/types/src/primitives/mapping.ts`, re-exported from primitives index |
| B2-7 | Same as B2-6 (duplicate entry) | See B2-6 |
| B2-8 | Key builders require WASM (BHP256) but plan claimed mapping reads are WASM-free — contradiction | Resolved: key builders NOT generated. WASM stays in `@fairdrop/sdk/hash`. Mapping read layer itself remains WASM-free. JSDoc documents which SDK function to call. |
| B2-9 | Key builder codegen would duplicate BHP256 hash logic from `@fairdrop/sdk/hash` | Resolved: same as B2-8 — single source of truth in `@fairdrop/sdk/hash/keys.ts` |
| B2-10 | `hashStruct` is internal to `_bhp.ts` (not exported from `@fairdrop/sdk/hash`) — no path for generated code to call it | Moot: key builders are not generated. New key functions (e.g. `computeLpBalKey`) are added to `keys.ts` using the existing `hashStruct` internally. |
| B2-11 | `DecodedRecord<T>` exists in `@fairdrop/types/primitives` but not referenced for offline scanning | Phase 3 offline scanner explicitly uses `DecodedRecord<T>` from `@fairdrop/types/primitives` |

### Batch 3 — Correctness and ergonomics review

| # | Issue | Resolution |
|---|-------|------------|
| B3-1 | `serializeInputs` filter `inp.mode !== 'None' \|\| true` is dead code — always evaluates to `true` | Removed dead filter; `inputs.map(...)` iterates all inputs directly |
| B3-2 | `records.ts` imports `stripVis` from `dispatch.ts` but never uses it | Removed from import; only `deserializeOutput` and `parseStruct` are imported |
| B3-3 | `parsePlaintext` in `records.ts` uses regex `[^,}\s]+` which silently fails for nested struct field values | Replaced with `parseStruct` exported from `dispatch.ts` — brace-depth-aware, handles nesting correctly. Removed local `parsePlaintext`. |
| B3-4 | `fromAleoClient` uses `AleoNetworkClient` as parameter type but the type is not importable (`@provablehq/sdk` is not a dependency) | Replaced with structural duck type `NetworkLike = { getProgramMappingValue(...): Promise<string> }` defined locally in `adapters.ts` |
| B3-5 | `client.ts` imports `TxSpec` from `@fairdrop/sdk/transactions` but `@fairdrop/sdk` is not a declared dependency | Dropped `TxSpec` entirely. `.build()` returns `TransactionOptions` from `@provablehq/aleo-types` (added as a regular dependency). No local redefinition needed. |
| B3-6 | Generated file imports `TxSpec` from `@fairdrop/sdk/transactions` — breaks open-source consumers | Generated file imports `TransactionOptions` from `@provablehq/aleo-types` directly. `TxSpec` is gone. |
| B3-7 | Dependency graph showed `leo-abigen` ← `sdk` with `↑` arrows, implying SDK depends on `leo-abigen` (reversed) | Redrawn: `sdk` and `leo-abigen` are siblings, both pointing up to `@fairdrop/types`; `apps/frontend` depends on both |
| B3-8 | `scanLpTokenRecords` was a declaration-only stub (`...): LpTokenRecord[];`) — invalid in a `.ts` file | Codegen generates `.ts` (real implementations). Scanner inlines the `AbiRecord` definition and calls `createRecordScanner` from `@fairdrop/leo-abigen`. |
| B3-9 | Turbo `codegen` inputs included `src/abi.ts` — this file belongs to the `leo-abigen` package, not the contract package running the task | Removed; the generator source is tracked via `dependsOn: ["@fairdrop/leo-abigen#build"]`. Only `build/abi.json` is a per-contract input. |
| B3-10 | `src/codegen/index.ts` had no shebang — `node` cannot execute it directly as a CLI tool | First line must be `#!/usr/bin/env node`. tsdown preserves the shebang when bundling the `codegen` entry. |
| B3-11 | Contract `codegen` script used fragile relative path `../../leo-abigen/src/codegen/index.ts` — breaks if contract package moves | Use the `bin` entry: `"codegen": "leo-abigen --abi build/abi.json --out src/generated/"`. pnpm resolves workspace bins; after publish, identical command works unchanged. |

### Batch 4 — ABI format verification (against real `leo build` output)

| # | Issue | Resolution |
|---|-------|------------|
| B4-1 | `mode: "Public"` inputs have `ty: { Plaintext: { Primitive: "..." } }` — plan assumed `ty: { Primitive: "..." }`. `serializeInput` would silently misroute every public input. | Added `Plaintext` wrapper to `AleoType`. `serializeInput` unwraps it; delegates to `serializePlaintext` for the inner type. |
| B4-2 | ABI structs and records use `path: string[]` not `name: string`. `resolveStruct` did `s.name === name` → always `undefined` → every struct deserialization threw. | `AbiStruct`/`AbiRecord` typed as `{ path: string[] }`. `resolveStruct` now matches `s.path[s.path.length-1]`. `createRecordScanner` extracts name from `record.path[record.path.length-1]` for `WalletRecord.recordName` filter. `client.ts` scanner key derivation also updated: `record.path[record.path.length-1]` (not `record.name`). |
| B4-3 | Generated `_lpTokenRecordDef` used `name: 'LpToken'` (non-existent field) | Changed to `path: ['LpToken']` matching actual ABI format. |
| B4-4 | `@provablehq/aleo-types` was not listed in `tsdown.config.ts` `neverBundle` — would have been inlined into the dist bundle | Added to `neverBundle: ['@fairdrop/types', '@provablehq/aleo-types']`. |
| B4-5 | `src/index.ts` re-exports were never specified — generated files import `createRecordScanner`, `TransitionHandle`, `TxOptions`, `AbiRecord` from `@fairdrop/leo-abigen` but the index content was undocumented | Full re-export list added to Phase 1 step 9. |
| B4-6 | Record-input `Args` fields typed as `string` — but wallets pass record objects as `Record<string, unknown>` at runtime | Changed to `string \| Record<string, unknown>` in generated `Args` interfaces for `mode: "None"` inputs. Matches actual `@fairdrop/sdk` record passing convention. |

---

## Open Questions

| Question | Notes |
|----------|-------|
| `addLiquidityCpiPrivateIn` naming | ABI uses snake_case; generated client should camelCase. Add `--snake-case` flag to codegen for projects that prefer snake_case on the TypeScript side. |
| Node response format | Confirm whether struct mapping values return as Leo literal strings or pre-parsed JSON (node-version-dependent). The `String(value)` cast in `fromAleoClient` handles both safely. |
| Multi-contract struct sharing | `token_registry.aleo::Token` appears in the DEX ABI. Phase 3 `--external-abi` flag: pass additional ABI files whose structs are imported rather than re-declared. |
| Open-source scope naming | `@fairdrop` scope is Fairdrop-org specific. If `leo-abigen` is published as a general Aleo tool, consider `@aleo/abigen` or the unscoped `leo-abigen`. |
