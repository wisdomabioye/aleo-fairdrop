# @fairdrop/sdk

TypeScript SDK for interacting with the fairdrop contracts. Wraps wallet adapter calls with typed inputs and handles:

- Building transition input arrays in the correct Leo encoding order
- `u128`/`u64`/`field` serialisation to Leo literal strings (`123u128`, `0field`)
- Estimating fees per transition
- Polling `transactionStatus` until finalized

Depends on `@fairdrop/types/contracts` for input types and `@provablehq/aleo-wallet-adaptor-core` for execution.

```ts
import { createAuction } from '@fairdrop/sdk'

const txId = await createAuction(wallet, { supply: 1_000_000n, ... })
```

## Status

Not yet implemented.
