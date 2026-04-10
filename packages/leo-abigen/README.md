# leo-abigen

ABI-to-TypeScript binding generator for [Leo](https://leo-lang.org/) / Aleo smart contracts.

Consumes the `abi.json` produced by `leo build` and provides:

- **Runtime** — serialize inputs, deserialize mapping values, scan private wallet records
- **Codegen** — CLI that generates a fully typed TypeScript client from any `abi.json`

Analogous to `go-ethereum/abigen` for the Aleo ecosystem.

---

## Installation

```bash
npm install leo-abigen @fairdrop/types
```

> `@provablehq/aleo-types` is a peer dependency provided automatically by any Provable wallet adapter.

---

## Quick start

```typescript
import abi from "./build/abi.json";
import { createAbigen, fromAleoClient } from "leo-abigen";
import type { MyContractV1 } from "./generated/my-contract-v1";

const client = createAbigen(abi, {
  fetchMapping: fromAleoClient(aleoNetworkClient),
}) as MyContractV1;

// Builder mode (recommended for React hooks — avoids stale wallet reference)
const spec = client.swap.build({ token_in_id: "1", amount_in: "1000000" as U128, ... });
const { executeTransaction } = useWallet();
await executeTransaction(spec);

// Mapping read — pure HTTP, no WASM
const pool = await client.pools("3443field");
console.log(pool?.reserve_a); // U128 branded string

// Private record scanner
const lpTokens = client.records.lpTokens(walletRecords);
```

---

## Codegen CLI

Generate a typed client from a contract's `abi.json`:

```bash
leo-abigen --abi build/abi.json --out src/generated/my-contract-v1.ts
```

The generated file imports only from `leo-abigen` and `@fairdrop/types/primitives` — no contract-specific dependencies.

### Turbo integration

```json
// turbo.json
{
  "tasks": {
    "codegen": {
      "inputs":    ["build/abi.json"],
      "outputs":   ["src/generated/**"],
      "dependsOn": ["leo-abigen#build"]
    }
  }
}
```

```json
// your-contract/package.json
{
  "scripts": {
    "build":   "leo build",
    "codegen": "leo-abigen --abi build/abi.json --out src/generated/"
  }
}
```

---

## API

### `createAbigen(abi, config)`

Creates a dynamic client object. Cast to the generated interface for full type safety.

| Config option | Type | Description |
|---|---|---|
| `fetchMapping` | `MappingFetcher` | For mapping reads. Provide via `fromAleoClient()`. |
| `executeTransaction` | `(spec) => Promise<{transactionId}>` | For executor mode. |
| `fee` | `number` | Default fee in microcredits. Default: `300_000`. |
| `privateFee` | `boolean` | Pay fee from private balance. Default: `false`. |

### `fromAleoClient(client)`

Adapts an `AleoNetworkClient` (from `@provablehq/sdk`) to `MappingFetcher`. Converts thrown errors (key not found) to `null`.

### `TransitionHandle<A>`

Every generated transition is a `TransitionHandle<A>` — both callable and has a `.build()` property:

```typescript
// Executor mode — calls executeTransaction directly
const txId = await client.swap(args);

// Builder mode — returns TransactionOptions for the caller to execute
const spec: TransactionOptions = client.swap.build(args);
```

### `createRecordScanner(record, structs)`

Creates a typed scanner for a specific record type. Used internally by the generated code, but also exportable for custom record handling.

---

## Type mapping

| Leo type | In-memory TypeScript | Serialized (wire) form |
|---|---|---|
| `Field` | `Field` (`Brand<string, 'Field'>`) | `"3443field"` |
| `U128` | `U128` (`Brand<string, 'U128'>`) | `"1000000u128"` |
| `U64` | `U64` (`Brand<string, 'U64'>`) | `"42u64"` |
| `U32` / `U16` / `U8` | `number` | `"100u32"` |
| `Address` | `Address` (`Brand<string, 'Address'>`) | identity |
| `Boolean` | `boolean` | `"true"` / `"false"` |
| Struct | Generated interface | `"{ field: value, ... }"` |
| Record input | `string \| Record<string, unknown>` | passed through to wallet |

---

## Architecture

```
src/
  runtime/          ← browser-safe, no WASM, published to npm
    abi.ts          ← ABI JSON schema types
    dispatch.ts     ← serialize / deserialize Leo values
    mapping.ts      ← createMappingReader
    transition.ts   ← TransitionHandle<A>, createTransitionBuilder
    records.ts      ← createRecordScanner
    adapters.ts     ← fromAleoClient adapter
    client.ts       ← createAbigen
  codegen/          ← Node.js CLI, build-time only
    index.ts        ← generateTypes(abi) + CLI entry
    structs.ts      ← emit struct interfaces
    records.ts      ← emit record interfaces + scanners
    transitions.ts  ← emit Args interfaces
    mappings.ts     ← emit mapping reader declarations
    client.ts       ← emit typed client interface
    utils.ts        ← toCamelCase, toPascalCase, type mapping helpers
  index.ts          ← public API re-exports
```

---

## License

MIT
