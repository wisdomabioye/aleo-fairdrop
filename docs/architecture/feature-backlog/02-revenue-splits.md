# Plan: Automatic Revenue Splits

## Summary

Creator configures a split table at `create_auction` time: up to N recipients with basis-point
weights that must sum to 10 000. `withdraw_payments` distributes proportionally in one transaction.
No trust required — allocations are immutable once set and enforced by the contract.

Applies to all 6 auction contracts: `dutch`, `sealed`, `ascending`, `raise`, `lbp`, `quadratic`.

---

## Scope

| Layer | Touch |
|---|---|
| Contract (×6) | Add `SplitEntry[]` to `AuctionConfig`; update `withdraw_payments` |
| SDK | `buildCreateAuction` — add `splits` to every auction variant; `buildWithdrawPayments` |
| Frontend | `GateVestStep` or new `SplitsStep`; `build-inputs.ts`; `ReviewStep` |

---

## Contract changes

### New types

```leo
struct SplitEntry {
    recipient: address,
    bps:       u16,   // basis points (1 = 0.01%)
}

// Fixed-size table; unused slots have bps = 0u16 and a zero address.
// Max N = 5 to stay within Leo's struct size limits.
struct SplitTable {
    entry0: SplitEntry,
    entry1: SplitEntry,
    entry2: SplitEntry,
    entry3: SplitEntry,
    entry4: SplitEntry,
    count:  u8,   // number of active entries (0 = no split, pay creator directly)
}
```

### `AuctionConfig` addition

```leo
struct AuctionConfig {
    ...existing fields...
    splits: SplitTable,   // NEW — 0 count = all revenue to config.creator
}
```

### `create_auction` finalize

Assert split table is valid when `count > 0`:

```
if splits.count > 0u8 {
    let total_bps: u16 = sum of entry.bps for entries 0..count-1;
    assert_eq(total_bps, 10000u16);
    assert(splits.count <= 5u8);
}
```

### `withdraw_payments` finalize

Replace single `transfer_public` call with split-aware distribution.
Caller passes `amount` = total to distribute. Contract divides proportionally
and issues one `credits.aleo::transfer_public` per active entry.

```
if config.splits.count == 0u8 {
    // Existing behaviour: pay caller (creator)
    transfer_public(caller, amount);
} else {
    // Distribute proportionally
    let share0: u128 = amount * config.splits.entry0.bps as u128 / 10000u128;
    transfer_public(config.splits.entry0.recipient, share0);
    // ... repeat for entries 1-4 if count > 1 ...
    // Remainder (rounding dust) goes to the first entry to avoid locked funds.
}
```

> **Rounding**: integer division truncates; accumulate dust and credit it to entry0 so total
> distributed == amount. Invariant: sum of shares = amount.

### Backward compatibility

`splits.count = 0` → identical to today's behavior. No migration needed for existing auctions.

---

## SDK changes

- All 6 `CreateAuctionInput` variants: add optional `splits?: Array<{ recipient: string; bps: number }>`
- `buildCreateAuction` per variant: serialise `SplitTable` struct. If `splits` is undefined or empty,
  serialise with `count: 0` and zero-address entries.
- `buildWithdrawPayments`: no signature change needed — amount + auction_id is unchanged.
- Add `serialiseSplitTable(splits)` helper in `format.ts` or `create.ts`.

---

## Frontend changes

### New `SplitsStep.tsx` (or section inside `GateVestStep`)

- "Add revenue recipient" button, up to 5 entries.
- Per-entry: address input + bps input.
- Live validation: sum must equal 10 000 bps (100%).
- "Distribute evenly" helper button: sets all active entries to `10000 / n` bps.
- If no entries added: creator receives 100% (default).

### `WizardForm` additions

```ts
splits: Array<{ recipient: string; bps: number }>  // default: []
```

### `build-inputs.ts`

Pass `form.splits` to `buildCreateAuction` for every auction type.

### `ReviewStep`

Show split table if `splits.length > 0`:
```
Revenue splits: 3 recipients
  0x1234…abcd — 60% (6000 bps)
  0x5678…efgh — 30% (3000 bps)
  0x9abc…ijkl — 10% (1000 bps)
```

---

## Open decisions

1. **Max entries**: 5 is the suggested cap. Leo 4.0 does not support dynamic arrays in structs;
   fixed-size is required. Could lower to 3 if struct size becomes a concern.
2. **Rounding dust destination**: Plan routes dust to `entry0` (typically the creator). Alternatively
   burn it by leaving in escrow — but that means `creator_withdrawn` can never reach `creator_revenue`,
   breaking the invariant. Dust-to-entry0 is cleaner.
3. **Partial `withdraw_payments` calls**: if creator calls with `amount < creator_revenue` in
   multiple calls, each call distributes proportionally. This is correct — no change needed.
4. **Who can call `withdraw_payments`?**: Currently gated to `config.creator`. With splits, anyone
   should be able to trigger distribution (the split table dictates destinations, not the caller).
   Consider removing the `assert_eq(caller, config.creator)` guard when `count > 0`.

---

## Steps

1. Define `SplitEntry` and `SplitTable` structs in each of the 6 auction contracts.
2. Add `splits: SplitTable` field to `AuctionConfig` in each contract.
3. Update `create_auction` finalize: validate split bps sum when `count > 0`.
4. Update `withdraw_payments` transition and finalize in each contract with proportional distribution.
5. Add `serialiseSplitTable` helper to SDK `format.ts`.
6. Update `CreateAuctionInput` variants and `buildCreateAuction` serialisation in SDK.
7. Build `SplitsStep.tsx` UI component with live bps validation.
8. Wire `SplitsStep` into the wizard, add to `WizardForm` + `DEFAULT_FORM`.
9. Update `build-inputs.ts` to pass `splits`.
10. Update `ReviewStep` to display split table.
11. Run type-check.
