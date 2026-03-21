# contracts/deployments/

```
deployments/
├── programs.json        ← single source of truth: all program IDs + salts (network-agnostic)
├── testnet/
│   └── network.json     ← testnet-specific: protocol accounts, deploy tx IDs, status per program
└── mainnet/
    └── network.json     ← mainnet-specific: same shape, fill in as you deploy
```

## programs.json

Program IDs and salts never change per network — they are derived from the Leo source. This file is the canonical reference for all TypeScript consumers via `packages/config`.

Validate it against the actual `contracts/*/program.json` files:

```bash
pnpm validate:programs
```

Run this in CI before any deploy to catch renames before they drift.

## network.json

Holds what changes per network:
- `accounts` — protocol treasury, fee collector, ops multisig addresses
- `deployments` — deployment status and transaction ID per program

Update `txId` and `status` after each successful `leo deploy`.
