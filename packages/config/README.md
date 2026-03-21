# @fairdrop/config

Runtime configuration for all fairdrop consumers. Reads program IDs from `contracts/deployments/programs.json` and protocol accounts from the active network's `network.json` — bundled at compile time, no runtime I/O.

## Usage

Call `defineConfig` once at the entry point of each consumer, passing env vars explicitly. It throws immediately on missing or invalid values.

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
