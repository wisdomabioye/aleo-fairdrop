# Plan: Reputation-gated Priority Window

## Summary

Bidders whose `CreatorStats.filled` count in `fairdrop_proof_v2.aleo` meets a threshold get early
access to an auction. A `priority_window_blocks` value in `AuctionConfig` defines how many blocks
before `start_block` priority bidders can enter. Standard bidders can still bid once `start_block`
is reached — the window is additive, not exclusive.

Applies to all 6 auction contracts (same pattern, small per-contract diff).

---

## Scope

| Layer | Touch |
|---|---|
| Contract (×6) | `AuctionConfig` + `place_bid_*` finalize guard |
| SDK | `buildCreateAuction` — add `priorityWindowBlocks` to all variants |
| Frontend | New field in `GateVestStep` (or `TimingStep`); `build-inputs.ts`; `ReviewStep` |

---

## Contract changes

### `AuctionConfig` addition

```leo
struct AuctionConfig {
    ...existing fields...
    priority_window_blocks: u32,   // NEW — 0 = disabled. Priority bidders can enter this many
                                   //       blocks before start_block.
    priority_threshold:     u64,   // NEW — minimum filled-auction count required for priority.
}
```

### `place_bid_*` finalize (priority guard)

Replace the current open guard:
```leo
assert(block.height >= config.start_block);
```

With:
```leo
if config.priority_window_blocks > 0u32 {
    // Priority bidder: check proof reputation
    let bidder_stats: CreatorStats = fairdrop_proof_v2.aleo::reputation.get_or_use(
        bidder,
        CreatorStats { auctions_run: 0u64, filled: 0u64, volume: 0u128 }
    );
    let is_priority: bool = bidder_stats.filled >= config.priority_threshold;
    let priority_start: u32 = config.start_block - config.priority_window_blocks;
    // Allow priority bidders from priority_start; everyone else from start_block.
    assert(
        (is_priority && block.height >= priority_start)
        || block.height >= config.start_block
    );
} else {
    assert(block.height >= config.start_block);
}
```

> **CPI note**: reading `fairdrop_proof_v2.aleo::reputation` from inside a finalize block is a
> cross-program mapping read. Leo 4.0 supports this with the `::` accessor. No new transition
> needed in the proof contract.

### Backward compatibility

`priority_window_blocks = 0` → existing guard, no behavior change.

---

## SDK changes

- All 6 `CreateAuctionInput` variants: add optional `priorityWindowBlocks?: number` and
  `priorityThreshold?: number` (both default to 0 when absent).
- `buildCreateAuction` per variant: include in `AuctionConfig` struct serialisation.

---

## Frontend changes

### `GateVestStep.tsx` additions

New optional section "Priority Access":
- Toggle: "Enable priority window" (defaults off).
- When enabled: two inputs:
  - "Priority window (blocks)" — how many blocks before start.
  - "Minimum filled auctions" — filled count threshold.
- Helper text: "Bidders who have successfully filled ≥ N auctions on Fairdrop can enter early."

### `WizardForm` additions

```ts
priorityWindowBlocks: number   // default: 0
priorityThreshold: number      // default: 0
```

### `build-inputs.ts`

Pass `form.priorityWindowBlocks` and `form.priorityThreshold` to `buildCreateAuction` for all
auction types.

### `ReviewStep`

Show priority section only when `priorityWindowBlocks > 0`:
```
Priority window: 1440 blocks (~6h early access)
Threshold: ≥ 3 filled auctions
```

---

## Open decisions

1. **Threshold metric**: currently `filled` count is proposed (auctions closed successfully).
   Could use `auctions_run` (broader, easier to meet) or `volume` (favours whales). `filled`
   is the most sybil-resistant without additional data.
2. **Priority window duration guidance**: suggest a default of 1440 blocks (~6h on Aleo).
   Creator can override. Wizard could show "≈ X hours" in-line based on 4-second block time.
3. **Same gate or separate?**: Priority window coexists with gate modes. A Merkle-gated auction
   with a priority window means: priority bidder can enter early *and* must pass Merkle gate.
   This is intentional — the two axes are orthogonal.
4. **`priority_start` underflow**: if `priority_window_blocks > start_block`, subtraction
   underflows. Clamp: `let priority_start = start_block.saturating_sub(priority_window_blocks)`.
   Leo 4.0 has no `saturating_sub` builtin — use explicit guard:
   ```leo
   let priority_start: u32 = config.start_block > config.priority_window_blocks
       ? config.start_block - config.priority_window_blocks
       : 0u32;
   ```

---

## Steps

1. Add `priority_window_blocks` and `priority_threshold` to `AuctionConfig` in all 6 contracts.
2. Update `create_auction` finalize: no validation needed (0 = disabled is valid).
3. Update `place_bid_*` finalize in all 6 contracts with priority guard.
4. Update `CreateAuctionInput` variants in SDK.
5. Update `buildCreateAuction` serialisation in SDK for all 6 variants.
6. Add priority section to `GateVestStep.tsx`.
7. Add fields to `WizardForm` + `DEFAULT_FORM`.
8. Update `build-inputs.ts`.
9. Update `ReviewStep`.
10. Run type-check.
