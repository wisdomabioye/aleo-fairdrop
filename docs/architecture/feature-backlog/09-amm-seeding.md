# Plan: Post-Auction AMM Seeding

## Summary

After `close_auction`, creator atomically seeds a private AMM pool using their revenue +
unsold supply in a single guided flow. Uses the existing `private_dex.aleo` contract. Flow:
`withdraw_payments` + `withdraw_unsold` → `add_liquidity`.

**Status: DEFERRED** — `private_dex.aleo` exists in the monorepo but is not deployed on mainnet.
This plan should be implemented after:
1. `private_dex.aleo` is deployed and verified on Aleo mainnet.
2. All items in `docs/architecture/TODO.md` are completed.

The plan is written now so the design is ready to execute immediately once the DEX is live.

---

## Scope

| Layer | Touch |
|---|---|
| Contract | None — `private_dex.aleo` already built |
| SDK | `@fairdrop/sdk/dex` — new entry point with `buildAddLiquidity`, `buildSeedFromAuction` |
| Frontend | "Seed Liquidity" wizard on `AuctionDetailPage` (post-close, creator only) |

---

## `private_dex.aleo` interface (existing)

Review the deployed contract interface before implementing SDK builders. Key transitions expected:

```
add_liquidity(token_a_record, token_b_record, min_lp_tokens) → (LpToken, Final)
```

Exact parameter names and record types must be confirmed from the deployed ABI. The SDK builders
in this plan are placeholders pending that review.

---

## SDK changes: new `@fairdrop/sdk/dex` entry point

```ts
// packages/sdk/src/dex/index.ts

export function buildAddLiquidity(input: AddLiquidityInput): TxSpec { ... }

export interface AddLiquidityInput {
  tokenARecord: Record<string, unknown>;   // sale token (from withdraw_unsold)
  tokenBRecord: Record<string, unknown>;   // ALEO credits record (from withdraw_payments)
  minLpTokens: bigint;                     // slippage guard
}

// Composite helper: builds the three-transaction sequence as an array of TxSpec.
// Caller submits them in order; the LP token from add_liquidity is returned to the creator.
export function buildSeedFromAuction(input: SeedFromAuctionInput): TxSpec[] {
  // 1. buildWithdrawPayments(...)
  // 2. buildWithdrawUnsold(...)
  // 3. buildAddLiquidity(...)
  return [withdrawTx, withdrawUnsoldTx, addLiquidityTx];
}
```

---

## Frontend changes

### "Seed Liquidity" button

On `AuctionDetailPage`, visible to the creator after auction closes (`state.cleared = true`),
only when there is unsold supply or unclaimed revenue. Disabled if the creator has already
seeded (track in local state or API).

### "Seed Liquidity" wizard (3 steps)

**Step 1: Summary**
- "Revenue available: X ALEO"
- "Unsold tokens: Y TOKEN"
- "Initial price implied: X/Y ALEO per token"

**Step 2: Configure slippage**
- "Min LP tokens to receive" — auto-computed from 1% slippage, editable.
- Warning if unsold = 0 (creator can only seed with revenue, which requires the other side).

**Step 3: Confirm + Execute**
- Shows the three transactions to be submitted.
- "Seed Pool" button: submits all three in sequence using `executeTransaction`.
- Transaction status tracking for each step.

### `useSeedLiquidity` hook

```ts
function useSeedLiquidity(auctionId: string): {
  canSeed: boolean;           // cleared, unsold > 0, creator
  execute: (minLpTokens: bigint) => Promise<void>;
  status: 'idle' | 'withdrawing' | 'withdrawing_unsold' | 'adding_liquidity' | 'done' | 'error';
  txIds: string[];
}
```

---

## Open decisions

1. **Transaction sequencing**: Leo records are private. The `withdraw_payments` output record
   (credits) and `withdraw_unsold` output (token record) must be available as inputs to
   `add_liquidity`. This requires the first two transactions to be finalized on-chain before
   submitting the third. The hook must wait for confirmation of each step. Use
   `transactionStatus(id)` polling — already used in the existing frontend.

2. **Pool already exists**: if the creator previously seeded, `add_liquidity` adds to the
   existing pool. The wizard should detect this and show current pool stats if available.

3. **Minimum viable liquidity**: if revenue or unsold supply is very small, the pool may be
   near-useless. Add a warning when either side is below a suggested minimum (e.g. 100 ALEO
   or 1000 tokens).

4. **DEX ABI confirmation**: the `add_liquidity` transition signature must be confirmed against
   the deployed contract. Do not hardcode program/function names until deployment is verified.

---

## Pre-implementation checklist

- [ ] `private_dex.aleo` deployed and ABI available.
- [ ] `add_liquidity` transition signature confirmed.
- [ ] LP token record type confirmed.
- [ ] Pool existence query confirmed (what mapping to read for existing pools?).
- [ ] All `TODO.md` items completed.

---

## Steps (execute after pre-implementation checklist)

1. Review deployed `private_dex.aleo` ABI — confirm `add_liquidity` signature.
2. Build `@fairdrop/sdk/dex` entry point with `buildAddLiquidity` + `buildSeedFromAuction`.
3. Build `useSeedLiquidity` hook with multi-step transaction sequencing.
4. Build "Seed Liquidity" wizard (3-step modal).
5. Add "Seed Liquidity" button to `AuctionDetailPage`.
6. Run type-check.
