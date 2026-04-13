# Fairdrop

Privacy-preserving token launches and capital formation on Aleo. Bidders can participate without revealing their identity or bid size on-chain. Auction creators get flexible mechanisms (Dutch, Sealed, Raise, Ascending, LBP, Quadratic) with optional vesting, gating, and referrals.

[Archived Legacy Fairdrop](https://github.com/wisdomabioye/fairdrop-aleo)

## Quick start

```bash
pnpm install
pnpm dev          # starts all apps and services in watch mode
pnpm type-check   # type-check every package
pnpm build        # production build
```

Requires Node ≥ 22, pnpm ≥ 10, and the [Leo CLI](https://developer.aleo.org/leo/installation) for contract work.

## Deployment

See [`SETUP.md`](SETUP.md) for full walkthrough — deploying contracts, running the indexer and API, and admin setup.

## Monorepo map

| Path | What it is |
|---|---|
| [`contracts/auctions/`](contracts/auctions/) | Leo auction programs (one per mechanism) |
| [`contracts/utilities/`](contracts/utilities/) | Shared on-chain helpers (config, gate, multisig, proof, ref, vest) |
| [`contracts/dex/`](contracts/dex/) | Fairswap DEX program |
| [`contracts/deployments/`](contracts/deployments/) | Deployed program addresses per network |
| [`apps/frontend/`](apps/frontend/) | Vite + React dApp — the user-facing interface |
| [`packages/types/`](packages/types/) | Shared TypeScript types — no runtime code, no build step |
| [`packages/sdk/`](packages/sdk/) | TypeScript SDK for interacting with the contracts |
| [`packages/database/`](packages/database/) | Drizzle schema + migrations (shared by indexer and api) |
| [`packages/config/`](packages/config/) | Shared runtime configuration |
| [`packages/leo-abigen/`](packages/leo-abigen/) | Code generation from Leo program ABIs |
| [`services/indexer/`](services/indexer/) | Chain watcher — processes blocks, writes to DB |
| [`services/api/`](services/api/) | HTTP API + token metadata routes |
| [`services/credential-signer/`](services/credential-signer/) | Isolated key signer for gate credential issuance |
| [`infra/`](infra/) | Docker Compose (local), deployment config (prod) |
| [`docs/`](docs/) | Architecture docs, runbooks |

## Architecture

See [`docs/architecture/DESIGN.md`](docs/architecture/DESIGN.md) for protocol design decisions, gap analysis, and implementation status.
