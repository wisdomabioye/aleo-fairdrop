# apps/web

The fairdrop dApp. Vite + React + Tailwind v4. All ZK proof generation and transaction signing happens client-side via the wallet adapter — this is a static SPA with no server.

## Dev

```bash
cp .env.example .env   # fill in VITE_* vars
pnpm dev               # starts at localhost:5173
```

Required env vars are validated at load time in `src/config/network.ts` — the app throws immediately if any are missing.

## Structure

```
src/
├── config/         # network constants, env validation
├── providers/      # wallet adapter setup (isolated here)
├── features/       # domain features: auctions/, token-launch/, token-manager/, claim/
├── shared/
│   ├── components/ # ui/ (primitives), wallet/ (ConnectButton etc.)
│   ├── hooks/      # useTransaction, useRecords, useBlockHeight, useLocalStorage
│   ├── lib/        # tokenRegistry.ts, paymentToken.ts (chain query helpers)
│   └── utils/      # formatting (truncateAddress, formatAmount)
└── workers/        # Web Workers for proof generation (kept here for Vite bundling)
```

## Wallet adapter

Uses `@provablehq/aleo-wallet-adaptor-*` v0.3.0-alpha.3. Key API:

- `useWallet().address` — connected address (not `publicKey`)
- `executeTransaction({ program, function, inputs, fee })` — returns `{ transactionId }` or `undefined`
- `transactionStatus(id)` → `{ status: TransactionStatus }`
