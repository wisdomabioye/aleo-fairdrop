# Plan: Anti-Sniping Extension

## Summary

When a bid lands within the final `extension_window` blocks of an ascending auction, the effective end
block is pushed forward by `extension_blocks`. Prevents last-second bot sniping. Applies to
`fairdrop_ascending_v3.aleo` only — other auction types do not have a "last-second" problem.

---

## Scope

| Layer | Touch |
|---|---|
| Contract | `fairdrop_ascending_v3.aleo` — AscendingParams, AuctionState, place_bid_*, close_auction |
| SDK | `@fairdrop/sdk/transactions` — update `buildCreateAuction` AscendingInput type + `buildPlaceBid` |
| Frontend | `AscendingPricingStep`, `build-inputs.ts`, auction detail countdown display |

---

## Contract changes

### New fields on `AscendingParams`

```leo
struct AscendingParams {
    floor_price:       u128,
    ceiling_price:     u128,
    price_rise_blocks: u32,
    price_rise_amount: u128,
    extension_window:  u32,   // NEW — blocks before end that trigger extension (0 = disabled)
    extension_blocks:  u32,   // NEW — how many blocks to add per trigger
    max_end_block:     u32,   // NEW — hard cap on how far end_block can extend
}
```

### New field on `AuctionState`

```leo
struct AuctionState {
    ...existing fields...
    effective_end_block: u32,  // NEW — mutable end block; initialised to config.end_block
}
```

### `create_auction` finalize

Initialise `state.effective_end_block = config.end_block`.

### `place_bid_*` finalize (extension logic)

```
if config.extension_window > 0u32
   && block.height >= state.effective_end_block - config.extension_window
   && block.height < state.effective_end_block {
       let new_end = state.effective_end_block + config.extension_blocks;
       state.effective_end_block = min(new_end, config.max_end_block);
}
```

Replace `block.height < config.end_block` guard with `block.height < state.effective_end_block`.

### `close_auction` finalize

Replace `block.height >= config.end_block` with `block.height >= state.effective_end_block`.

---

## SDK changes

- `CreateAuctionInput` Ascending variant: add `extensionWindow: number`, `extensionBlocks: number`, `maxEndBlock: number`
- `buildCreateAuction` Ascending case: include new fields in `AscendingParams` struct serialisation
- `AscendingPricingValues` (frontend types): add three new string fields
- `AscendingPricingStep`: add UI for the new fields (optional — 0 disables)

---

## Frontend changes

- `AscendingPricingStep.tsx` — three new optional inputs (extension window, extension blocks, max end block). Pre-fill with sensible defaults (e.g. 60 blocks / 120 blocks / end_block + 720).
- `build-inputs.ts` — pass new fields through.
- `AuctionDetailPage` / countdown: read `state.effective_end_block` from indexer (not `config.end_block`) for the live countdown display.
- Indexer: expose `effective_end_block` from `AuctionState` in the auction view.

---

## Open decisions

1. **Default values** — What should the wizard pre-fill? Suggested: window=60 blocks (~15 min), extend=120 blocks (~30 min), max=end_block+1440 (~6h cap). Creator can override.
2. **Extension on every bid or once per window?** — Current plan extends on every qualifying bid. This means a determined bidder can repeatedly extend. Capping via `max_end_block` is the guard.
3. **`extension_window = 0` disables entirely** — this preserves full backward compatibility; existing auctions with 0 behave identically to current behavior.

---

## Steps

1. Update `AscendingParams` and `AuctionState` structs in the Leo contract.
2. Update `create_auction` finalize to initialise `effective_end_block`.
3. Update `place_bid_*` finalize with extension logic.
4. Update `close_auction` finalize to read `effective_end_block`.
5. Update SDK `CreateAuctionInput` type and `buildCreateAuction` serialisation.
6. Update `AscendingPricingValues` type and step UI.
7. Update `build-inputs.ts`.
8. Update indexer to surface `effective_end_block` in `AuctionView`.
9. Update auction detail countdown to use `effective_end_block`.
10. Run type-check.