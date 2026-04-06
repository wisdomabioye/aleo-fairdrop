# Plan: Auction Insurance (Partial Fill)

## Summary

Creator over-commits supply (e.g. 120% of target). If total contributions land in the
`[fill_min_bps, fill_max_bps]` band relative to `raise_target`, the auction closes successfully
and supply is distributed proportionally rather than voided. Below `fill_min_bps`, the auction
voids as today. Above `fill_max_bps`, it also closes — excess is proportionally capped.

Eliminates the binary all-or-nothing risk that discourages participation in borderline raises.

Applies to: `fairdrop_raise_v1.aleo` and `fairdrop_quadratic_v1.aleo` (raise-style semantics).
Dutch, Ascending, Sealed, LBP are price-discovery mechanisms — partial fill doesn't apply.

---

## Scope

| Layer | Touch |
|---|---|
| Contract | `raise` + `quadratic` — `AuctionConfig`, `close_auction`, `claim` |
| SDK | `buildCreateAuction` Raise + Quadratic variants; `buildClaim` |
| Frontend | `RaisePricingStep` / `QuadraticPricingStep`; `build-inputs.ts`; `ReviewStep` |

---

## Contract changes

### New fields on `AuctionConfig`

```leo
struct AuctionConfig {
    ...existing fields...
    fill_min_bps: u16,   // NEW — min fill to succeed (e.g. 8000 = 80%). 0 = disabled (100% required).
    fill_max_bps: u16,   // NEW — max fill band (e.g. 12000 = 120%). Must be >= fill_min_bps.
                         //       Contributions above this band are refunded proportionally at claim.
}
```

### `close_auction` finalize changes

Current raise void condition:
```leo
assert(state.total_committed >= config.supply);  // all-or-nothing
```

New logic when `fill_min_bps > 0`:
```leo
let target: u128 = config.raise_target;  // total credits required for full fill
let min_fill: u128 = target * fill_min_bps as u128 / 10000u128;
let max_fill: u128 = target * fill_max_bps as u128 / 10000u128;

let total: u128 = state.total_payments;

if total < min_fill {
    // Below minimum — void as before
    state.voided = true;
} else {
    // Partial or full success
    let effective_fill: u128 = min(total, max_fill);
    let fill_ratio: u128 = effective_fill * PRECISION / target;  // PRECISION = 1_000_000
    state.effective_supply: u128 = config.supply * fill_ratio / PRECISION;
    // revenue: bidders who paid into effective_fill keep their allocation
    // excess over max_fill is refunded proportionally at claim time
    state.creator_revenue = effective_fill - protocol_fee;
    state.cleared = true;
}
```

New field on `AuctionState`:
```leo
struct AuctionState {
    ...existing fields...
    effective_supply: u128,  // NEW — actual supply distributed at close. 0 until cleared.
}
```

### `claim` finalize changes

When `fill_max_bps > 0` and `state.total_payments > max_fill`:
- Bidder's proportional allocation uses `effective_supply` instead of `config.supply`.
- Bidder receives proportional refund for contributions above the cap:
  ```
  excess_payments = total_payments - max_fill
  bidder_refund = (bidder_payment / total_payments) * excess_payments
  bidder_allocation = effective_supply * bidder_payment / total_payments
  ```

When `fill_min_bps > 0` and raise was partial (but >= min_fill):
- Bidder receives `effective_supply * (bidder_payment / total_payments)`.
- No refund — all contributions within the band are counted in full.

### Backward compatibility

`fill_min_bps = 0` → current 100%-or-void behavior. `fill_max_bps = 0` → no cap.

---

## SDK changes

- `CreateAuctionInput` Raise variant: add `fillMinBps?: number` (default 0), `fillMaxBps?: number` (default 0).
- `CreateAuctionInput` Quadratic variant: same additions.
- `buildCreateAuction` Raise + Quadratic: include new fields in `AuctionConfig` serialisation.
- `buildClaim`: no signature change — auction_id + bid record is sufficient.

---

## Frontend changes

### `RaisePricingStep.tsx` additions

New optional "Insurance band" section (collapsible):
- "Minimum fill" input — percentage (e.g. 80%). Converts to bps internally.
- "Maximum fill" input — percentage (e.g. 120%). Must be ≥ min fill.
- Helper text: "If contributions land between X% and Y% of target, the auction succeeds proportionally."

### `QuadraticPricingStep.tsx` additions

Same "Insurance band" section.

### `WizardForm` additions

```ts
fillMinBps: number   // default: 0 (disabled)
fillMaxBps: number   // default: 0 (disabled)
```

### `build-inputs.ts`

Pass `form.fillMinBps` and `form.fillMaxBps` for Raise and Quadratic variants.

### `ReviewStep`

Show insurance band only when enabled:
```
Insurance band: 80% – 120% of raise target
(Below 80%: voided. Above 120%: excess refunded)
```

### `AuctionDetailPage` / bid history

For partial-fill auctions that closed with `effective_supply < supply`:
- Show "Filled at X%" badge instead of "Sold out" / "Failed".
- Show bidder's effective allocation and any refund amount in claim UI.

---

## Open decisions

1. **Separate `effective_supply` from `AuctionState`**: adds a field; alternatively compute it
   at claim time from `fill_ratio`. Storing it avoids repeated computation and is cleaner.
2. **Quadratic claim calculation**: quadratic uses `sqrt(payment)` for allocation weight.
   With partial fill, the denominator changes — use `effective_fill` as the total to compute
   `fill_ratio`, then apply as a scalar to each bidder's sqrt-weighted allocation. Simpler than
   recomputing sqrt weights.
3. **`fill_max_bps` > 10000**: technically valid (e.g. 120% = 12000 bps). Leo `u16` max is
   65535, so 12000 fits. Validate in `create_auction` that `fill_max_bps >= fill_min_bps`.
4. **Applies to Dutch/Ascending?**: these are price-discovery — every bid clears at the current
   price. "Partial fill" doesn't apply meaningfully. Intentionally out of scope.

---

## Steps

1. Add `fill_min_bps`, `fill_max_bps` to `AuctionConfig` in `raise` and `quadratic` contracts.
2. Add `effective_supply` to `AuctionState` in both contracts.
3. Update `close_auction` finalize in both contracts with band logic.
4. Update `claim` finalize in both contracts to use `effective_supply` + proportional refund.
5. Update `CreateAuctionInput` Raise + Quadratic variants in SDK.
6. Update `buildCreateAuction` serialisation in SDK.
7. Add insurance band section to `RaisePricingStep` and `QuadraticPricingStep`.
8. Add fields to `WizardForm` + `DEFAULT_FORM`.
9. Update `build-inputs.ts`.
10. Update `ReviewStep` and claim UI in `AuctionDetailPage`.
11. Run type-check.
