# Fairdrop

Privacy-preserving token launches and capital formation on Aleo. Bidders can participate without revealing their identity or bid size on-chain. Auction creators get flexible mechanisms (Dutch, Sealed, Raise, Ascending, LBP, Quadratic) with optional vesting, gating, and referrals.

## Monorepo map

| Path | What it is |
|---|---|
| `contracts/auctions/` | Leo auction programs (one per mechanism) |
| `contracts/utilities/` | Shared on-chain helpers (config, gate, proof, ref, vest) |
| `contracts/deployments/` | Deployed program addresses per network |
| `apps/web/` | Vite + React dApp — the user-facing interface |
| `packages/types/` | Shared TypeScript types — no runtime code, no build step |
| `packages/ui/` | Shared React component library (shadcn-based) |
| `packages/database/` | Drizzle schema + migrations (shared by indexer and api) |
| `packages/sdk/` | TypeScript SDK for interacting with the contracts |
| `services/indexer/` | Chain watcher — processes blocks, writes to DB |
| `services/api/` | HTTP API + token metadata routes |
| `services/credential-signer/` | Isolated key signer for gate credential issuance |
| `infra/` | Docker Compose (local), deployment config (prod) |
| `docs/` | Architecture docs, runbooks |

## Quick start

```bash
pnpm install
pnpm dev          # starts all apps and services in watch mode
pnpm type-check   # type-check every package
pnpm build        # production build
```

Requires Node ≥ 22, pnpm ≥ 10, and the [Leo CLI](https://developer.aleo.org/leo/installation) for contract work.

## Deployment

For a full walkthrough — deploying contracts, running the indexer and API, and admin setup — see [`SETUP.md`](SETUP.md).

## Architecture

See [`docs/architecture/DESIGN.md`](docs/architecture/DESIGN.md) for protocol design decisions, gap analysis, and implementation status.
