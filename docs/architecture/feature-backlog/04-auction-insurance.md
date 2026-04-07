# Plan: Partial Fill Insurance (`fill_min_bps`)

## Summary

Add a `fill_min_bps` threshold to `fairdrop_raise_v1.aleo` and `fairdrop_quadratic_v1.aleo`.
If total contributions reach `fill_min_bps` percent of `raise_target`, the auction clears
and tokens are distributed pro-rata. Below the threshold, the auction voids as today.

No refunds. No cap. Creator keeps all payments. Bidders always receive a proportional
share of `effective_supply` — fewer tokens if undersubscribed, fewer tokens per credit
if oversubscribed. Both cases use the same claim formula.

`fill_min_bps = 0` → existing 100%-or-void behavior. Zero migration required.

Applies to: `fairdrop_raise_v1.aleo` and `fairdrop_quadratic_v1.aleo` only.
Dutch, Ascending, Sealed, LBP are price-discovery mechanisms — partial fill does not apply.

---

## Why it matters

A raise that reaches 95% of target currently voids — creator gets nothing, bidders get
refunds, community effort is wasted. The minimum threshold eliminates the "near miss"
failure mode that discourages borderline participation. Creators set a floor they are
comfortable distributing at; bidders know a partial success is still a success.

Oversubscription is also handled cleanly: all tokens distribute pro-rata, creator keeps
the full windfall. No cap needed — oversubscription is a good problem.

---

## Scope

| Layer | Touch |
|---|---|
| Contract | `raise` + `quadratic` — `AuctionConfig`, `AuctionState`, `close_auction`, `claim` |
| SDK | `buildCreateAuction` Raise + Quadratic variants |
| Frontend | `RaisePricingStep`, `QuadraticPricingStep`; `build-inputs.ts`; `ReviewStep`; claim UI |

---

## Contract changes

### `AuctionConfig` — new field

```leo
struct AuctionConfig {
    ...existing fields...
    fill_min_bps: u16,   // NEW — minimum fill to succeed (e.g. 7000 = 70%).
                         //       0 = disabled; 100% required (existing behaviour).
}
```

### `AuctionState` — new field

```leo
struct AuctionState {
    ...existing fields...
    effective_supply: u128,  // NEW — actual tokens to distribute at close.
                             //       = supply for oversubscribed; < supply for partial fill.
                             //       0 until cleared.
}
```

### `close_auction` finalize

```leo
// Current void condition (raise):
assert(state.total_payments >= config.raise_target);

// New logic:
let min_payments: u128 = config.fill_min_bps > 0u16
    ? config.raise_target * config.fill_min_bps as u128 / 10000u128
    : config.raise_target;   // 0 = disabled → 100% required

if state.total_payments < min_payments {
    // Below threshold — void as before.
    state.voided = true;
} else {
    // Partial or full success.
    // effective_supply: scale down proportionally for partial fill; cap at supply.
    let effective: u128 = state.total_payments >= config.raise_target
        ? config.supply                                                     // oversubscribed or exact
        : config.supply * state.total_payments / config.raise_target;      // partial fill

    state.effective_supply = effective;
    state.creator_revenue  = state.total_payments - protocol_fee;
    state.cleared = true;
}
```

Protocol fee is calculated on `state.total_payments` — the full amount received,
including oversubscription windfall. Creator revenue = `total_payments - protocol_fee`.

### `claim` finalize

Replace `config.supply` with `state.effective_supply` in the allocation formula:

```leo
// Raise claim (existing pro-rata):
// Before: allocation = config.supply * bidder_payment / total_payments
// After:
let allocation: u128 = state.effective_supply * bidder_payment / total_payments;
```

Same formula for both partial fill and oversubscribed cases. No new code path.

**Quadratic** follows the same change — replace `config.supply` with
`state.effective_supply` in the sqrt-weighted allocation:

```leo
// Before: allocation = config.supply * bidder_sqrt_weight / total_sqrt_weight
// After:
let allocation: u128 = state.effective_supply * bidder_sqrt_weight / total_sqrt_weight;
```

The sqrt weights are unchanged. The fill ratio is applied as a scalar to the final
distribution via `effective_supply`.

### `create_auction` validation

```leo
// When fill_min_bps is enabled:
assert(config.fill_min_bps == 0u16 || config.fill_min_bps <= 10000u16);
// fill_min_bps > 10000 would set a bar above 100% — nonsensical.
```

---

## SDK changes

`CreateAuctionInput` Raise and Quadratic variants — add optional field:

```ts
fillMinBps?: number   // default: 0 (disabled)
```

`buildCreateAuction` Raise + Quadratic cases — include in `AuctionConfig` serialisation:

```ts
fill_min_bps: u32(p.fillMinBps ?? 0),
```

No change to `buildClaim` — auction_id + bid record is sufficient.

---

## Frontend changes

### `RaisePricingStep.tsx` and `QuadraticPricingStep.tsx`

Optional "Minimum fill" input (disabled by default):

```
[ ] Enable minimum fill threshold
    Minimum fill  [____] %
    "If contributions reach X% of the target, the auction succeeds and tokens
     distribute pro-rata. Below X%, the auction voids and all bidders are refunded."
```

Converts percentage input to bps internally (`value * 100`).
Validates `0 < value ≤ 100`.

### `WizardForm` additions

```ts
fillMinBps: number   // default: 0
```

### `build-inputs.ts`

Pass `form.fillMinBps` for Raise and Quadratic variants.

### `ReviewStep`

Show only when enabled:

```
Minimum fill: 70% of raise target
(Below 70%: voided and refunded. Above 70%: pro-rata distribution.)
```

### Claim UI (`AuctionDetailPage` / `DefaultPostAuctionPanel`)

For cleared auctions where `effective_supply < supply`:
- Show "Partial fill — X% of target reached" instead of "Sold out".
- Show bidder's effective allocation based on `effective_supply`.

For oversubscribed auctions (`total_payments > raise_target`):
- Show "Oversubscribed — tokens distributed pro-rata".
- Show effective price per token (higher than the stated price).

---

## Open decisions

1. **`effective_supply` in `AuctionState` vs computed at claim**: storing it avoids
   repeated computation and makes the claim formula straightforward. Chosen.

2. **Protocol fee on `total_payments` vs `effective_fill`**: fee is on `total_payments`
   (the full amount received). Creator keeps the oversubscription windfall minus fee.
   Consistent with existing behavior — fee always applies to total inflows.

---

## Steps

1. Add `fill_min_bps` to `AuctionConfig` in `raise` and `quadratic` contracts.
2. Add `effective_supply` to `AuctionState` in both contracts.
3. Update `close_auction` finalize in both contracts with threshold + effective_supply logic.
4. Update `claim` finalize in both contracts: replace `config.supply` with `state.effective_supply`.
5. Add `fill_min_bps` validation to `create_auction` finalize in both contracts.
6. Update `CreateAuctionInput` Raise + Quadratic variants in SDK.
7. Update `buildCreateAuction` serialisation in SDK.
8. Add minimum fill input to `RaisePricingStep` and `QuadraticPricingStep`.
9. Add `fillMinBps` to `WizardForm` + `DEFAULT_FORM`.
10. Update `build-inputs.ts`.
11. Update `ReviewStep` and claim UI.
12. Run type-check.
