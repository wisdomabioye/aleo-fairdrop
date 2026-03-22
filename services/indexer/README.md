# services/indexer

Aleo chain watcher. Polls the Aleo node for new blocks in batches, decodes transitions for all fairdrop programs, and writes structured state to PostgreSQL.

## Quick start

```sh
pnpm --filter @fairdrop/indexer dev    # tsx watch
pnpm --filter @fairdrop/indexer start  # tsx (prod)
```

## Env vars

| Var | Required | Default | Notes |
|---|---|---|---|
| `DATABASE_URL` | ✓ | — | PostgreSQL connection string |
| `ALEO_RPC_URL` | ✓ | — | e.g. `https://api.explorer.aleo.org/v1/testnet` |
| `INDEXER_START_BLOCK` | — | `1` | Block to begin from if no checkpoint exists |
| `INDEXER_BATCH_SIZE` | — | `50` | Blocks per `getBlockRange` call (max 50 — API cap) |
| `INDEXER_POLL_INTERVAL_MS` | — | `5000` | Sleep between ticks when caught up |
| `INDEXER_CONFIRMATION_DEPTH` | — | `10` | Blocks behind tip before processing (finality buffer) |

## Architecture

```
src/
├── env.ts              — startup env validation (throws on missing vars)
├── index.ts            — entrypoint
├── logger.ts           — structured logger with levels and timestamps
├── client/rpc.ts       — throttled Aleo REST client (≤5 req/s, 100k req/day)
├── types/aleo.ts       — block / transaction / transition JSON shapes
├── core/
│   ├── poll.ts         — main loop: resume from checkpoint, batch fetch, graceful SIGTERM
│   └── processor.ts    — per-block DB transaction, idempotency guard, handler dispatch
└── handlers/
    ├── types.ts        — TransitionContext, AuctionIdExtractor, HandlerEntry
    ├── extractors.ts   — two strategies for resolving auction_id from a transition
    ├── mapping.ts      — on-chain config + state readers (fetchConfig, fetchState)
    ├── index.ts        — registry built from @fairdrop/config PROGRAMS at startup
    └── auction.ts      — generic upsert handler — works for all auction types
```

Leo value parsing (`parseStruct`, `parseU128`, etc.) lives in `@fairdrop/sdk/parse` — shared with the frontend, no duplication.

## What it indexes

Every registered transition collapses to one operation: read `auction_configs` + `auction_states` mappings → upsert the `auctions` row.

| Transition | auction_id source | Action |
|---|---|---|
| `create_auction` | `op.key` of the finalize op (field literal, non-zero) | Insert `auctions` row |
| `close_auction` | first field-typed public input | Upsert — cleared, clearing_price, revenue |
| `cancel_auction` | first field-typed public input | Upsert — voided = true |
| `place_bid_*` / `commit_bid_*` / `reveal_bid` | first field-typed public input (or finalize key for `reveal_bid`) | Upsert — total_committed |
| `claim` / `claim_vested` / `claim_voided` | — | Intentionally skipped — operate on private Bid records; auction_id unresolvable from public chain data |
| `push_referral_budget` / `withdraw_payments` / `withdraw_unsold` | — | Intentionally skipped — do not change auction-level state |

Bid / claim / vesting tracking is out of scope. Users see their private Bid records via their connected wallet.

## auction_id extraction — important detail

Two strategies live in `handlers/extractors.ts`:

- **`auctionIdFromPublicInput`** — scans `transition.inputs` for the first value that ends with `'field'`. Used by all transitions that take `auction_id` as an explicit public parameter.
- **`auctionIdFromFinalizeKey`** — scans `finalize[].key` for a non-zero field literal. Used by `create_auction` and `reveal_bid` (sealed), where the auction_id is only visible as a mapping key in the finalize ops.

**Do not use `finalize[].mapping_id` for matching.** That field is a BHP256 hash of the program + mapping name — not a human-readable name. Matching on it will never work.

## Dispatch model

The processor dispatches blindly — no auction-type–specific logic anywhere in `processor.ts`:

```ts
const entry = registry[programId]?.[fnName];
if (!entry) return;
const auctionId = entry.getAuctionId(transition, finalizeOps);
await entry.handle(ctx, auctionId);
```

`registry` is a flat `Record<programId, Record<transitionName, HandlerEntry>>` built at startup from `@fairdrop/config PROGRAMS`. Adding a new auction type is one entry in `handlers/index.ts`:

```ts
[AuctionType.NewType, PROGRAMS.newtype.programId],
```

## Rate limits

`api.explorer.aleo.org` enforces **5 req/s · 100,000 req/day**. `AleoRpcClient` serialises all requests through a queue with a 200ms minimum gap. On 429 it backs off 2s and retries once.

Each tick fetches up to `INDEXER_BATCH_SIZE` (default 50) blocks in a **single** `GET /blocks?start=N&end=M` call. During catchup that's 1 RPC call per 50 blocks + 2 calls per auction event (config + state mapping reads). During normal operation (1–2 new blocks per tick) the budget is well within limits.

## Checkpoint & idempotency

- **`indexer_checkpoints`** — one row (`programId = 'global'`) updated after each block. The `lag` column is written as `tipHeight - blockHeight` so the API health endpoint reflects actual sync delay, not stale zeros.
- **`indexer_transitions`** — every processed transition ID is recorded. On restart, already-seen transitions are skipped even if their block is reprocessed.

Both writes are inside the same DB transaction as the domain rows — either the whole block commits or nothing does. If a mapping read fails (transient RPC error), the transaction rolls back and the block is retried on the next tick.
