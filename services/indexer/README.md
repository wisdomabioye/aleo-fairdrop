# services/indexer

Aleo chain watcher. Polls the Aleo node RPC for new blocks, decodes transition inputs/outputs for all fairdrop programs, and writes structured state to PostgreSQL.

## What it processes

| Event | Action |
|---|---|
| `create_auction` | Insert `auctions` row |
| `place_bid_*` | Insert `bids` row, update `auctions.total_committed` |
| `close_auction` | Update `auctions` with clearing price, revenue split |
| `claim` / `claim_vested` | Update `bids.claimed`, insert `vesting` row |
| `claim_voided` | Update `bids.refunded` |
| Mapping updates | Sync `auction_state` mapping values |

## Internal modules

- **Slasher** (`src/slasher/`) — cron that detects auctions past `end_block` with no closer; alerts and optionally auto-submits `close_auction`.
- **Notifier** (`src/notifier/`) — fires webhooks/emails after key events (auction closed, bid won, vesting unlocked).

## Checkpoint

After each processed block, the indexer writes an `IndexerCheckpoint` row so it can resume from the last processed block after a restart. See `@fairdrop/types/indexer`.

## Status

Not yet implemented.
