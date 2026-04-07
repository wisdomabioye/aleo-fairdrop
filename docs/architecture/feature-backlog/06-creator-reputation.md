# Plan: Creator Reputation Display

## Summary

Surface the on-chain `CreatorStats` from `fairdrop_proof_v2.aleo` in the frontend. Show a trust
badge on auction cards, a full reputation panel on auction detail pages, and a creator page
showing their stats and auction history. No new contract data — `reputation[address]` is already
populated by `update_reputation` CPI calls at `close_auction`.

Split into two phases. Phase 1 (build now) surfaces existing on-chain data — high trust-signal
value, low effort. Phase 2 (defer) adds editable creator profiles; each auction already carries
identity via its own IPFS metadata and a profile layer adds no verifiable signal at current scale.

---

## Scope

| Layer | Phase 1 | Phase 2 |
|---|---|---|
| Contract | None | None |
| DB schema | New `creatorReputation` table | New `creatorProfiles` table |
| SDK | `fetchCreatorReputation` already exists | — |
| Indexer | Migrate to `@fairdrop/sdk/chain`; upsert on `close_auction` | — |
| API | `GET /creators/:address`; join into auction list + single fetch | `PUT /creators/:address/profile` |
| Frontend | Badge, tier, stats, creator page, top creators page | Profile edit form, avatar, bio, socials |

---

## On-chain data available

`fairdrop_proof_v2.aleo::reputation[address]` (Leo field names):

```ts
auctions_run: u64   // total auctions closed (filled or not)
filled:       u64   // auctions that cleared
volume:       u128  // cumulative total_payments in microcredits
```

`fetchCreatorReputation(creator)` in `@fairdrop/sdk/chain/proof` already reads and parses this.
Returns `{ total_auctions, filled_auctions, total_volume }` or `null` if no record.

Derived metrics (computed server-side):
- **Fill rate** = `filled / auctions_run` (0–100%)
- **Tier**: Bronze (≥1 filled), Silver (≥3 filled, fill_rate ≥ 70%), Gold (≥10 filled, fill_rate ≥ 90%)

---

## Phase 1 — On-chain reputation display

### DB schema

#### New table: `creatorReputation`

The existing `userReputation` table tracks bidder-side metrics (`auctionCount, totalCommitted,
totalRefunded, claimCount, voidCount`) — different concern, different columns. A separate table
is required.

```ts
export const creatorReputation = pgTable('creator_reputation', {
  address:        text('address').primaryKey(),
  auctionsRun:    integer('auctions_run').notNull().default(0),
  filledAuctions: integer('filled_auctions').notNull().default(0),
  volume:         text('volume').notNull().default('0'),  // u128 decimal string
  updatedAt:      timestamp('updated_at').notNull(),
});
```

### Indexer changes

#### Migrate mapping fetches to `@fairdrop/sdk/chain`

`handlers/mapping.ts` duplicates `fetchAuctionConfig` / `fetchAuctionState` already in the SDK.

At startup (`index.ts`), call `initAleoClient(env.aleoRpcUrl)` alongside the existing
`new AleoRpcClient(env.aleoRpcUrl)`. Keep `AleoRpcClient` for block polling (rate limiting,
batching, retry). Use SDK chain functions for all mapping reads.

Delete `handlers/mapping.ts`. In `handlers/auction.ts`, replace:

```ts
// Before
import { fetchConfig, fetchState } from './mapping.js';
const [config, state] = await Promise.all([
  fetchConfig(rpc, programId, auctionId),
  fetchState(rpc, programId, auctionId),
]);

// After — note: SDK signature is (auctionId, programId), not (rpc, programId, auctionId)
import { fetchAuctionConfig, fetchAuctionState } from '@fairdrop/sdk/chain';
const [config, state] = await Promise.all([
  fetchAuctionConfig(auctionId, programId),
  fetchAuctionState(auctionId, programId),
]);
```

#### Upsert `creatorReputation` on `close_auction`

`update_reputation` CPI fires in `close_auction` finalize only. `cancel_auction` does not call
it — creator voided before close, no reputation change.

```ts
// handlers/auction.ts — after the auctions upsert, when transition is close_auction
if (transitionName === 'close_auction' && config?.creator) {
  const rep = await fetchCreatorReputation(config.creator);
  if (rep) {
    await db.insert(creatorReputation).values({
      address:        config.creator,
      auctionsRun:    Number(rep.total_auctions),
      filledAuctions: Number(rep.filled_auctions),
      volume:         String(rep.total_volume),
      updatedAt:      ctx.timestamp,
    }).onConflictDoUpdate({
      target: creatorReputation.address,
      set: {
        auctionsRun:    Number(rep.total_auctions),
        filledAuctions: Number(rep.filled_auctions),
        volume:         String(rep.total_volume),
        updatedAt:      ctx.timestamp,
      },
    });
  }
}
```

### API changes

#### `GET /creators/:address`

Reads from `creatorReputation` DB table — no live RPC call. Returns stats only; auction list
is fetched separately via the existing `GET /auctions?creator=:address`.

```jsonc
{
  "address": "aleo1...",
  "auctionsRun": 12,
  "filledAuctions": 11,
  "volumeMicrocredits": "48000000000",
  "fillRate": 0.917,
  "tier": "gold"
}
```

Response type in `@fairdrop/types/api`:

```ts
export interface CreatorReputationResponse {
  address:            string;
  auctionsRun:        number;
  filledAuctions:     number;
  volumeMicrocredits: string;
  fillRate:           number;   // 0–1
  tier:               CreatorTier;
}
```

#### `GET /creators` — top creators

Returns creators ordered by `filledAuctions DESC`, optionally limited (e.g. top 20).

#### Auction list and single auction fetch join `creatorReputation`

Auction list query LEFT JOINs `creatorReputation` so `AuctionListItem` carries `creatorTier`
— no per-card SWR call on list views.

Single auction fetch (`GET /auctions/:id`) also joins `creatorReputation` — `AuctionView`
carries the full `creator` stats object.

```ts
// AuctionListItem
creatorTier: CreatorTier;

// AuctionView
creatorReputation: CreatorReputationResponse | null;
```

#### Shared tier util

```ts
// @fairdrop/types/domain  (or packages/sdk/src/utils/reputation.ts)
export type CreatorTier = 'none' | 'bronze' | 'silver' | 'gold';

export function computeTier(auctionsRun: number, filled: number): CreatorTier {
  const fillRate = auctionsRun > 0 ? filled / auctionsRun : 0;
  if (filled >= 10 && fillRate >= 0.90) return 'gold';
  if (filled >= 3  && fillRate >= 0.70) return 'silver';
  if (filled >= 1)                      return 'bronze';
  return 'none';
}
```

Single source of truth — used by the API mapper and the frontend hook.

### Frontend changes

#### `useCreatorReputation` hook

```ts
function useCreatorReputation(address: string): {
  data:      CreatorReputationResponse | null;
  isLoading: boolean;
}
```

SWR with 60-second revalidation. Tier is read from `data.tier` — not recomputed client-side.

#### `CreatorBadge` component

Reusable badge: tier icon + fill rate. Three sizes:
- `sm` — icon only, tooltip on hover (auction cards — reads from `AuctionListItem.creatorTier`, no hook)
- `md` — icon + fill rate (inline on detail pages)
- `lg` — full card with all stats (creator profile page)

#### Auction card

`<CreatorBadge tier={auction.creatorTier} size="sm" />` — data from list response, no extra fetch.

#### Auction detail page

Full reputation panel via `auction.creatorReputation` (already in `AuctionView`):
- Tier badge
- "12 auctions · 11 filled · 91.7% fill rate"
- "48 000 ALEO raised total"
- Link to creator page

#### Creator page (`/creators/:address`)

Shows:
- Address + `CreatorBadge` size `lg`
- Stats summary row
- Full auction history grid via `GET /auctions?creator=:address` + existing `AuctionCard`

#### Top creators page (`/creators`)

Leaderboard of top creators by filled auctions. Each row: address, tier badge, stats.
Fetches from `GET /creators`.

### Tier thresholds

| Tier | Condition |
|---|---|
| None | `auctions_run = 0` |
| Bronze | `filled >= 1` |
| Silver | `filled >= 3` AND `fill_rate >= 0.70` |
| Gold | `filled >= 10` AND `fill_rate >= 0.90` |

Code constants — adjustable without any contract or DB change.

### Phase 1 steps

1. Add `creatorReputation` table to DB schema.
2. Add `CreatorTier` type + `computeTier` util to `@fairdrop/types/domain`.
3. Add `CreatorReputationResponse` to `@fairdrop/types/api`.
4. Migrate indexer: `initAleoClient` at startup; delete `handlers/mapping.ts`; update imports.
5. Add `creatorReputation` upsert in `handlers/auction.ts` on `close_auction`.
6. Add `GET /creators/:address` and `GET /creators` routes to API.
7. Join `creatorReputation` into auction list query → `creatorTier` on `AuctionListItem`.
8. Join `creatorReputation` into single auction fetch → `creatorReputation` on `AuctionView`.
9. Build `useCreatorReputation` hook.
10. Build `CreatorBadge` component (`sm`/`md`/`lg`).
11. Add badge to `AuctionCard` (no extra fetch).
12. Add reputation panel to auction detail page.
13. Build top creators page (`/creators`).
14. Build single creator page (`/creators/:address`).
15. Register both routes in app router.
16. Run type-check.

---

## Phase 2 — Editable creator profiles (deferred)

Defer until real usage shows creators want a persistent identity separate from their auctions.
Each auction already carries name, description, logo, Twitter, Discord via IPFS metadata —
a separate profile adds no verifiable signal at current scale and would largely duplicate it.

### When to revisit

- Multiple creators ask for a profile distinct from individual auctions
- Platform has enough creators that discoverability becomes a real problem
- Community/DAO governance use case emerges where creator identity matters beyond auction history

### Planned scope (when the time comes)

#### New table: `creatorProfiles`

```ts
export const creatorProfiles = pgTable('creator_profiles', {
  address:     text('address').primaryKey(),
  name:        text('name'),
  bio:         text('bio'),
  avatarIpfs:  text('avatar_ipfs'),   // IPFS CID
  website:     text('website'),
  twitter:     text('twitter'),
  discord:     text('discord'),
  updatedAt:   timestamp('updated_at').notNull(),
});
```

#### API

- `GET /creators/:address` — extend response with `profile` sub-object
- `PUT /creators/:address/profile` — wallet-signed update; uploads avatar to IPFS via existing
  upload route, stores CID + metadata in `creatorProfiles`

#### Frontend

- Profile edit form on creator page (connected wallet = address owner only)
- Avatar display in `CreatorBadge` size `lg` and creator page header
- Bio + social links on creator page

#### Notes

- Profile data is self-reported — not on-chain. Trust signal comes from reputation stats,
  not from the profile fields
- Wallet signature required to prove ownership before any profile write
- No moderation required at launch; add if abuse emerges
