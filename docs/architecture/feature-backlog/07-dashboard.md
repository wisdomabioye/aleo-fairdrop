# Plan: Real-Time Auction Dashboard

## Summary

Richer analytics and live visualisations on top of existing indexer data. Adds: live bid curve
charts, price discovery timeline, participant count, sealed-auction "what-if" simulator, and
per-auction stat cards. No contract changes — all data is already available from the indexer.

---

## Scope

| Layer | Touch |
|---|---|
| Contract | None |
| API | New `/auctions/:id/bids/history` endpoint; WebSocket or SSE for live updates |
| Frontend | Chart components on `AuctionDetailPage`; new Dashboard overview page |

---

## API changes

### New endpoint: `GET /auctions/:id/bids/history`

```jsonc
[
  {
    "block": 1234560,
    "timestamp": "2026-04-06T10:00:00Z",
    "cumulativePayments": "15000000",  // microcredits
    "cumulativeQuantity": "5000",
    "bidCount": 8,
    "currentPrice": "3000"             // Dutch/LBP only; null for others
  },
  ...
]
```

Data is bucketed by block (or every N blocks for long auctions). Indexed by `auction_id` on the
bids table — no new table needed.

### Live updates

Use Server-Sent Events (SSE) at `GET /auctions/:id/events`:
- Emit `bid` event on every new confirmed bid.
- Emit `closed` event on `close_auction`.
- Frontend subscribes via `EventSource` inside a `useAuctionEvents(auctionId)` hook.

SSE is stateless and works through load balancers without sticky sessions. No WebSocket
complexity.

### Updated auction list endpoint

Add aggregate stats to `GET /auctions`:
- `bidCount`, `uniqueBidderCount`, `fillPercent`, `timeRemainingBlocks`.

---

## Frontend changes

### `AuctionDetailPage` additions

#### 1. Participation curve chart

Line chart: x = block, y = cumulative payments. Shows momentum at a glance.
- Dutch / LBP: overlay current price as a second Y-axis.
- Ascending: show highest bid over time.
- All types: dashed vertical line at current block.

Library: **Recharts** (already used in many React projects; small bundle, composable).

#### 2. Live stat cards

Row of four cards updated in real time via SSE:
```
Total raised    |  Participants  |  Fill %       |  Time left
12 450 ALEO     |  83 bidders    |  62.3%        |  ~14h 22min
```

"Participants" = unique bidder count from bid history. Requires indexer to track unique addresses.

#### 3. Price curve (Dutch / LBP / Ascending)

- Dutch: plot `start_price - decay * floor((block - start_block) / decay_blocks)` at each block.
  Show current price prominently.
- LBP: plot `floor_price + (start_price - floor_price) × (remaining/supply) × (time_remaining/duration)`.
- Ascending: scatter of each bid at its block/price.

All formulas are deterministic from `AuctionConfig` — no extra RPC calls needed.

#### 4. Sealed-auction "what-if" simulator

For sealed auctions only. Input: "If I commit X credits, what's my estimated allocation?"
- Reads current `total_payments` from state.
- Computes: `allocation = supply × X / (total_payments + X)`.
- Shows estimated allocation range: conservative (assume 50% more bids) and optimistic (no more bids).
- Disclaims: "Sealed auction — exact result depends on all final bids."

#### 5. Quadratic simulator

Same concept for quadratic:
```
My weight = sqrt(X)
Current total weight = approx Σsqrt(existing payments)
Estimated allocation = supply × sqrt(X) / (total_weight + sqrt(X))
```

### New "Protocol Dashboard" page (`/dashboard`)

Overview of the whole protocol — for creators scouting trends and bidders comparing auctions:

- Total volume (all time / 30d / 7d).
- Active auctions count, average fill rate, average raise size.
- Top creators by volume (links to creator profiles).
- Recent auction cards grid.
- Chart: protocol-wide volume over time.

### `useAuctionEvents` hook

```ts
function useAuctionEvents(auctionId: string): {
  latestBid: BidEvent | null;
  isClosed: boolean;
}
```

Opens an `EventSource` connection, auto-closes on unmount.

---

## Open decisions

1. **SSE vs polling**: SSE requires a persistent HTTP connection per viewer. For low-traffic
   deployments, polling every 4–8s (one block) is simpler and stateless. Implement polling first;
   upgrade to SSE if needed.
2. **Recharts vs other libs**: Recharts is zero-config, small, and composable with React. Alternatives
   are Chart.js (larger) or D3 (flexible but verbose). Recharts is the right default.
3. **Unique bidder count**: currently bids store bidder address in plaintext for public bids.
   Private bids do not. Show "≥ N unique bidders" (from public bids only) with a note that
   private bids are not counted.
4. **What-if simulator accuracy**: the simulator is a heuristic, not a guarantee. Add a clear
   disclaimer. Do not label it "estimated allocation" without "approximate".

---

## Steps

1. Add `GET /auctions/:id/bids/history` endpoint to API.
2. Add `uniqueBidderCount` and `fillPercent` to auction list endpoint.
3. Add SSE endpoint (or polling fallback) for live bid events.
4. Install Recharts (`pnpm add recharts`).
5. Build `useAuctionEvents` hook.
6. Build participation curve chart component.
7. Build live stat cards row.
8. Build price curve component (Dutch, LBP, Ascending variants).
9. Build sealed/quadratic what-if simulator.
10. Wire all components into `AuctionDetailPage`.
11. Build protocol-level `Dashboard` page at `/dashboard`.
12. Add route to app router.
13. Run type-check.
