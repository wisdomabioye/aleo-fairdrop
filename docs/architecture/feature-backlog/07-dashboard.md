# Plan: Real-Time Auction Dashboard

## Summary

Richer analytics and live visualisations on top of existing indexer data. Adds: price curve
charts, per-auction stat cards, what-if bid simulators, a protocol-wide dashboard page, and
topbar protocol stats. No contract changes. No bid history — private bids mean amounts and
identities are not available; bid *count* is derivable by counting `place_bid_*` transitions.

---

## Constraints

- **No bid history**: bids may be private. The indexer can count bid events (transition count)
  but not amounts or identities for individual bids.
- **No on-chain `Stats` fetch**: each auction program has `Stats { total_auctions, total_bids,
  total_payment_collected }` at `stats[0field]`, updated per bid. All three fields are fully
  derivable from the DB — the indexer already stores and updates `AuctionState.total_payments`
  per auction on every bid, so `SUM(total_payments)` across auctions equals the on-chain total.
  No extra RPC calls needed.
- **No SSE**: polling every 15–30 s (one or two blocks) covers the use case.
- **`sqrtWeight`**: for Quadratic auctions, `sqrt_weights[auction_id]` is already fetchable via
  the SDK. Add it to `AuctionView` as a one-time detail endpoint read — null for all other types.

---

## Surfaces and Placement

Three distinct surfaces, each with a clear and narrow job. No cross-contamination.

### 1. Topbar — protocol-wide pulse

Three numbers, always visible, no interaction:
- `total_auctions` — all auctions ever indexed
- `total_bids` — `SUM(bid_count) FROM auctions`
- `total_payment_collected` — `SUM(total_payments) WHERE cleared = true` (microcredits)

Sourced from `GET /dashboard/stats`. Renders in the existing app topbar.

### 2. `/dashboard` — protocol overview page

Passive reading. No auction-specific detail:
- Stat cards: total auctions, active count, cleared count, total bids, total volume, avg fill rate
- Auctions-by-type breakdown (bar or donut chart — counts from DB)
- Top creators leaderboard → links to `/creators` (already built)
- Recent auctions grid → existing `AuctionCard` components

### 3. Auction detail page — three progressive disclosure zones

**Zone A — inline indicator** (always visible, no click required):
- Dutch only: "Next price drop in N blocks" — live action info a bidder needs without clicking

**Zone B — "Analytics" tab** (one click, opt-in):
- Price curve chart for Dutch / Ascending / LBP
- Vesting schedule chart (any type with `vestEnabled = true`)
- Empty state for types with no chart

**Zone C — "Estimate" collapsible panel** (adjacent to bid form, collapsed by default):
- Simulator for the current auction type
- Only rendered when auction status is `Active`
- Collapsed by default, labeled "Estimate my allocation →"

---

## Scope

| Layer | Touch |
|---|---|
| Contract | None |
| DB schema | `bid_count integer` column on `auctions` table |
| Indexer | Increment `bid_count` on each `place_bid_*` / `commit_bid_*` transition |
| SDK | Extract price formulas into `@fairdrop/sdk/price`; `sqrtWeight` already fetchable |
| API | `GET /dashboard/stats`; add `bidCount` + `sqrtWeight` to `AuctionView` |
| Frontend | Registry extension; chart, simulator, indicator components; Dashboard page |

---

## DB Schema Change

```ts
// auctions table — one new column
bidCount: integer('bid_count').notNull().default(0),
```

Incremented by the indexer on every `place_bid_*` and `commit_bid_*` transition for that
auction. Private and public bids are counted equally — the amount is unknown but the event is.

---

## API Changes

### `GET /dashboard/stats`

Single aggregation query — no RPC calls.

```jsonc
{
  "totalAuctions":   142,
  "activeAuctions":  8,
  "clearedAuctions": 97,
  "totalBids":       4821,
  "totalVolume":     "2400000000000",  // SUM(total_payments) WHERE cleared, microcredits
  "avgFillRate":     0.84              // from creator_reputation table
}
```

| Field | Query |
|---|---|
| `totalAuctions` | `COUNT(*) FROM auctions` |
| `activeAuctions` | derived status filter |
| `clearedAuctions` | `COUNT(*) WHERE cleared = true` |
| `totalBids` | `SUM(bid_count) FROM auctions` |
| `totalVolume` | `SUM(total_payments) WHERE cleared = true` |
| `avgFillRate` | `AVG(filled_auctions::float / NULLIF(auctions_run, 0)) FROM creator_reputation` |

### `AuctionView` additions

```ts
bidCount:   number;        // from bid_count column
sqrtWeight: string | null; // sqrt_weights[auction_id] — Quadratic only, null for all others
```

`sqrtWeight` is fetched via the existing SDK in the detail endpoint alongside the auction row.
One extra mapping read, Quadratic-only, at detail page load.

---

## SDK Change

Extract `computeDutchPriceAt` and `computeAscendingPriceAt` from
`services/api/src/mappers/auction.ts` into `@fairdrop/sdk/price` so the frontend can call them
directly over a block range without an API call. LBP formula added here too.

```ts
// @fairdrop/sdk/price
export function computeDutchPriceAt(params: DutchParams, block: number): bigint
export function computeAscendingPriceAt(params: AscendingParams, block: number): bigint
export function computeLbpPriceAt(params: LbpParams, block: number, duration: number): bigint
// duration = end_block - start_block; assumes remaining = supply (theoretical)
```

---

## Frontend Architecture

### Folder structure

```
features/auctions/
  charts/
    PriceCurveChart.tsx         — Dutch / Ascending / LBP via type switch; uses @fairdrop/sdk/price
    VestingScheduleChart.tsx    — any auction with vestEnabled = true
  simulators/
    AuctionSimulator.tsx        — collapsible shell ("Estimate my allocation →")
    DutchSimulator.tsx
    SealedSimulator.tsx
    RaiseSimulator.tsx
    QuadraticSimulator.tsx
    LbpSimulator.tsx
  indicators/
    NextPriceDropChip.tsx       — Dutch only; blocks to next step + next price

features/dashboard/
  pages/
    DashboardPage.tsx
  components/
    ProtocolStatCards.tsx
    AuctionTypeBreakdown.tsx    — bar/donut chart of auction counts by type
```

### Registry extension

The existing `registry.ts` slot interface gains three optional component fields:

```ts
interface RegistrySlot {
  // existing fields unchanged...

  /** Chart rendered on the Analytics tab. null = no chart for this type. */
  chartComponent:      ComponentType<{ auction: AuctionView }> | null;
  /** Simulator rendered inside the collapsible Estimate panel. null = no simulator. */
  simulatorComponent:  ComponentType<{ auction: AuctionView }> | null;
  /** Inline indicator on the main view. null for most types. */
  indicatorComponent:  ComponentType<{ auction: AuctionView }> | null;
}
```

Registry entries:

| Type | `chartComponent` | `simulatorComponent` | `indicatorComponent` |
|---|---|---|---|
| Dutch | `PriceCurveChart` | `DutchSimulator` | `NextPriceDropChip` |
| Ascending | `PriceCurveChart` | null | null |
| LBP | `PriceCurveChart` | `LbpSimulator` | null |
| Sealed | null | `SealedSimulator` | null |
| Raise | null | `RaiseSimulator` | null |
| Quadratic | null | `QuadraticSimulator` | null |

Vesting is orthogonal to type — `VestingScheduleChart` renders on the Earn/Claim tab whenever
`auction.vestEnabled = true`, independent of the registry.

### Wiring — no conditionals in page components

```tsx
// AnalyticsTab.tsx — zero type-specific logic
const slot = getRegistrySlot(auction.type);
return slot.chartComponent
  ? <slot.chartComponent auction={auction} />
  : <p className="text-sm text-muted-foreground">No chart available for this auction type.</p>;

// AuctionSimulator.tsx — collapsible shell
const slot = getRegistrySlot(auction.type);
if (!slot.simulatorComponent || auction.status !== AuctionStatus.Active) return null;
return (
  <Collapsible>
    <CollapsibleTrigger>Estimate my allocation →</CollapsibleTrigger>
    <CollapsibleContent>
      <slot.simulatorComponent auction={auction} />
    </CollapsibleContent>
  </Collapsible>
);

// AuctionHeader or main view — inline indicator
const slot = getRegistrySlot(auction.type);
{slot.indicatorComponent && <slot.indicatorComponent auction={auction} />}
```

Adding a new auction type = one registry entry. Nothing in the page components changes.

---

## Charts

### PriceCurveChart

Renders via Recharts. Type-switches internally on `auction.params.type`:

**Dutch** — `computeDutchPriceAt` over `[start_block, end_block]`, vertical line at
`currentBlock`, horizontal dashed line at `floor_price`. Shows when the price hits each step.

**Ascending** — `computeAscendingPriceAt` over `[start_block, effectiveEndBlock ?? end_block]`,
vertical line at `currentBlock`, horizontal dashed line at `ceiling_price`.

**LBP** — `computeLbpPriceAt` assuming `remaining = supply` (no bids placed). Clearly labeled:
*"Theoretical ceiling — actual price is lower as supply fills."* Hidden when `progressPct > 20%`
(too divorced from reality to be useful).

### VestingScheduleChart

Input: user's allocation (typed or from a bid record). Output: step chart:
- 0 tokens from `endedAtBlock` to `endedAtBlock + vestCliffBlocks`
- Linear unlock from cliff to `endedAtBlock + vestEndBlocks`

Rendered on Earn/Claim tab when `vestEnabled = true`.

---

## Simulators

### DutchSimulator

Two modes:

**Budget → tokens**: "If I bid now with B credits, I get `floor(B / currentPrice)` tokens."

**Timing calculator**: "To get Q tokens within budget B, bid at block ~N."
```
max_price = B / Q
bid_block = start_block + floor((start_price - max_price) / decay_amount) × decay_blocks
```
Show countdown to that block from `estimatedStart`.

### SealedSimulator

Clearing price is deterministic — it is the Dutch price at `commit_end_block`:
```
clearing_price = computeDutchPriceAt(params, commit_end_block)
estimated_tokens = floor(X / clearing_price)  // capped at max_bid_amount
```
This is not a heuristic — the clearing price is locked to a specific block. Only shown during
the commit phase (`currentBlock < commit_end_block`). After that, the price is set and the
simulator is irrelevant.

### RaiseSimulator

Pro-rata with two scenarios:
```
optimistic    = supply × X / (totalPayments + X)          // no more bids
conservative  = supply × X / (totalPayments × 1.5 + X)   // 50% more bids come in
```
Uses `auction.totalPayments` and `auction.supply` from `AuctionView`.

### QuadraticSimulator

```
my_weight     = sqrt(X)
my_tokens     = supply × sqrt(X) / (sqrtWeight + sqrt(X))
```
Uses `auction.sqrtWeight` (fetched once at detail page load). Two scenarios same as Raise.
Disclaimer: *"Approximate — final weight depends on all bids placed before close."*

### LbpSimulator

```
tokens_now = floor(X / currentPrice)
```
Simple, honest. Note: *"Price decreases as supply fills — actual tokens may be higher."*

---

## NextPriceDropChip (Dutch inline indicator)

```
blocks_to_next_drop = decay_blocks - ((currentBlock - start_block) % decay_blocks)
next_price          = currentPrice - decay_amount   // if above floor_price
```

Renders as a small chip on the main auction view: *"Price drops to X.XX ALEO in ~N blocks."*
Hidden when `currentPrice === floor_price` (already at floor). Hidden when auction is not Active.

---

## Open Decisions

1. **LBP curve threshold**: hide when `progressPct > 20%` — or always show with the label?
   Leaning toward always-show with label since even a theoretical ceiling is useful context.
2. **`progressPct` rename**: `AuctionView.progressPct` and `fillPercent` are the same thing.
   Keep `progressPct` (avoid breaking consumers) and just use it directly in stat cards.
3. **Recharts bundle**: add `recharts` to `apps/frontend` only. Charts are lazy-loaded on the
   Analytics tab — no impact on initial page load.

---

## Steps

1. Add `bid_count` column to `auctions` DB schema; generate migration.
2. Indexer: increment `bid_count` on each `place_bid_*` / `commit_bid_*` transition.
3. Extract price formulas into `@fairdrop/sdk/price`.
4. Add `bidCount` and `sqrtWeight` to `AuctionView` type + API mapper + detail route.
5. Add `GET /dashboard/stats` aggregation endpoint.
6. Extend `RegistrySlot` with `chartComponent`, `simulatorComponent`, `indicatorComponent`.
7. `pnpm add recharts` in `apps/frontend`.
8. Build `PriceCurveChart` (Dutch / Ascending / LBP variants).
9. Build `VestingScheduleChart`.
10. Build `NextPriceDropChip`.
11. Build `DutchSimulator`, `SealedSimulator`, `RaiseSimulator`, `QuadraticSimulator`, `LbpSimulator`.
12. Build `AuctionSimulator` collapsible shell.
13. Wire registry entries for all six types.
14. Add "Analytics" tab to `AuctionDetailPage`; wire `AnalyticsTab` + `AuctionSimulator`.
15. Build `ProtocolStatCards` + `AuctionTypeBreakdown` components.
16. Build `DashboardPage` at `/dashboard`.
17. Wire topbar protocol stats from `GET /dashboard/stats`.
18. Register `/dashboard` route in app router.
19. Run type-check.
