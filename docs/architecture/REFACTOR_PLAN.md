# Fairdrop Frontend & SDK — Refactor Plan

> **Goal:** Eliminate scattered type-guard patches, enforce DRY across all layers, and reduce the cost of adding a new auction type from ~20 manual touch-points to ~8.
>
> All changes are non-breaking — the existing feature set does not change. Work through phases in order; each phase builds on the previous.

---

## Background: the current pain

Every time a new auction type shares behaviour with an existing one (e.g. Quadratic shares Raise's payments-based model), we had to patch the same `isRaise || isQuadratic` guard in six or more places:

- `ActionsPanel.tsx` — canClose logic
- `AuctionEarnTab.tsx` — canCloseNow logic
- `AuctionCard.tsx` — progress label
- `AuctionInfoTab.tsx` — min/max bid unit labels, fillMinBps row
- `AuctionHeader.tsx` — raise-target stat
- `TimingStep.tsx` — min/max contribution label
- `RaisePricePanel`, `QuadraticPricePanel` — mirrored implementations

The root cause is that **per-type behavioral metadata lives nowhere** — it is reconstructed ad-hoc by every component that needs it. The fix is to centralise it in the one place that already exists for this purpose: `registry.ts`.

---

## Phase 1 — Registry-as-Capabilities

**Files:** `apps/frontend/src/features/auctions/registry.ts`

### 1.1 Add capability flags to `AuctionTypeSlot`

```ts
export interface AuctionTypeSlot {
  type:          AuctionType;
  label:         string;
  color:         string;
  description:   string;
  BidForm:       ComponentType<BidFormProps>;
  PricePanel:    ComponentType<PricePanelProps>;
  ProgressPanel: ComponentType<ProgressPanelProps>;
  PricingStep:   ComponentType<PricingStepProps>;   // Phase 3

  // ── Capability flags ──────────────────────────────────────────────
  /** True for Raise + Quadratic: bids are ALEO payments, not token quantities. */
  isContributionType:     boolean;
  /** True for types with a raise target (Raise, Quadratic). */
  hasRaiseTarget:     boolean;
  /** True for types that support fill_min_bps partial fill. */
  hasFillThreshold:   boolean;
  /** True for types that can close early on supply_met (Dutch, Ascending, Raise). */
  supportsEarlyClose: boolean;
  /** True for types where price decays/rises over time (Dutch, Sealed, Ascending, LBP). */
  hasPriceCurve:      boolean;
}
```

### 1.2 Populate flags for each type

| Type | isContributionType | hasRaiseTarget | hasFillThreshold | supportsEarlyClose | hasPriceCurve |
|---|---|---|---|---|---|
| Dutch | false | false | false | true | true |
| Sealed | false | false | false | true | true |
| Raise | **true** | **true** | **true** | **true** | false |
| Ascending | false | false | false | true | true |
| LBP | false | false | false | false | true |
| Quadratic | **true** | **true** | **true** | false | false |

### 1.3 Replace all ad-hoc type guards

Every `auction.type === AuctionType.Raise || auction.type === AuctionType.Quadratic` across the app becomes:

```ts
const slot = getRegistrySlot(auction.type);
if (slot?.isContributionType) { ... }
```

Touch-points to update (mechanical find-and-replace):
- `ActionsPanel.tsx` — `fillThresholdMet` condition
- `AuctionEarnTab.tsx` — `fillThresholdMet` + `canCloseNow`
- `AuctionCard.tsx` — progress label
- `AuctionInfoTab.tsx` — bid unit labels, fillMinBps row visibility
- `AuctionHeader.tsx` — raise-target stat visibility
- `TimingStep.tsx` — min/max contribution label

After Phase 1: adding a 7th payments-type requires setting `isContributionType: true` in the registry. Zero component changes.

---

## Phase 2 — Clean `AuctionView` Interface

**Files:** `packages/types/src/domain/auction.ts`, `services/api/src/mappers/auction.ts`

### Problem

`AuctionView` has grown flat nullable fields for each mechanism-specific feature:

```ts
raiseTarget:     bigint | null;  // Raise + Quadratic only
fillMinBps:      number | null;  // Raise + Quadratic only
effectiveSupply: bigint | null;  // Raise + Quadratic only
```

As more mechanism-specific features land this pattern keeps growing, and the relationship between fields is only communicated by comments.

### 2.1 Group into a mechanism sub-object

```ts
export interface RaiseMechanismFields {
  raiseTarget:     bigint;
  fillMinBps:      number;        // 0 = disabled
  effectiveSupply: bigint | null; // null until cleared
}

export interface AuctionView {
  // ...all existing fields...

  // Replace three flat nullable fields with one optional sub-object.
  // Present only for AuctionType.Raise and AuctionType.Quadratic.
  raise?: RaiseMechanismFields;
}
```

### 2.2 Update the mapper

```ts
raise: isContributionType ? {
  raiseTarget:     BigInt(row.raiseTarget ?? '0'),
  fillMinBps:      row.fillMinBps ?? 0,
  effectiveSupply: row.effectiveSupply != null ? BigInt(row.effectiveSupply) : null,
} : undefined,
```

### 2.3 Update all consumers

Replace `auction.raiseTarget` → `auction.raise?.raiseTarget`, etc.

The presence of `auction.raise` becomes the type-safe signal that the auction is a raise-type mechanism — no flag check required:

```tsx
{auction.raise && (
  <InlineStat label="Raise target" value={formatMicrocredits(auction.raise.raiseTarget)} />
)}
```

After Phase 2: the `AuctionView` interface is self-documenting. Future mechanism-specific fields for other types follow the same `mechanism?` sub-object pattern.

---

## Phase 3 — Wizard Registration

**Files:** `apps/frontend/src/features/auctions/registry.ts`, `wizard-steps/PricingStep.tsx`

### Problem

`PricingStep.tsx` dispatches via a `switch (form.auctionType)` that must be kept in sync with the registry manually. The wizard's `ReviewStep` and `build-inputs.ts` have the same switch-per-type structure.

### 3.1 Add `PricingStep` to the registry slot

```ts
import type { PricingStepProps } from './pricing-steps/types';

export interface AuctionTypeSlot {
  // ...
  PricingStep: ComponentType<PricingStepProps>;
}
```

Register each type's pricing step directly:

```ts
[AuctionType.Raise]: {
  // ...
  PricingStep: RaisePricingStep,
},
```

### 3.2 `PricingStep.tsx` becomes a single line

```tsx
export function PricingStep({ form, onChange }: StepProps) {
  const slot = getRegistrySlot(form.auctionType);
  if (!slot) return null;
  const { PricingStep: TypePricingStep } = slot;
  return <TypePricingStep value={form.pricing} onChange={(p) => onChange({ pricing: p })} />;
}
```

### 3.3 Unify `build-inputs.ts` dispatch

Move the `buildCreateAuction` call into each `PricingStep` or export a `buildInputs(form)` method from each pricing step module. The top-level `build-inputs.ts` becomes:

```ts
export function buildInputsForAuction(form: WizardForm): TxSpec {
  const slot = getRegistrySlot(form.auctionType);
  return slot.buildInputs(form); // each type owns its own builder
}
```

### 3.4 `ReviewStep` — extract per-type pricing rows

Each `PricingStep` module exports a `PricingReviewRows` component:

```tsx
// RaisePricingStep.tsx
export function PricingReviewRows({ value }: { value: RaisePricingValues }) {
  return (
    <>
      <ReviewRow label="Raise target" value={`${value.raiseTarget} ALEO`} />
      {value.fillMinBpsEnabled && <ReviewRow label="Min fill" value={`${value.fillMinBps}%`} />}
    </>
  );
}
```

`ReviewStep.tsx` dispatches via registry:

```tsx
const slot = getRegistrySlot(form.auctionType);
return <slot.PricingReviewRows value={form.pricing} />;
```

After Phase 3: adding a new auction type requires **zero changes** to `PricingStep`, `ReviewStep`, or `build-inputs`. Only the new type's own files and the registry slot registration.

---

## Phase 4 — SDK Type Safety

**Files:** `packages/sdk/src/transactions/auction.ts`, `packages/sdk/src/transactions/claim.ts`

### 4.1 Fix `closeAuction` — derive `filled` explicitly

Current code:
```ts
String(auction.status === AuctionStatus.Clearing)  // implicit, fragile
```

With partial fill early close, status can be `Active` when close is valid. `filled` must always equal `state.supply_met`, which the API maps from `row.supplyMet`. Add `supplyMet` to `AuctionView` and derive from it:

```ts
// domain/auction.ts
export interface AuctionView {
  // ...
  supplyMet: boolean;  // state.supply_met; true only when total_payments >= raise_target
}

// auction.ts SDK
inputs: [
  auction.id,
  auction.creator,
  String(auction.supplyMet),           // filled = state.supply_met — always correct
  `${auction.totalPayments}u128`,
  `${auction.closerReward}u128`,
],
```

### 4.2 Make `claimBid` / `claimVested` type-safe at the function signature

Currently a single function with a runtime switch and nullable params:

```ts
claimBid(auction, record, totalSqrtWeight?, fee?)
```

Consider overloads or separate per-type functions:

```ts
claimRaiseBid(auction: AuctionView & { raise: RaiseMechanismFields }, record, fee?)
claimQuadraticBid(auction, record, totalSqrtWeight: bigint, fee?)
```

This pushes the "is raise cleared?" null-check out of the SDK and into the call site where the compiler can enforce it.

### 4.3 Validate `fill_min_bps` client-side in SDK

The `buildCreateAuction` builder currently passes `fillMinBps` raw. Add a guard:

```ts
if (p.fillMinBps != null && (p.fillMinBps < 0 || p.fillMinBps > 10000)) {
  throw new Error(`fillMinBps must be 0–10000, got ${p.fillMinBps}`);
}
```

---

## Phase 5 — Indexer + Mapper DRY

**Files:** `services/indexer/src/handlers/auction.ts`, `services/api/src/mappers/auction.ts`

### 5.1 Indexer: extract a per-type config parser map

Currently `fetchConfig` returns one large flat object regardless of type. Extract type-specific fields into a discriminated helper:

```ts
const TYPE_CONFIG_FIELDS: Record<string, (f: Record<string, string>) => object> = {
  raise:     (f) => ({ raise_target: optU128(f, 'raise_target'), fill_min_bps: optU16(f, 'fill_min_bps') }),
  quadratic: (f) => ({ raise_target: optU128(f, 'raise_target'), fill_min_bps: optU16(f, 'fill_min_bps') }),
  dutch:     (f) => ({ start_price: optU128(f, 'start_price'), floor_price: ... }),
  // etc.
};
```

This makes the parser self-documenting per type and avoids `optU128` calls for fields that don't exist on a given type.

### 5.2 Mapper: move `buildParams` out of `auction.ts`

`buildParams` is 60+ lines of switch logic inside the mapper file. Extract to `packages/sdk/src/parse/params.ts` alongside `parseAuctionConfig` — it belongs in the SDK layer, not the API mapper.

### 5.3 API mapper: split into per-concern helpers

`toAuctionView` is a 50-line flat function. Extract:

```ts
function toSupplyFields(row): Pick<AuctionView, 'supply' | 'totalCommitted' | 'totalPayments' | ...>
function toTimingFields(row, ctx): Pick<AuctionView, 'startBlock' | 'endBlock' | ...>
function toRevenueFields(row): Pick<AuctionView, 'creatorRevenue' | 'protocolFee' | ...>
function toRaiseFields(row): RaiseMechanismFields | undefined
```

`toAuctionView` becomes a composition of these:

```ts
export function toAuctionView(row, ctx, metaRow, tokenInfo): AuctionView {
  return {
    ...toSupplyFields(row),
    ...toTimingFields(row, ctx),
    ...toRevenueFields(row),
    raise: toRaiseFields(row),
    // ...
  };
}
```

---

## Phase 6 — Adding a New Auction Type: ideal checklist post-refactor

After Phases 1–5, adding a 7th type requires touching exactly:

### Contract layer
- [ ] New Leo contract (`contracts/auctions/<type>/src/main.leo`)
- [ ] `packages/types/src/contracts/auctions/<type>.ts`
- [ ] `packages/types/src/domain/auction.ts` — extend `AuctionParams` union

### SDK layer
- [ ] `packages/sdk/src/transactions/create.ts` — add case
- [ ] `packages/sdk/src/transactions/bid.ts` — add to `BidParams` if needed
- [ ] `packages/sdk/src/transactions/claim.ts` — add case

### Data layer
- [ ] `packages/database/src/schema/auctions.ts` — new type-specific columns if any
- [ ] `services/indexer/src/handlers/auction.ts` — extend type config parser map (Phase 5.1)
- [ ] `services/api/src/mappers/auction.ts` — add `buildParams` case

### Frontend (all self-contained)
- [ ] New `<Type>BidForm.tsx`
- [ ] New `<Type>PricePanel.tsx`
- [ ] New `<Type>ProgressPanel.tsx`
- [ ] New `<Type>PricingStep.tsx` (with `PricingReviewRows` + `buildInputs` exports)
- [ ] `registry.ts` — register the slot with all capability flags

### Zero changes required (covered by registry)
- `PricingStep.tsx` ✓
- `ReviewStep.tsx` ✓
- `build-inputs.ts` ✓
- All `isContributionType` / `hasRaiseTarget` guards ✓
- `ActionsPanel`, `AuctionEarnTab`, `AuctionCard`, `AuctionInfoTab`, `AuctionHeader`, `TimingStep` ✓

---

## Summary: DRY violations eliminated

| Pattern | Current state | After refactor |
|---|---|---|
| `isRaise \|\| isQuadratic` type guards | Scattered in 6+ components | Single `slot.isContributionType` from registry |
| Wizard dispatch (`switch auctionType`) | Duplicated in `PricingStep`, `ReviewStep`, `build-inputs` | Eliminated — registry-driven |
| `raiseTarget / fillMinBps / effectiveSupply` nullable fields | 3 flat top-level nullables on `AuctionView` | Single `raise?` sub-object |
| `buildParams` logic | Inside API mapper | SDK layer (`parse/params.ts`) |
| `toAuctionView` monolithic function | 50-line flat function | Composed from typed sub-helpers |
| `closeAuction` `filled` derivation | Implicit status comparison | Explicit `supplyMet` field |
| Per-type config parsing in indexer | One flat parser for all types | Per-type field map |

---

## Implementation order

```
Phase 1 (capability flags)     — highest leverage, purely additive, no breaking changes
Phase 2 (AuctionView cleanup)  — requires updating all auction.raise?.* call sites
Phase 3 (wizard registration)  — requires Phases 1 + 2 complete
Phase 4 (SDK type safety)      — independent, can run in parallel with Phase 2
Phase 5 (indexer/mapper DRY)   — independent, can run in parallel with Phase 3
Phase 6 is not a phase to implement — it is the result
```
