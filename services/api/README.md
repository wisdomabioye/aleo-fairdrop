# services/api

HTTP API for the frontend and any external integrations. Read-only — it never submits transactions; that happens client-side via the wallet adapter.

## Route groups

| Prefix | Description |
|---|---|
| `GET /auctions` | Paginated auction list with filters |
| `GET /auctions/:id` | Single auction with current state |
| `GET /auctions/:id/bids` | Bids for an auction (public bids only — private bids are never stored) |
| `GET /users/:address` | Reputation, referral codes, bid history for an address |
| `GET /tokens/:id/metadata` | Token name, symbol, decimals, image URI from registry |
| `GET /indexer/status` | Current sync status and lag behind chain tip |

All responses follow the shapes defined in `@fairdrop/types/api`.

## Stack

Hono on Node 22. No ORM in request path — raw Drizzle queries via `@fairdrop/database`. Response types validated against `@fairdrop/types/api` at the boundary.

## Status

Not yet implemented.
