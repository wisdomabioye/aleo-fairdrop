# Plan: Protocol Analytics Page

## Summary

A dedicated `/analytics` route giving a historical, read-only view of protocol health.
Complements `/dashboard` (which is live/operational) with trend data, outcome breakdowns,
and creator performance. No contract changes. No new DB columns. All data is derivable
from the existing `auctions` and `creatorReputation` tables.

---

## Constraints

- **No individual bid data**: bids are private. Only `bid_count` (aggregate per auction)
  is available. No bidder identity, no per-bid amounts, no bid timing.
- **Wall-clock timestamps are available**: the indexer writes the actual Aleo block header
  timestamp (`block.header.metadata.timestamp`) into `created_at` and `updated_at` on
  every auction upsert. For a cleared auction, `updated_at` is the wall-clock time of the
  closing block. Time-series queries use `DATE_TRUNC` on these columns directly — no
  block-bucket arithmetic needed.
- **No SSE / push**: analytics data is slow-moving. A single fetch on page load with
  manual refresh is sufficient. No polling needed.
- **Derived only**: every metric on this page must be computable from data the indexer
  already writes. No new indexer logic, no new DB columns, no RPC calls.

---

## Route

```
/analytics
```

Sits alongside `/dashboard`. Both are protocol-level passive reading pages — neither
requires a wallet connection.

| Route        | Job                                          |
|---|---|
| `/dashboard` | Live pulse — active auctions, top creators   |
| `/analytics` | Historical depth — trends, outcomes, types   |
| `/creators`  | Creator leaderboard and individual profiles  |

---

## Page Sections

### 1. KPI Strip

Six headline numbers across the top — same source as `GET /dashboard/stats` (already
implemented, no new API work):

| Metric | Query |
|---|---|
| Total auctions | `COUNT(*) FROM auctions` |
| Cleared | `COUNT(*) WHERE cleared = true` |
| Voided | `COUNT(*) WHERE status = 'voided'` |
| Success rate | `cleared / (cleared + ended + voided)` — JS |
| Total volume | `SUM(CAST(totalPayments AS NUMERIC)) WHERE cleared` |
| Avg fill rate | `AVG(filledAuctions::float / NULLIF(auctionsRun, 0)) FROM creatorReputation` |

All six are already in `DashboardStats`. The KPI strip re-uses `GET /dashboard/stats`
and renders them as a compact row — no duplication of data, just a different presentation.

---

### 2. Volume Over Time

**Most valuable chart.** Shows protocol growth.

- X-axis: calendar period (week or month), derived from `updated_at` of cleared auctions
- Y-axis: total volume cleared (microcredits → ALEO)
- Data: cleared auctions bucketed by `updated_at` (close time — when the volume was realised)

```sql
SELECT
  DATE_TRUNC(:bucket, updated_at)              AS period,
  SUM(CAST(total_payments AS NUMERIC))         AS volume,
  COUNT(*)                                     AS count
FROM auctions
WHERE cleared = true
GROUP BY period
ORDER BY period
```

The query param is `bucket=weekly|monthly`; the handler maps these to the Postgres
`DATE_TRUNC` values before use:
```ts
const truncUnit = bucket === 'weekly' ? 'week' : 'month';
```
Reject any other value with a 400. `DATE_TRUNC` returns `timestamptz` — cast to text in
SQL to guarantee a string from the Drizzle result; do not rely on the PG driver:
```sql
DATE_TRUNC(:bucket, updated_at)::text AS period
```

**No block-to-date conversion needed** — `updated_at` is a real wall-clock timestamp
written by the indexer from the Aleo block header. Chart axis labels need no "approximate"
qualifier.

**Needs new endpoint**: `GET /analytics/volume-by-period?bucket=weekly|monthly`

---

### 3. Auction Type Performance

Side-by-side comparison across all six types. Rendered as a table — not
a raw count chart (that already exists on `/dashboard`). Shows outcomes:

| Column | Notes |
|---|---|
| Count | All auctions of this type |
| Fill rate | Completed auctions only (see below). Raise/Quadratic use `payments/raiseTarget`; all others use `committed/supply` |
| Success rate | Float division — `cleared_count::float / NULLIF(total, 0)` |
| Avg volume | Cleared auctions only |
| Total volume | Cleared auctions only |
| Avg bid count | All auctions |

```sql
SELECT
  type,
  COUNT(*)                                                            AS total,
  SUM(cleared::int)                                                   AS cleared_count,
  -- Float division avoids integer truncation. FILTER excludes:
  --   • live auctions (fill not yet meaningful)
  --   • Sealed auctions in commit phase (total_committed = 0 until reveal)
  SUM(cleared::int)::float / NULLIF(COUNT(*), 0)                      AS success_rate,
  AVG(
    CASE
      WHEN type IN ('raise', 'quadratic')
        THEN CAST(total_payments AS NUMERIC) /
             NULLIF(CAST(raise_target AS NUMERIC), 0)
      ELSE
        CAST(total_committed AS NUMERIC) /
        NULLIF(CAST(supply AS NUMERIC), 0)
    END
  ) FILTER (WHERE cleared = true
               OR (ended_at_block IS NOT NULL AND voided = false))    AS avg_fill_pct,
  AVG(bid_count)                                                      AS avg_bids,
  SUM(CASE WHEN cleared THEN CAST(total_payments AS NUMERIC)
           ELSE 0 END)                                                AS total_volume
FROM auctions
GROUP BY type
```

**Needs new endpoint**: `GET /analytics/by-type`

---

### 4. Fill Distribution

**Two separate histograms** — fill semantics differ between auction types:

#### 4a. Supply-fill types (Dutch, Sealed, LBP, Ascending)

Fill% = `total_committed / supply`. Shows what fraction of token supply was committed.

```sql
SELECT
  FLOOR(
    LEAST(100,
      CAST(total_committed AS NUMERIC) /
      NULLIF(CAST(supply AS NUMERIC), 0) * 100
    ) / 10
  ) * 10  AS bucket_floor,
  COUNT(*) AS count
FROM auctions
WHERE type IN ('dutch', 'sealed', 'lbp', 'ascending')
  AND (cleared = true OR (ended_at_block IS NOT NULL AND voided = false))
GROUP BY bucket_floor
ORDER BY bucket_floor
```

#### 4b. Raise-fill types (Raise, Quadratic)

Fill% = `total_payments / raise_target`. Shows what fraction of the funding goal was met.

```sql
SELECT
  FLOOR(
    LEAST(100,
      CAST(total_payments AS NUMERIC) /
      NULLIF(CAST(raise_target AS NUMERIC), 0) * 100
    ) / 10
  ) * 10  AS bucket_floor,
  COUNT(*) AS count
FROM auctions
WHERE type IN ('raise', 'quadratic')
  AND (cleared = true OR (ended_at_block IS NOT NULL AND voided = false))
GROUP BY bucket_floor
ORDER BY bucket_floor
```

Buckets: `[0–10%, 10–20%, …, 90–100%]` — 10 bars per histogram.

> **Note**: `progress_pct` is NOT a stored column. Fill% must be computed inline as shown
> above. The mapper computes it at read time but never writes it back to the DB.

> **Note**: DB status only stores `'live'`, `'cleared'`, `'voided'`. The API-layer values
> `'ended'` and `'upcoming'` are never written to the DB. Do not filter on them in raw SQL.
> Use `cleared = true OR (ended_at_block IS NOT NULL AND voided = false)` to capture
> auctions that have run to completion (cleared or ended-not-voided).

**Needs new endpoint**: `GET /analytics/fill-distribution`

Response includes both histograms:
```ts
{
  supplyFill: FillBucket[];   // Dutch, Sealed, LBP, Ascending
  raiseFill:  FillBucket[];   // Raise, Quadratic
}
```

---

### 5. Gate Mode & Vesting Adoption

Two small proportion breakdowns:

**Gate mode split**
```sql
SELECT gate_mode, COUNT(*) AS count FROM auctions GROUP BY gate_mode
```

`gate_mode` is stored as `integer`: `0 = Open`, `1 = Merkle`, `2 = Credential`.
The API response maps these to string labels before returning:
```ts
{ "open": N, "merkle": N, "credential": N }
```
Renders as: Open N · Merkle N · Credential N with proportional arc or bar.

**Vesting adoption**
```sql
SELECT vest_enabled, COUNT(*) AS count FROM auctions GROUP BY vest_enabled
```
Simple: `X% of auctions use vesting`.

Can fold both into `GET /analytics/by-type` response or a separate
`GET /analytics/attributes` endpoint.

---

### 6. Creator Leaderboard

Deeper version of the `/creators` list. Sortable by:
- Volume raised (default)
- Fill rate
- Auctions run
- Bid count attracted (requires `SUM(bid_count)` join to `auctions` — see Gap 8 below)

Already served by `GET /creators/top` with `limit` param. Extend with a `sort`
query param: `sort=volume|fillRate|auctionsRun`.

**Needs query extension**: add `sort` param to `listTopCreators`.

> **Note**: `sort=volume` must use `ORDER BY CAST(volume AS NUMERIC) DESC` —
> `volume` is stored as `text` in `creatorReputation`. Plain `ORDER BY volume` is
> lexicographic and gives wrong results (e.g. `"9" > "10"`).

> **Note**: `sort=bidCount` is not in `creatorReputation` and requires a JOIN. The
> subquery column is `creator` (not `address`), so use an explicit `ON` — `USING` would
> fail:
> ```sql
> LEFT JOIN (
>   SELECT creator, SUM(bid_count) AS total_bids FROM auctions GROUP BY creator
> ) bids ON bids.creator = creatorReputation.address
> ORDER BY bids.total_bids DESC NULLS LAST
> ```
> Add this as an optional CTE in `listTopCreators` when `sort = 'bidCount'`.

> **Note**: `sort=fillRate` is a computed expression — `filledAuctions` and `auctionsRun`
> are separate columns in `creatorReputation`, not a stored ratio:
> ```sql
> ORDER BY filledAuctions::float / NULLIF(auctionsRun, 0) DESC NULLS LAST
> ```

---

## API Changes

### New endpoints

| Endpoint | Description |
|---|---|
| `GET /analytics/volume-by-period` | Volume + count bucketed by `updated_at`. Query params: `bucket=weekly\|monthly` |
| `GET /analytics/by-type` | Per-type counts, fill rate, success rate, volume, avg bids |
| `GET /analytics/fill-distribution` | Two histograms: supply-fill types + raise-fill types |
| `GET /analytics/attributes` | Gate mode split (integer → string mapping) + vesting adoption counts |

### Extended endpoints

| Endpoint | Change |
|---|---|
| `GET /creators/top` | Add `sort=volume\|fillRate\|auctionsRun\|bidCount` query param. Volume sort uses `CAST`. `bidCount` sort uses a CTE join. |

### New types (`@fairdrop/types/api`)

```ts
// analytics.ts

export interface VolumePeriod {
  period:  string;   // ISO date string (from DATE_TRUNC) — real wall-clock date, no approximation
  volume:  string;   // microcredits as string
  count:   number;
}

// Renamed from TypeStat / useTypeStats — "metrics" better distinguishes from aggregate DashboardStats
export interface AuctionTypeMetrics {
  type:          string;
  total:         number;
  clearedCount:  number;
  successRate:   number | null;   // null if total = 0
  avgFillPct:    number | null;   // null if no completed auctions for this type
  avgBids:       number;
  totalVolume:   string;          // microcredits as decimal string
}

export interface FillBucket {
  bucketFloor:  number;      // 0, 10, 20 … 90
  count:        number;
}

export interface FillDistribution {
  supplyFill: FillBucket[];  // Dutch, Sealed, LBP, Ascending — fill% = committed/supply
  raiseFill:  FillBucket[];  // Raise, Quadratic — fill% = payments/raiseTarget
}

export interface AttributeBreakdown {
  gateMode: Record<'open' | 'merkle' | 'credential', number>;  // mapped from integer (0/1/2)
  vesting:  { enabled: number; disabled: number };
}
```

> **Export reminder**: Add `export type { VolumePeriod, AuctionTypeMetrics, FillBucket, FillDistribution, AttributeBreakdown } from './analytics'`
> to `packages/types/src/api/index.ts`. Without this barrel export, frontend imports from
> `@fairdrop/types/api` will not resolve.

---

## Frontend Architecture

### Folder structure

```
features/analytics/
  pages/
    AnalyticsPage.tsx
  components/
    KpiStrip.tsx              — six headline numbers, reuses useDashboardStats
    VolumeChart.tsx           — line/area chart, recharts, uses currentColor pattern
    TypePerformanceTable.tsx  — sortable table (uses AuctionTypeMetrics)
    FillDistributionChart.tsx — two bar chart histograms (supply-fill + raise-fill)
    AttributeBreakdown.tsx    — gate mode + vesting, pure Tailwind proportion bars
    CreatorLeaderboard.tsx    — table with sort controls
  hooks/
    useAnalytics.ts           — four independent hooks fetching /analytics/* in parallel
```

### Route registration

```tsx
{ path: '/analytics', element: <AnalyticsPage /> }
```

Add nav link in sidebar alongside `/dashboard`.

### Data fetching

All four analytics endpoints are fetched in parallel on page load via four independent
React Query hooks (deduplication handled automatically). Each section renders its own
loading skeleton — the page does not block on all data before showing anything.

```ts
// useAnalytics.ts
export function useVolumeByPeriod(bucket: 'weekly' | 'monthly') { ... }
export function useAuctionTypeMetrics() { ... }   // renamed from useTypeStats
export function useFillDistribution() { ... }
export function useAttributeBreakdown() { ... }
```

`staleTime: 5 * 60_000` (5 minutes) — analytics data changes slowly.

### SDK / existing utility reuse

`estimateDate` and `estimateMinutes` already exist in `@fairdrop/sdk/format/blocks` and
are exported from `@fairdrop/sdk`. Do not write new block-to-time conversion logic.
These are available if any chart tooltip or label needs to display estimated future block
times (e.g. "ends in ~3 days").

`formatMicrocredits` from `@fairdrop/sdk/credits` is already used in `TopBar` for volume
display. Use it in `VolumeChart` tooltips, `TypePerformanceTable` volume columns, and
any other analytics surface that renders microcredit amounts — do not reformat inline.

### Shared type colors (DRY)

`AuctionTypeBreakdown.tsx` defines a `TYPE_COLOR` map of hex values (`'#3b82f6'` etc.)
for Recharts bars. `VolumeChart` and `FillDistributionChart` will need the same hex values.
**Do not duplicate** — extract to `features/auctions/constants/typeColors.ts` and import
from both the dashboard component and the analytics charts.

The registry (`features/auctions/registry.ts`) already exposes `AUCTION_REGISTRY[type].label`
for display names and `AUCTION_REGISTRY[type].hasRaiseTarget` to determine which fill
histogram a type belongs to. Use these instead of hardcoding type strings in analytics
components.

### Chart theming

All Recharts components follow the `currentColor` pattern established in
`PriceCurveChart` — wrapper div with `className="text-muted-foreground"`,
`fill="currentColor"` on SVG text elements. No `hsl(var(...))` in SVG attributes.

The `TypePerformanceTable` and `AttributeBreakdown` use pure Tailwind (no Recharts)
for the same reason the `AuctionTypeBreakdown` revamp used proportion bars.

---

## Scope

| Layer | Touch |
|---|---|
| Contract | None |
| DB schema | Index migration only — no new columns (see Gap #20) |
| Indexer | None |
| API | 4 new endpoints + `sort` param on `/creators/top` |
| Types | New `@fairdrop/types/api/analytics.ts` + barrel export in `index.ts` |
| Frontend | New `features/analytics/` folder + `features/auctions/constants/typeColors.ts` + route registration |

---

## Known Bugs & Gaps (resolved in this plan)

| # | Severity | Description |
|---|---|---|
| 1 | Bug | `progress_pct` is not a DB column — compute fill% inline (see Section 4 SQL) |
| 2 | Bug | `status NOT IN ('voided','live','upcoming')` references non-DB values — use `cleared = true OR (ended_at_block IS NOT NULL AND voided = false)` |
| 3 | Bug | Raise/Quadratic fill% is `payments/raise_target`, not `committed/supply` — two separate histograms (Section 4a/4b) |
| 4 | Bug | Plan previously said "1008 blocks ≈ 1 week" (wrong — 1008 × 10s = 2.8h). Moot: volume chart uses `DATE_TRUNC` on real timestamps, not block buckets |
| 5 | Gap | Volume bucketing used block-bucket math — unnecessary. `updated_at` is a real wall-clock timestamp from the Aleo block header; use `DATE_TRUNC` directly |
| 6 | Gap | `gate_mode` is stored as `integer` (0/1/2) — API must map to `"open"/"merkle"/"credential"` before returning |
| 7 | Gap | `sort=volume` on creators must use `CAST(volume AS NUMERIC)` — `volume` is `text`, plain ORDER BY is lexicographic |
| 8 | Gap | `sort=bidCount` on creators requires a CTE join to `auctions` — not in `creatorReputation` |
| 9 | Gap | `@fairdrop/types/api/analytics.ts` must be re-exported from `packages/types/src/api/index.ts` |
| 10 | Naming | `TypeStat` → `AuctionTypeMetrics`, `useTypeStats` → `useAuctionTypeMetrics` throughout |
| 11 | Bug | SQL operator precedence in Section 4a: `AND cleared = true OR (...)` evaluates as `(AND cleared) OR (...)` — added parentheses around the OR clause |
| 12 | Bug | `avgFillPct` in Section 3 used `committed/supply` for all types — Raise/Quadratic now use `payments/raiseTarget` via `CASE`; Sealed commit-phase auctions (where `total_committed = 0`) excluded via `FILTER (WHERE completed)` |
| 13 | Bug | `successRate` was integer division in Postgres (`SUM(cleared::int) / COUNT(*)`) — fixed with explicit `::float` cast |
| 14 | Gap | `bucket` query param (`weekly`/`monthly`) must be mapped to `DATE_TRUNC` values (`'week'`/`'month'`) server-side; any other value returns 400 |
| 15 | Gap | `TYPE_COLOR` hex map is private to `AuctionTypeBreakdown.tsx` — extract to `features/auctions/constants/typeColors.ts` so analytics charts can import it without duplication |
| 16 | Gap | Frontend must use `AUCTION_REGISTRY[type].hasRaiseTarget` to assign types to the correct fill histogram — do not hardcode `['raise','quadratic']` in analytics components |
| 17 | Bug | CTE join in `sort=bidCount` used `USING (address)` — subquery exposes `creator`, not `address`; fixed to `ON bids.creator = creatorReputation.address` |
| 18 | Bug | `sort=fillRate` on creators is a computed expression (`filledAuctions::float / NULLIF(auctionsRun, 0)`), not a stored column — plain `ORDER BY fillRate` would fail |
| 19 | Bug | `avgFillPct` and `successRate` in `AuctionTypeMetrics` typed as `number` — must be `number \| null` (NULL when no completed auctions exist for a type) |
| 20 | Gap | Analytics queries are full-table scans — no indexes on `cleared`, `updated_at`, `type`, `ended_at_block`. Add index migration: `(cleared, updated_at)`, `type`, `(ended_at_block, voided)` |
| 21 | Gap | `analyticsService` path not specified — must be `apps/frontend/src/services/analytics.service.ts` to match existing pattern |
| 22 | Gap | `DATE_TRUNC(...)` returns `timestamptz` — Drizzle may deserialize as `Date` object. Cast to text in SQL: `DATE_TRUNC(...)::text AS period` |
| 23 | Gap | `formatMicrocredits` from `@fairdrop/sdk/credits` must be used for all volume display in analytics components — do not re-implement inline |

---

## Open Decisions

1. **Volume chart granularity**: weekly vs monthly toggle, or fixed to weekly?
   Leaning toward a toggle so the chart is useful both early (few auctions, monthly
   better) and at scale (many auctions, weekly better).

2. **TypePerformanceTable vs chart**: a table communicates multi-column data
   (fill rate + success rate + volume + bids) more clearly than a grouped bar chart
   with 6 groups × 4 bars. Default to table; add a chart toggle if requested.

3. **Page title and nav placement**: `/analytics` should appear in the sidebar under
   a "Protocol" section alongside `/dashboard`. Label: "Analytics".

---

## Steps

1. Add DB index migration: `(cleared, updated_at)`, `type`, `(ended_at_block, voided)` on `auctions`.
2. Add `@fairdrop/types/api/analytics.ts` with the four response types (`VolumePeriod`, `AuctionTypeMetrics`, `FillBucket`, `FillDistribution`, `AttributeBreakdown`).
3. Export new types from `packages/types/src/api/index.ts` barrel.
4. Add `services/api/src/queries/analytics.ts` with the four DB queries (use `DATE_TRUNC(...)::text` for volume period, inline fill% computation, `gate_mode` integer mapping, `CAST` for text numeric sorts, explicit `ON` for CTE join).
5. Add `services/api/src/routes/analytics.ts` with four GET handlers (`bucket` param validated and mapped to `'week'`/`'month'` before use).
6. Register `analyticsRouter` in `services/api/src/app.ts`.
7. Extend `listTopCreators` with `sort` param (`volume` → `CAST`, `fillRate` → computed expression, `bidCount` → CTE with explicit `ON`).
8. Extract `TYPE_COLOR` hex map from `AuctionTypeBreakdown.tsx` to `features/auctions/constants/typeColors.ts`; update `AuctionTypeBreakdown` import.
9. Add `apps/frontend/src/services/analytics.service.ts` (matches existing `dashboard.service.ts` pattern).
10. Build the four hooks in `features/analytics/hooks/useAnalytics.ts`.
11. Build `KpiStrip` (reuse `useDashboardStats`).
12. Build `VolumeChart` with weekly/monthly toggle (reuse `typeColors`, `formatMicrocredits`, `currentColor` pattern).
13. Build `TypePerformanceTable` (uses `AuctionTypeMetrics`, handles `null` for `avgFillPct`/`successRate`).
14. Build `FillDistributionChart` (two histograms; use `AUCTION_REGISTRY[type].hasRaiseTarget` to label each).
15. Build `AttributeBreakdown` (pure Tailwind proportion bars).
16. Build `CreatorLeaderboard` with sort controls.
17. Assemble `AnalyticsPage`.
18. Register `/analytics` route and add sidebar nav link.
19. Run type-check.
