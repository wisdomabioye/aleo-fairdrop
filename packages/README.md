# packages/

Shared libraries consumed by apps and services. All are internal (`"private": true`) — not published to npm.

| Package | Purpose |
|---|---|
| `types/` | TypeScript types for contracts, domain, API, DB, indexer. No runtime code, no build step. |
| `ui/` | Shared React component library (shadcn/ui base). Used by `apps/web`. |
| `database/` | Drizzle ORM schema + migrations. Shared between `services/indexer` and `services/api`. |
| `config/` | Environment-specific constants derived from `contracts/deployments/`. |
| `sdk/` | TypeScript SDK for calling fairdrop contracts — wraps wallet adapter calls with typed inputs. |

Import from sub-paths to keep tree-shaking effective:

```ts
import type { DutchAuctionConfig } from '@fairdrop/types/contracts'
import type { AuctionRow }         from '@fairdrop/types/db'
```
