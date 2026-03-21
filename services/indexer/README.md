# services/indexer

Aleo chain watcher. Polls the Aleo node RPC for new blocks, decodes transitions for all fairdrop programs, and writes structured state to PostgreSQL.

## Architecture

```
src/
├── env.ts              — startup env validation (throws on missing vars)
├── index.ts            — entrypoint
├── client/rpc.ts       — throttled Aleo REST client (≤5 req/s, 100k req/day)
├── types/aleo.ts       — block / transaction / transition JSON shapes
├── core/
│   ├── poll.ts         — main poll loop with graceful SIGTERM shutdown
│   └── processor.ts    — per-block processing, idempotency, DB transactions
└── handlers/
    ├── types.ts        — TransitionContext shared interface
    ├── index.ts        — registry built from @fairdrop/config PROGRAMS
    └── auction.ts      — generic upsert handler (all auction types)
```

Leo value parsing (`parseStruct`, `parseU128`, etc.) lives in `@fairdrop/sdk/parse` — shared with the frontend, no duplication.

## What it processes

Every registered transition collapses to a single operation: read `auction_configs` + `auction_states` from on-chain mappings → upsert the `auctions` row.

| Transition | auction_id source | Action |
|---|---|---|
| `create_auction` | finalize op key on `auction_configs` | Upsert `auctions` row (config + state + creator) |
| `close_auction` | `inputs[0]` (public field) | Upsert — refreshes state (cleared, clearing_price, revenue) |
| `cancel_auction` | `inputs[0]` (public field) | Upsert — refreshes state (voided = true) |
| `place_bid_*` | first `field`-typed input | Upsert — refreshes state (total_committed) |
| `claim` / `claim_vested` / `claim_voided` | — | Skipped — operate on private Bid records; auction_id unresolvable |

Bid / claim / vesting tracking is out of scope. Users see their private Bid records via their connected wallet. The indexer tracks auction-level state only.

## Dispatch model

The processor dispatches blindly — no auction-type–specific logic anywhere in `processor.ts`:

```ts
const entry = registry[programId]?.[fnName];
if (!entry) return; // not a fairdrop transition — skip
const auctionId = entry.getAuctionId(transition, finalizeOps);
await entry.handle(ctx, auctionId);
```

`registry` is a flat `Record<programId, Record<transitionName, HandlerEntry>>` built at startup from `@fairdrop/config PROGRAMS`. Adding a new auction type is one entry in `handlers/index.ts`:

```ts
['newtype', PROGRAMS.newtype.programId],
```

## Rate limits

The Aleo explorer API enforces **5 req/s and 100,000 req/day**. `AleoRpcClient` serialises all requests through a queue with a 200ms minimum gap between calls. On a 429 it backs off 2s and retries once.

Budget at default settings: 1 call per block + 2 per `create_auction` (config + state mapping reads). At `INDEXER_BATCH_SIZE=20` and `INDEXER_POLL_INTERVAL_MS=5000` the indexer comfortably stays within the daily cap.

## Checkpoint & idempotency

- `indexer_checkpoints` — updated after each block. Indexer resumes from `lastBlockHeight + 1` on restart.
- `indexer_transitions` — every processed transition ID is recorded. Duplicates are skipped on restart. Transitions on known programs with no registered handler are also recorded (so they are not re-examined on restart).

Both writes are inside the same DB transaction as the domain rows — either the whole block commits or nothing does.
