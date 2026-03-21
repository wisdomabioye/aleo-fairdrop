# Implementation Order

The guiding principle: **close the Dutch auction loop end-to-end before building anything else.**
One auction type working fully (chain → indexer → API → web) is worth more than six auction types with no infrastructure.

---

## Phase 1 — Foundation

Goal: get the Dutch auction deployed and the shared packages that everything else depends on ready.

| # | Item | Why now |
|---|---|---|
| 1.1 | Deploy `fairdrop_dutch.aleo` + all 5 utilities to testnet | Nothing is real until it's on-chain |
| 1.2 | `packages/config` | Reads `programs.json` + `network.json`; exports typed program IDs and protocol accounts. Both services and web need this before they can reference any contract. |
| 1.3 | `packages/database` | Drizzle schema + migrations matching `@fairdrop/types/db`. Indexer and API share it — build once. |

---

## Phase 2 — Services

Goal: get real chain data flowing into a queryable store.

| # | Item | Why now |
|---|---|---|
| 2.1 | `services/indexer` | Poll testnet, decode Dutch transitions, write to DB. No frontend is meaningful without indexed data. |
| 2.2 | `services/api` | Hono HTTP layer over the indexed DB. Build immediately after indexer so the web app has something real to query. Metadata routes included here (no separate service). |

The notifier (webhooks/email) and slasher (cron) are internal modules of the indexer — implement them as stubs during 2.1 and fill in as needed.

---

## Phase 3 — App

Goal: replace prototype RPC calls with real infrastructure; ship the first usable dApp.

| # | Item | Why now |
|---|---|---|
| 3.1 | `packages/sdk` | Typed `executeTransaction` wrappers per Dutch transition. Build alongside web so DX is validated immediately. |
| 3.2 | `apps/web` | Wire to real API + `packages/config` + `packages/sdk`. Replace hardcoded RPC calls with indexed data. Add gate/credential UI. |

---

## Phase 4 — Second auction type + credential signer

Goal: prove the full stack generalises; unlock gated auctions.

| # | Item | Why now |
|---|---|---|
| 4.1 | `contracts/auctions/sealed` | Simplest mechanism after Dutch — commit/reveal, no price curve. Validates that the indexer/API/web patterns established for Dutch are reusable. |
| 4.2 | `contracts/auctions/raise` | Fixed price, minimal new logic. Good second data point before building more complex types. |
| 4.3 | `services/credential-signer` | Only needed once a gated auction is live on testnet. Isolated key signer for `fairdrop_gate.aleo` credentials. |

For each new auction type: add indexer handlers → API routes → web UI in that order.

---

## Phase 5 — Remaining contracts

Complete the remaining mechanisms once the full pipeline is proven. Order by complexity:

| # | Contract | Mechanism |
|---|---|---|
| 5.1 | `fairdrop_ascending.aleo` | Ascending English auction — anti-snipe extension logic |
| 5.2 | `fairdrop_lbp.aleo` | Liquidity Bootstrapping Pool — AMM weight curve |
| 5.3 | `fairdrop_quadratic.aleo` | Quadratic funding — requires gate (Sybil protection) |

Each follows the same pipeline: contract → deploy → indexer handler → API route → web UI.

---

## Dependency map

```
packages/types        (done)
    │
    ├── packages/config        (1.2)
    ├── packages/database      (1.3)
    │       │
    │       ├── services/indexer   (2.1)
    │       └── services/api       (2.2)
    │
    ├── packages/sdk           (3.1)
    └── apps/web               (3.2)  ← also depends on config, sdk, api
```

`packages/types` has no dependencies. Everything else flows from it.
