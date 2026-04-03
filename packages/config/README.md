# @fairdrop/config

Two independent exports:

- **`PROGRAMS`** — static program IDs and salts from `contracts/deployments/programs.json`. Bundled at compile time. Use directly with no setup required.
- **`defineConfig`** — runtime configuration (RPC URL, network, accounts). Call once at entry if your consumer needs these values. Throws on missing env vars.

## Usage

**`PROGRAMS` only** (e.g. the indexer — needs program IDs, not RPC config):
```ts
import { PROGRAMS } from '@fairdrop/config'

PROGRAMS.dutch.programId   // 'fairdrop_dutch_v2.aleo'
PROGRAMS.raise.programId   // 'fairdrop_raise_v2.aleo'
```

**`defineConfig`** (e.g. the frontend or a service that needs the RPC URL and accounts):

Call `defineConfig` once at the entry point, passing env vars explicitly. It throws immediately on missing or invalid values.

**`apps/web` (Vite):**
```ts
import { defineConfig } from '@fairdrop/config'

export const config = defineConfig({
  network: import.meta.env.VITE_ALEO_NETWORK,
  rpcUrl:  import.meta.env.VITE_ALEO_RPC_URL,
})
```

**Services (Node):**
```ts
import { defineConfig } from '@fairdrop/config'

export const config = defineConfig({
  network: process.env.ALEO_NETWORK,
  rpcUrl:  process.env.ALEO_RPC_URL,
})
```

## What it returns

```ts
config.network      // 'testnet' | 'mainnet'
config.rpcUrl       // Aleo node RPC endpoint
config.explorerUrl  // base URL for transaction links
config.programs     // all program IDs + salts, keyed by name
config.accounts     // protocolTreasury, feeCollector, opsMultisig
```

## Why a factory function?

`apps/web` reads env vars from `import.meta.env.VITE_*`; services read from `process.env.*`. A shared package can't know which system its consumer uses — so callers pass their own env vars explicitly. This also makes config trivially testable.

## Env vars

| Consumer | Variable | Value |
|---|---|---|
| `apps/web` | `VITE_ALEO_NETWORK` | `testnet` or `mainnet` |
| `apps/web` | `VITE_ALEO_RPC_URL` | Aleo node RPC URL |
| Services | `ALEO_NETWORK` | `testnet` or `mainnet` |
| Services | `ALEO_RPC_URL` | Aleo node RPC URL |
