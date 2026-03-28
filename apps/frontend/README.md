# Fairdrop — Frontend

The user-facing dApp for Fairdrop. Privacy-preserving token auctions on Aleo — bid without revealing your identity or amount on-chain.

Built with Vite + React + TypeScript + Tailwind v4. Wallet integration via `@provablehq/aleo-wallet-adaptor-*`.

## What's in the app

| Section | What it does |
|---|---|
| **Browse auctions** | Discover active Dutch, Sealed, Raise, Ascending, LBP, and Quadratic auctions |
| **Create auction** | 8-step wizard — type, token, pricing, timing, gate/vest, referral, metadata, review |
| **My Bids** | View your private bid records per program, lazy-loaded per auction |
| **Claim** | Claim tokens (Cleared) or refunds (Voided) from settled auctions |
| **Vesting** | Release vested allocations with a live progress timeline |
| **Earnings** | Commission tracking for referral code holders |
| **Shield** | Move public ALEO credits into a private record for anonymous bidding |
| **Token Launch** | Register and mint tokens on `token_registry.aleo` |
| **Token Manager** | Burn tokens and manage minter/burner roles |
| **Split & Join** | Reshape private token records — split one into two or merge two into one |

## Running locally

```bash
# From the repo root
pnpm install

# Copy env and fill in values
cp apps/frontend/.env.example apps/frontend/.env.local

pnpm --filter @fairdrop/frontend dev
```

The dev server starts at `http://localhost:5173`.

## Environment variables

```bash
VITE_ALEO_NETWORK=testnet                                  # testnet | mainnet
VITE_ALEO_RPC_URL=https://api.explorer.provable.com/v2/testnet
VITE_API_URL=http://localhost:3001                         # Fairdrop backend
VITE_IPFS_GATEWAY=https://ipfs.io/ipfs
VITE_FEE=100000                                           # Default tx fee in microcredits
```

The app throws at load if any `VITE_*` variable is missing — check `src/config/network.ts`.

## Wallets

Supports Leo, Puzzle, Fox, and Soter wallets via the Provable wallet adapter. Connect from any page — the sidebar shows your address once connected.

## Tech notes

- All private record reads use `requestRecords(program, true)` for plaintext — records are parsed via `@fairdrop/sdk/parse`
- Auction wizard progress is saved to `localStorage` per wallet address — navigating away and returning restores where you left off (token records are re-selected each session)
- Transaction status is tracked globally via `TxStatusStepper` (bottom-right overlay)
