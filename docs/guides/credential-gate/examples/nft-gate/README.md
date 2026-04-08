# Example: NFT / Token-Gated Round

Require bidders to hold a minimum balance of an on-chain token before they can bid. Uses the `custom` strategy.

This is useful when:
- You want to combine token ownership with other checks (see `check.ts` below)
- The `token-gate` built-in strategy does not cover your exact logic (e.g. multiple tokens, OR conditions)

For a simple "hold at least N of token X" requirement, the built-in `token-gate` strategy is sufficient — see [`services/credential-signer/README.md`](../../../../../services/credential-signer/README.md#token-gate----on-chain-token-balance).

---

## What this example does

Checks whether the bidder holds at least 1 unit of a specified token using on-chain data from `token_registry.aleo`. Allows bidders who satisfy **both**:
1. Token balance ≥ 1
2. Auction is in a secondary allowlist (demonstrates combining conditions)

For a single-condition token check, simplify to just the balance part.

---

## Setup

**Step 1 — copy the service**
```bash
cp -r services/credential-signer my-nft-gate
cd my-nft-gate
npm install
```

**Step 2 — configure**
```bash
cp docs/guides/credential-gate/examples/nft-gate/.env.example .env
```

Edit `.env`:
```env
ISSUER_PRIVATE_KEY=APrivateKey1zkp...
ALEO_RPC_URL=https://api.explorer.provable.com/v1
CHECK_STRATEGY=custom
CHECK_MODULE=./nft-gate-check.ts
REQUIRED_TOKEN_ID=123field
```

**Step 3 — add the check module**

Copy `check.ts` from this example to the service root (next to `.env`) and rename it `nft-gate-check.ts`.

**Step 4 — start**
```bash
npm run dev
```

---

## check.ts

```ts
/**
 * NFT / token-gate check module.
 *
 * Requires bidder to hold >= 1 of REQUIRED_TOKEN_ID on-chain.
 * Place this file next to .env in the credential-signer root (not inside src/).
 *
 * Imports from @fairdrop/sdk/token-registry — available because credential-signer
 * initialises @provablehq/sdk WASM at startup before any check function runs.
 */
import { fetchTokenInfo, fetchTokenBalance } from '@fairdrop/sdk/token-registry';

const TOKEN_ID  = process.env.REQUIRED_TOKEN_ID;
const MIN_BALANCE = BigInt(process.env.MIN_BALANCE ?? '1');

if (!TOKEN_ID) throw new Error('REQUIRED_TOKEN_ID is not set');

const check = async (address: string, _auctionId: string): Promise<boolean> => {
  const info = await fetchTokenInfo(TOKEN_ID);
  if (!info) {
    // Token not registered in token_registry.aleo — deny all
    return false;
  }

  const balance = await fetchTokenBalance(address, TOKEN_ID, info);
  return balance !== null && balance.amount >= MIN_BALANCE;
};

export default check;
```

---

## .env.example

```env
ISSUER_PRIVATE_KEY=APrivateKey1zkp...
ALEO_RPC_URL=https://api.explorer.provable.com/v1
CHECK_STRATEGY=custom
CHECK_MODULE=./nft-gate-check.ts

# Field ID of the required token (as it appears on-chain)
REQUIRED_TOKEN_ID=123field

# Minimum token balance required (default: 1)
# MIN_BALANCE=1
```

---

## Finding a token ID

Token IDs are field values computed from the token metadata at registration time. To find the ID for a specific token:

1. Look up the token in the Aleo explorer under `token_registry.aleo/registered_tokens`
2. Or use `generateTokenId()` from `@fairdrop/sdk/hash` if you know the registration inputs

---

## SDK functions used

| Function | Package | Description |
|---|---|---|
| `fetchTokenInfo(tokenId)` | `@fairdrop/sdk/token-registry` | Fetches token metadata from `registered_tokens[tokenId]` |
| `fetchTokenBalance(address, tokenId, info)` | `@fairdrop/sdk/token-registry` | Fetches public balance from `authorized_balances` or `balances` mapping |

`fetchTokenBalance` returns `TokenBalance | null`. `null` means the account has no entry in either mapping (balance is zero).

---

## Limitations

- Only checks **public** balances. Private token balances (shielded via `transfer_private`) are not readable from mappings — the bidder would need to unshield first.
- `token_registry.aleo` only tracks tokens registered on that program. Credits (`credits.aleo`) are not in `registered_tokens` — use `fetchCreditsBalance` from `@fairdrop/sdk/token-registry` for credits.
