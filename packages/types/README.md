# @fairdrop/types

Shared TypeScript types for the entire monorepo. No runtime code — pure type declarations. No build step required; consumers import source directly.

## Import by sub-path

```ts
import type { DutchAuctionConfig, CreateAuctionInput } from '@fairdrop/types/contracts'
import type { AuctionView, BidView }                   from '@fairdrop/types/domain'
import type { TransitionEvent }                        from '@fairdrop/types/indexer'
import type { Page, AuctionListParams }                from '@fairdrop/types/api'
import type { Field, U128, Address }                   from '@fairdrop/types/primitives'

// DB row types (AuctionRow, BidRow, etc.) come from @fairdrop/database — not from here
```

There is no root `@fairdrop/types` export — sub-paths are mandatory for tree-shaking.

## Structure

| Sub-path | Contents |
|---|---|
| `primitives/` | Branded scalar types (`Field`, `Address`, `U64`, `U128`) and `DecodedRecord<T>` |
| `contracts/` | 1:1 mirrors of Leo structs + transition input types, per program |
| `domain/` | Enriched view models with enums, `bigint`, and `Date` for UI/API |
| `api/` | Request/response shapes, pagination, filter params |
| `indexer/` | `TransitionEvent`, `MappingUpdateEvent`, `IndexerCheckpoint` |

## Conventions

- `contracts/` types use `snake_case` to match Leo field names exactly.
- `domain/` types use `camelCase` (TypeScript convention).
- Large on-chain integers (`u128`, `u64`) are `bigint` in domain types and decimal strings in DB row types.
