# services/

Backend processes.

| Service | Role |
|---|---|
| `indexer/` | Polls the Aleo node, processes blocks, writes auction state to DB. |
| `api/` | Hono HTTP API consumed by the frontend. Serves auction listings, bid history, token metadata. Read-only from DB; no chain writes. |
| `credential-signer/` | Isolated process holding the gate credential private key. Issues `GateCredential` records to verified users. Separated by process boundary to limit key exposure. |

## What is NOT a separate service

- **metadata** — routes inside `api/` (`POST /metadata`, `GET /metadata/:hash`)
- **token info** — routes inside `api/` (`GET /tokens/:id/metadata`) with in-process TTL cache

## Stack

Node 22 + TypeScript. Hono for HTTP. Drizzle + PostgreSQL via `@fairdrop/database`. Each service has its own `Dockerfile`. Run everything locally with Docker Compose from `infra/docker/`.
