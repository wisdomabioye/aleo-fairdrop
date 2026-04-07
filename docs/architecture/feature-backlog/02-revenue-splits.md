# Plan: Flexible Revenue Withdrawal

## Summary

Add a `recipient` parameter to `withdraw_payments` and `withdraw_unsold` in all 6 auction
contracts. The creator specifies where funds go on each call — their own address, a partner's
address, or a DEX contract for AMM seeding. No split table, no on-chain enforcement of
creator-partner agreements.

**Design rationale**: Fairdrop's trust guarantee covers bidders (payment → tokens). What the
creator does with their revenue after close is a business relationship outside the protocol's
scope. The `recipient` param enables trustworthy behaviour without enforcing it.

Applies to all 6 auction contracts: `dutch`, `sealed`, `ascending`, `raise`, `lbp`, `quadratic`.

---

## Scope

| Layer | Touch |
|---|---|
| Contract (×6) | Add `recipient` param to `withdraw_payments` and `withdraw_unsold` |
| SDK | Update `buildWithdrawPayments`, `buildWithdrawUnsold`; add `buildSeedFromAuction` |
| Frontend | Update `CreatorActionsCard` withdrawal inputs; `SeedLiquidityPanel` |

---

## Contract changes

### `withdraw_payments`

**Before:**
```leo
fn withdraw_payments(
    public auction_id: field,
    public amount:     u128,
) -> Final {
    let caller: address = self.signer;
    let f0: Final = credits.aleo::transfer_public(caller, amount as u64);
    return final {
        assert_eq(caller, config.creator);
        ...
    };
}
```

**After:**
```leo
fn withdraw_payments(
    public auction_id: field,
    public amount:     u128,
    public recipient:  address,
) -> Final {
    let caller: address = self.signer;
    let f0: Final = credits.aleo::transfer_public(recipient, amount as u64);
    return final {
        assert_eq(caller, config.creator);   // only creator may initiate
        ...                                  // existing escrow/revenue guards unchanged
    };
}
```

Creator still must be the signer. They direct funds anywhere they choose.

---

### `withdraw_unsold`

**Before:**
```leo
fn withdraw_unsold(
    public auction_id:    field,
    public amount:        u128,
    public sale_token_id: field,
) -> (token_registry.aleo::Token, Final)
```

**After:**
```leo
fn withdraw_unsold(
    public auction_id:    field,
    public amount:        u128,
    public sale_token_id: field,
    public recipient:     address,
) -> (token_registry.aleo::Token, Final)
```

The `mint_private` call targets `recipient` instead of `self.signer`. Creator guard unchanged.

---

## SDK changes

### `buildWithdrawPayments`

```ts
export function buildWithdrawPayments(
  auction:   AuctionView,
  amount:    bigint,
  recipient: string,   // was implicit (always creator); now explicit
): TxSpec
```

Frontend defaults to `auction.creator` when rendering the withdrawal input; passes the resolved
address when the creator overrides it.

---

### `buildWithdrawUnsold`

```ts
export function buildWithdrawUnsold(
  auction:        AuctionView,
  amount:         bigint,
  saleTokenId:    string,
  recipient:      string,   // new — defaults to creator
): TxSpec
```

---

### `buildSeedFromAuction` — new composite helper

Builds the transaction sequence for AMM seeding. Accepts both public and private credit paths
(the DEX handles either). The seeding amount is whatever the creator decides to commit —
they may have already sent part of their revenue elsewhere via earlier `withdraw_payments` calls.

```ts
export interface SeedFromAuctionInput {
  auction:      AuctionView;
  creditsAmount: bigint;   // how much revenue to seed (≤ remaining creator_revenue)
  tokenAmount:   bigint;   // how much unsold supply to seed (≤ remaining unsold)
  minLpTokens:  bigint;   // slippage guard
}

// Returns an ordered TxSpec[]:
// [0] withdraw_payments  — creditsAmount → creator (for DEX input)
// [1] withdraw_unsold    — tokenAmount   → creator (for DEX input)
// [2] add_liquidity      — credits + tokens → LP token
export function buildSeedFromAuction(input: SeedFromAuctionInput): TxSpec[]
```

`buildSeedFromAuction` is the only AMM-aware helper in the SDK. It always seeds to the creator
(who then holds the LP token). The DEX `add_liquidity` accepts public or private credits — no
`transfer_public_to_private` step needed.

---

## Frontend changes

### `CreatorActionsCard` — withdrawal inputs

Both withdrawal sections get an optional "Send to" address field:

```
Withdraw Revenue
  Amount  [____________]   Send to  [creator address auto-filled, editable]
  [Withdraw]

Withdraw Unsold Tokens
  Amount  [____________]   Send to  [creator address auto-filled, editable]
  [Withdraw]
```

- Defaults to `auction.creator` (no change in default behaviour).
- Validates the address is a valid Aleo address before enabling the button.
- No label or explanation needed beyond the field — the creator knows what they're doing.

---

### `SeedLiquidityPanel` — new post-close panel (creator only)

Visible on `AuctionDetailPage` after `status === Cleared`, creator wallet connected,
remaining `creator_revenue > 0` or unsold > 0.

**Layout:**

```
Seed Liquidity Pool
  Revenue remaining  X ALEO      [Amount to seed ____]
  Unsold tokens      Y TOKEN     [Amount to seed ____]
  Implied price      X/Y ALEO per token  (auto-computed, updates live)
  Min LP tokens      [auto-computed at 1% slippage, editable]

  [Seed Pool]   ← submits all 3 transactions in sequence
```

**Transaction sequencing** (`useSeedLiquidity` hook):
1. Submit `withdraw_payments(id, creditsAmount, creator)`
2. Poll until confirmed
3. Submit `withdraw_unsold(id, tokenAmount, tokenId, creator)`
4. Poll until confirmed
5. Submit `add_liquidity(credits, tokens, minLpTokens)`

Status shown per step: `idle → withdrawing → withdrawing_unsold → seeding → done | error`.

The panel detects if either withdrawal has already been partially executed (compare
`creator_withdrawn` against `creator_revenue`) and adjusts the available amounts accordingly.

---

## Backward compatibility

Existing `withdraw_payments(id, amount)` calls break — `recipient` is a new required parameter.
SDK callers always go through `buildWithdrawPayments`, so the only change needed is passing
`auction.creator` as the default. No contract state migration.

---

## Steps

1. Update `withdraw_payments` in all 6 contracts: add `public recipient: address`; change CPI target.
2. Update `withdraw_unsold` in all 6 contracts: add `public recipient: address`; change mint target.
3. Update `buildWithdrawPayments` in SDK — add `recipient` param.
4. Update `buildWithdrawUnsold` in SDK — add `recipient` param.
5. Add `buildSeedFromAuction` to SDK (`packages/sdk/src/transactions/dex.ts`).
6. Update `CreatorActionsCard`: add "Send to" address input for both withdrawal sections.
7. Build `useSeedLiquidity` hook with 3-step sequencing + per-step status.
8. Build `SeedLiquidityPanel` component.
9. Wire `SeedLiquidityPanel` into `AuctionDetailPage` (creator only, post-close).
10. Run type-check.
