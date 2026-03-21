# services/

Backend processes. Three real services — everything else is a module within them.

| Service | Role |
|---|---|
| `indexer/` | Polls the Aleo node, processes blocks, writes auction/bid/vesting state to DB. Runs the slasher cron and fires notification webhooks internally. |
| `api/` | Hono HTTP API consumed by the frontend. Serves auction listings, bid history, token metadata. Read-only from DB; no chain writes. |
| `credential-signer/` | Isolated process holding the gate credential private key. Issues `GateCredential` records to verified users. Separated by process boundary to limit key exposure. |

## What is NOT a separate service

- **metadata** — routes inside `api/` (`GET /tokens/:id/metadata`)
- **notifier** — event hooks inside `indexer/`, triggered after processing each block
- **slasher** — `node-cron` job inside `indexer/`, runs every N blocks

## Stack

Node 22 + TypeScript. Hono for HTTP. Drizzle + PostgreSQL via `@fairdrop/database`. Each service has its own `Dockerfile`. Run everything locally with Docker Compose from `infra/docker/`.
