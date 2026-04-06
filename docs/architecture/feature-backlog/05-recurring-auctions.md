# Plan: Recurring / Scheduled Auctions

## Summary

A frontend scheduling tool that lets creators define an emission schedule — e.g. "weekly Dutch
auction, 1 000 tokens per round" — and automatically creates the next auction when the prior one
closes. All scheduling state lives off-chain in the Fairdrop API database; no contract changes.

---

## Scope

| Layer | Touch |
|---|---|
| Contract | None |
| API | New `schedules` table + CRUD endpoints + cron trigger |
| SDK | `buildCreateAuction` already exists — scheduler calls it via existing API |
| Frontend | New "Scheduled Emissions" section in creator dashboard |

---

## Data model

### `schedules` table (new)

```sql
schedules
  id              uuid        PRIMARY KEY
  creator         text        NOT NULL       -- Aleo address
  label           text        NOT NULL
  template        jsonb       NOT NULL       -- WizardForm snapshot (auction type + all params)
  interval_blocks integer     NOT NULL       -- blocks between rounds (e.g. 302400 ≈ 1 week)
  supply_per_round bigint     NOT NULL       -- raw token units per round
  rounds_remaining integer    NOT NULL       -- -1 = infinite
  current_round   integer     NOT NULL DEFAULT 0
  active_auction_id text                    -- field hex of the live round auction
  next_start_block integer                  -- when to create the next auction
  paused          boolean     NOT NULL DEFAULT false
  created_at      timestamptz NOT NULL DEFAULT now()
  updated_at      timestamptz NOT NULL DEFAULT now()
```

### Linkage to existing auctions

`active_auction_id` tracks the in-flight auction. When it closes, the cron job reads
`close_auction`'s finalized state → computes `next_start_block` → calls `create_auction` via SDK
→ updates `active_auction_id` and `current_round`.

---

## API changes

### New routes

| Method | Path | Description |
|---|---|---|
| `POST` | `/schedules` | Create a new schedule |
| `GET` | `/schedules?creator=:addr` | List schedules for an address |
| `GET` | `/schedules/:id` | Single schedule detail |
| `PATCH` | `/schedules/:id` | Update (pause, change interval, etc.) |
| `DELETE` | `/schedules/:id` | Delete (only if no active auction) |

### Cron job (new)

A recurring job (every ~30s or every N blocks via block-poll):
1. Query schedules where `paused = false` and `rounds_remaining != 0`.
2. For each: check if `active_auction_id` has closed on-chain (read `AuctionState.cleared`).
3. If closed: compute `next_start_block = ended_at_block + interval_blocks`.
4. Build `CreateAuctionInput` from `template`, overriding `startBlock` and `supply`.
5. Submit `create_auction` transaction via a funded service wallet.
6. Update `active_auction_id`, `current_round`, `rounds_remaining -= 1`.

> **Service wallet**: the cron job requires an Aleo private key with credits for fees. This is
> a trust-minimised custodial action — the creator must pre-approve the service address as a
> delegate, OR accept that the service creates auctions on their behalf. Discuss with the creator
> during setup whether they want to co-sign or delegate.

---

## Frontend changes

### Creator dashboard: "Scheduled Emissions" tab

- List view: schedule name, auction type, interval, rounds remaining, active round status.
- "New Schedule" wizard:
  1. Pick existing auction wizard (reuse existing `CreateAuctionPage` or a stripped variant).
  2. Override: supply per round, interval (blocks), total rounds (or ∞).
  3. Review + create.
- Per-schedule controls: Pause / Resume, Edit interval, Cancel (voids remaining rounds).

### Active round card

Shows current round's auction card inline (bidding progress, time left) with round counter
"Round 3 of 12" overlaid.

### `useSchedules` hook

```ts
function useSchedules(creator: string): {
  schedules: Schedule[];
  create: (input: CreateScheduleInput) => Promise<Schedule>;
  pause: (id: string) => Promise<void>;
  resume: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
}
```

---

## Open decisions

1. **Delegate vs creator-signed creation**: the simplest implementation has the service wallet
   create auctions on the creator's behalf. Alternatively, the creator keeps their key in their
   browser and the service just prompts them to sign via the wallet at the right block. The
   browser-sign approach requires the creator to be online — awkward for automation.
2. **Template mutability**: should the creator be able to change the template mid-schedule? Yes,
   but only affects future rounds — the in-flight auction is immutable.
3. **Interval precision**: "every week" is approximately 302 400 blocks at 4s/block. Block time
   is not perfectly constant. The UI should express intervals in blocks with an approximate
   human-readable duration.
4. **Round-to-round supply adjustments**: some use cases want "decrease supply by 10% each round"
   (emission decay). Defer — implement as a static supply per round first. Add a `supply_decay_bps`
   column later.

---

## Steps

1. Add `schedules` table migration to the database schema.
2. Implement CRUD API routes for schedules.
3. Implement the block-poll cron job that triggers next-round creation.
4. Add `useSchedules` hook in the frontend.
5. Build "Scheduled Emissions" tab in creator dashboard.
6. Build "New Schedule" wizard (reuse existing wizard components).
7. Add per-schedule pause/resume/cancel controls.
8. Show active round auction card inline on the schedule detail view.
9. Run type-check.
