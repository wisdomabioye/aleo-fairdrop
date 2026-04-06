# Plan: Creator Reputation Display

## Summary

Surface the on-chain `CreatorStats` from `fairdrop_proof_v2.aleo` in the frontend. Show a trust
badge on auction cards and a full reputation panel on creator profiles. No new contract data —
`reputation[address]` is already populated by `update_reputation` CPI calls at `close_auction`.

---

## Scope

| Layer | Touch |
|---|---|
| Contract | None — data already on-chain |
| SDK | `@fairdrop/sdk/chain` — `fetchCreatorReputation` already available (or trivial addition) |
| Indexer / API | New endpoint: `GET /creators/:address/reputation` |
| Frontend | Trust badge on auction cards; creator profile page; auction detail page |

---

## On-chain data available

`fairdrop_proof_v2.aleo::reputation[address]` returns:

```ts
interface CreatorStats {
  auctions_run: bigint   // total auctions created and closed (filled or not)
  filled:       bigint   // auctions where total_committed >= supply
  volume:       bigint   // cumulative total_payments in microcredits
}
```

Derived metrics (computed client-side):
- **Fill rate** = `filled / auctions_run` (0–100%)
- **Tier**: Bronze (≥1 filled), Silver (≥3 filled, fill_rate ≥ 70%), Gold (≥10 filled, fill_rate ≥ 90%)

---

## API changes

### New endpoint: `GET /creators/:address`

```jsonc
{
  "address": "aleo1...",
  "stats": {
    "auctionsRun": 12,
    "filled": 11,
    "volumeMicrocredits": "48000000000",
    "fillRate": 0.917
  },
  "tier": "gold",    // "none" | "bronze" | "silver" | "gold"
  "auctions": [...]  // recent auctions by this creator (existing auction list)
}
```

The API reads `fairdrop_proof_v2.aleo::reputation[address]` via `AleoNetworkClient` and derives
tier + fill rate server-side (avoids redundant RPC calls from many browser clients).

### Cache

Cache reputation responses for 60 seconds — reputation only changes at `close_auction` events,
which are infrequent.

---

## Frontend changes

### `CreatorBadge` component

Small reusable badge: tier icon + fill rate. Used inline wherever a creator address appears.

```tsx
<CreatorBadge address={auction.creator} />
// Renders: 🥇 Gold · 91.7% fill rate
```

Sizes: `sm` (icon only, tooltip on hover), `md` (icon + rate), `lg` (full card).

### Auction card

Add `<CreatorBadge address={auction.creator} size="sm" />` below the creator address.
Loads reputation via `useSWR('/creators/:address')` — non-blocking (shows placeholder if loading).

### Auction detail page

Full reputation panel in sidebar:
- Tier badge (icon + label).
- Stats: "12 auctions · 11 filled · 91.7% fill rate".
- Volume: "48 000 ALEO raised total".
- "View creator profile" link.

### Creator profile page (`/creators/:address`)

New route. Shows:
- Address + tier badge (large).
- Stats summary cards.
- Full auction history grid (existing AuctionCard reuse).

### `useCreatorReputation` hook

```ts
function useCreatorReputation(address: string): {
  stats: CreatorStats | null;
  tier: 'none' | 'bronze' | 'silver' | 'gold';
  fillRate: number;
  isLoading: boolean;
}
```

Uses SWR with 60-second revalidation.

---

## Tier thresholds

| Tier | Condition |
|---|---|
| None | `auctions_run = 0` |
| Bronze | `filled >= 1` |
| Silver | `filled >= 3` AND `fill_rate >= 0.70` |
| Gold | `filled >= 10` AND `fill_rate >= 0.90` |

These are frontend constants — easily adjusted without a contract change.

---

## Open decisions

1. **Tier thresholds**: values above are starting points. Calibrate after observing real usage.
   Since they are frontend-only, thresholds can be updated without any deployment.
2. **Volume display**: raw microcredits → display in ALEO. Use existing `formatAmount` util.
3. **Empty state**: new creators (0 auctions) show "New creator — no history yet" rather than
   a zero-filled card. Avoids alarming bidders about a legitimate new creator.
4. **Indexer vs direct RPC**: for the API route, a direct `getAleoClient().getMappingValue()`
   call is sufficient at low scale. If load increases, cache in DB alongside auction rows.

---

## Steps

1. Add `GET /creators/:address` route to API service.
2. Add `fetchCreatorReputation` to `@fairdrop/sdk/chain` if not already present.
3. Build `CreatorBadge` component with `sm`/`md`/`lg` sizes.
4. Add badge to auction cards.
5. Add full reputation panel to auction detail page.
6. Build `useCreatorReputation` hook.
7. Build creator profile page at `/creators/:address` route.
8. Add route to app router.
9. Run type-check.
