# WEB_DESIGN.md — apps/web Frontend Architecture

> Design and migration plan for the `apps/web` frontend.
> All function names, contract params, and transitions are verified against actual Leo source.
> See [`DESIGN.md`](DESIGN.md) for protocol-level design; this doc covers the frontend only.

---

## 1. Scope

The existing frontend lives at `/home/abioye/aleo-guide/fairdrop/` (single-contract, legacy). It will be migrated to `apps/web` inside the monorepo. This document:

- Identifies every verified gap, bug, DRY violation, and type drift
- Defines the target architecture for `apps/web`
- Specifies what moves to `packages/sdk`, `packages/ui`, `packages/types`, `packages/config`
- Designs the data layer, state management, routing, and all major feature pages
- Defines the user-facing guide structure in `docs/guides/`

---

## 2. Gap & Issues Assessment (Legacy `/fairdrop`)

### 2.1 DRY Violations

| Violation | Legacy location | Canonical home |
|---|---|---|
| Leo value parsers (`parseU128`, `parseField`, `parseBool`, etc.) | `src/shared/utils/leo.ts` | `packages/sdk/src/parse/leo.ts` ✓ (merge `parsePlaintext` → `parseStruct`) |
| Auction struct parsers (`parseAuctionConfig`, `parseAuctionState`) | `src/shared/lib/auctionParsers.ts` | `packages/sdk/src/parse/` |
| Token metadata parsers (`parseTokenMetadata`, `asciiToU128`, `u128ToAscii`) | `src/shared/lib/auctionParsers.ts` | `packages/sdk/src/parse/` |
| Token registry queries (`fetchTokenMetadata`, `fetchTokenBalance`, etc.) | `src/shared/lib/tokenRegistry.ts` | `packages/sdk/src/registry/` |
| Credits payment helpers (`microToAleo`, `formatMicrocredits`, etc.) | `src/shared/lib/paymentToken.ts` | `packages/sdk/src/credits/` |
| Amount formatting (`formatAmount`, `parseTokenAmount`, `truncateAddress`) | `src/shared/utils/formatting.ts` | `packages/sdk/src/format/` |
| Auction config localStorage cache | `src/shared/lib/auctionConfigCache.ts` | Delete — TanStack Query replaces this |
| `AleoNetworkClient` singleton | `src/shared/lib/networkClient.ts` | `packages/sdk/src/client.ts` |

### 2.2 Type Drift

| Local type | Conflicts with | Impact |
|---|---|---|
| `src/shared/types/auction.ts::AuctionConfig` | Dutch-only fields, missing `commit_end_block`, `slash_reward_bps`, `raise_target`, etc. | Detail page broken for 5 of 6 auction types |
| `src/shared/types/auction.ts::AuctionStatus` | `@fairdrop/types/domain::AuctionStatus` (different variants) | Status logic diverges |
| `src/shared/types/token.ts::TokenMetadata` | `@fairdrop/types/domain::TokenInfo` | Duplicated, will drift |

**Resolution**: delete all local types in `src/shared/types/`; import exclusively from `@fairdrop/types/*`.

### 2.3 Missing Features

| Feature | Status | Source |
|---|---|---|
| Referral code creation, link generation, commission tracking | Missing | `fairdrop_ref.aleo/create_code`, `claim_commission` |
| Slash unrevealed commitments (sealed auctions) | Missing | `fairdrop_sealed.aleo/slash_unrevealed` |
| Close abandoned auction for reward (closer reward) | Missing | any `close_auction` (closer ≠ creator) |
| Vesting schedule display & token release | Missing | `fairdrop_vest.aleo/release` |
| Gate verification — Merkle proof submission | Missing | `fairdrop_gate.aleo/verify_merkle` |
| Gate verification — Credential presentation | Missing | `fairdrop_gate.aleo/verify_credential` |
| Participation receipt display (auto-issued; no user action) | Missing | `fairdrop_proof.aleo/ParticipationReceipt` records in wallet |
| Creator reputation display | Missing | `fairdrop_proof.aleo/reputation` mapping |
| BidForm for: Raise, Sealed (commit/reveal), Ascending, LBP, Quadratic | Missing | respective auction programs |
| PriceChart for Ascending (rising price) | Missing | |
| Create auction form variants (all 6 types) | Stub only | |
| `claim_commit_voided` for sealed bid cancel flow | Missing | `fairdrop_sealed.aleo/claim_commit_voided` |
| Search connecting to services/api | Missing | `GET /auctions?q=` |
| Pagination for auction listing (API-driven) | Direct-chain N+50 RPC calls | `GET /auctions` |
| `credit_commission` permissionless step (call before `claim_commission`) | Missing | `fairdrop_ref.aleo/credit_commission` |
| Admin panel for `set_allowed_caller` + `fairdrop_config.aleo` management | Missing | all utility contracts |

### 2.4 Scalability Issues

| Issue | Impact | Fix |
|---|---|---|
| `useAuctions` does 50+ parallel RPC calls (auction_index + state per auction) | Rate limit breach | Replace with `GET /auctions` |
| Manual fetch hooks (useState+useEffect), no deduplication | Double-fetching same data | TanStack Query |
| Module-level token metadata cache (page-load lifetime) | Re-fetched on navigation | TanStack Query with `staleTime` |
| localStorage cache keyed by `total_auctions` | Entire cache invalidated on any new auction | Per-item TanStack Query cache |
| No route-level error boundary | One broken component kills entire page | `<ErrorBoundary>` per route |
| `useStats` polls every 15s, no AbortController | Memory/network leak on unmount | TanStack Query cleanup |
| `TransactionTracker` polling not cleaned up on unmount | Memory leak | Fix teardown in `useEffect` |

### 2.5 Verified Bugs

| Bug | Location | Verified against |
|---|---|---|
| Detail page assumes Dutch price logic for all auction types | `useCurrentPrice.ts`, `PriceChart.tsx` | Sealed uses Dutch price at `commit_end_block`; ascending rises; raise is fixed |
| `BidForm` only handles Dutch (quantity × price) | `BidForm.tsx` | Raise = payment only; Sealed = commit hash; Ascending = qty×price; LBP/Quadratic differ |
| `claim_commit_voided` missing from Claim flow | `ClaimPage.tsx` | Sealed bidders holding Commitment (not yet revealed) call this, not `claim_voided` |
| `claim_commission` called wrong (was "withdraw_commission") | WEB_DESIGN v1 | Confirmed: `fairdrop_ref.aleo/claim_commission(code, claimed_amount)` |
| Vesting release called wrong (was "claim_vested") | WEB_DESIGN v1 | Confirmed: `fairdrop_vest.aleo/release(vest, amount)` |
| `ParticipationReceipt` described as user-mintable | WEB_DESIGN v1 | Auto-issued by CPI at `commit_bid`/`place_bid` — no user action |
| No `auction_id` URL param format validation | `AuctionDetailPage` | A bad field causes unhandled RPC error |
| `AleoWorker` singleton never terminated | `AleoWorker.ts` | Memory/thread leak |

---

## 3. Monorepo Integration — What Goes Where

### 3.1 packages/sdk

```
packages/sdk/src/
├── parse/
│   ├── leo.ts          — parsers + parseU64 + u128ToBigInt + isValidField() + fieldToHex()
│   ├── auction.ts      — parseAuctionConfig, parseAuctionState (from auctionParsers.ts)
│   └── token.ts        — parseTokenMetadata, asciiToU128, u128ToAscii
├── registry/
│   └── token.ts        — fetchTokenMetadata, fetchTokenBalance, fetchTokenRole, computeTokenOwnerKey
├── credits/
│   └── index.ts        — microToAleo, aleoToMicro, formatMicrocredits, isCreditsToken
├── format/
│   ├── index.ts        — formatAmount, parseTokenAmount, truncateAddress, formatField
│   ├── blocks.ts       — estimateDate(targetBlock, currentBlock, now?): Date
│   └── url.ts          — sanitizeExternalUrl(raw): string | null (https-only allowlist)
├── cache/              — persistent cache layer (see §6.4); no React dependency
│   ├── persist.ts      — localStorage abstraction with versioning + TTL support
│   ├── auction-config.ts
│   ├── auction-index.ts
│   ├── token-meta.ts
│   ├── gate-config.ts
│   └── protocol-config.ts
├── constants.ts        — SYSTEM_PROGRAMS (token_registry.aleo, credits.aleo)
└── client.ts           — AleoNetworkClient singleton
```

`PROGRAMS` from `@fairdrop/config` covers all Fairdrop-owned deployments. Aleo protocol programs (`token_registry.aleo`, `credits.aleo`) are canonical constants that never change — they live in `packages/sdk/src/constants.ts` and are imported alongside `PROGRAMS`:

```ts
// packages/sdk/src/constants.ts
export const SYSTEM_PROGRAMS = {
  tokenRegistry: 'token_registry.aleo',
  credits:       'credits.aleo',
} as const
```

Rule: **no program ID string literals anywhere in app code**. All program references go through `PROGRAMS.*` or `SYSTEM_PROGRAMS.*`.

#### Program addresses

`token_registry.aleo/set_role` and `token_registry.aleo/roles` take an `address` argument (the `aleo1...` form), not the program ID string. Every `ProgramEntry` in `@fairdrop/config` carries both:

```ts
// packages/config/src/types.ts
interface ProgramEntry {
  programId:      string;   // e.g. "fairdrop_dutch.aleo"
  programAddress: string;   // e.g. "aleo1..."  — deterministic, filled in programs.json
  salt?:          string;
}
```

Addresses are pre-computed off-chain (Aleo CLI: `leo account program-address <programId>`) and committed to `contracts/deployments/programs.json`. The wizard authorization step uses `PROGRAMS.dutch.programAddress` — never the `.aleo` name string.

### 3.2 packages/ui

Already has base Radix/shadcn + fairdrop-specific components. Add from legacy:

| Legacy | Target |
|---|---|
| `ui/Spinner.tsx` | `packages/ui/src/ui/spinner.tsx` |
| `ui/ProgressBar.tsx` | `packages/ui/src/ui/progress.tsx` |
| `ui/DataRow.tsx` | `packages/ui/src/ui/data-row.tsx` |
| `ui/PageHeader.tsx` | `packages/ui/src/ui/page-header.tsx` |
| `ui/TokenAmountInput.tsx` | `packages/ui/src/fairdrop/token-amount-input.tsx` |
| `ui/CopyField.tsx` | `packages/ui/src/fairdrop/copy-field.tsx` |

### 3.3 packages/types

Use as-is. Delete all local types in `fairdrop/src/shared/types/`. Import:
```ts
import type { AuctionView, AuctionListItem, AuctionType, AuctionStatus } from '@fairdrop/types/domain'
import type { Page, AuctionListParams }                                  from '@fairdrop/types/api'
```

### 3.4 packages/config

Replace `src/config/network.ts` entirely. Config reads env via Vite:
```ts
import { PROGRAMS }     from '@fairdrop/config'  // static — no setup
import { defineConfig } from '@fairdrop/config'  // call once at entry with import.meta.env.*
```

### 3.5 Environment Configuration

`apps/web` reads all env vars via `import.meta.env.VITE_*`. Validation is centralised in `apps/web/src/env.ts` — it throws at module load time if any required variable is absent, preventing silent misconfiguration.

```ts
// apps/web/src/env.ts
function requireEnv(key: string): string {
  const value = import.meta.env[key]
  if (!value) throw new Error(`Missing required env var: ${key}`)
  return value
}

export const env = {
  network:     requireEnv('VITE_ALEO_NETWORK') as 'testnet' | 'mainnet',
  rpcUrl:      requireEnv('VITE_ALEO_RPC_URL'),
  apiUrl:      requireEnv('VITE_API_URL'),
  ipfsGateway: requireEnv('VITE_IPFS_GATEWAY'),  // e.g. https://gateway.pinata.cloud/ipfs/
}
```

`.env.example` committed to repository (real values excluded from version control):

```dotenv
VITE_ALEO_NETWORK=testnet
VITE_ALEO_RPC_URL=https://api.testnet.aleoscan.io/v1
VITE_API_URL=http://localhost:3001
VITE_IPFS_GATEWAY=https://gateway.pinata.cloud/ipfs/
```

| Variable | Required | Description |
|---|---|---|
| `VITE_ALEO_NETWORK` | Yes | `testnet` or `mainnet` — drives network badge, explorer links |
| `VITE_ALEO_RPC_URL` | Yes | Aleo node RPC endpoint for direct chain reads |
| `VITE_API_URL` | Yes | Base URL for `services/api` — all HTTP auction/token data |
| `VITE_IPFS_GATEWAY` | Yes | IPFS HTTP gateway — logo and metadata retrieval |

---

## 4. Rendering Strategy — No if/else Proliferation

### 4.1 The Problem

Having `if (auction.type === 'dutch') { ... } else if (auction.type === 'raise') { ... }` scattered across components is a maintenance disaster — adding a 7th type requires hunting these branches across the codebase.

### 4.2 Solution: Registry Pattern

Define one registry of per-type component slots. Each type contributes its own implementation. Host components never contain type-specific logic — they only pick from the registry.

```ts
// features/auctions/registry.ts
export interface AuctionTypeSlot {
  BidForm:       React.ComponentType<BidFormProps>
  PricePanel:    React.ComponentType<PricePanelProps>
  ProgressPanel: React.ComponentType<ProgressPanelProps>
  PricingStep:   React.ComponentType<PricingStepProps>  // wizard step 3
  bidLabel:      string   // "Place Bid" | "Commit Bid" | "Place Offer"
}

export const AUCTION_REGISTRY: Record<AuctionType, AuctionTypeSlot> = {
  [AuctionType.Dutch]:     { BidForm: DutchBidForm,     PricePanel: DutchPricePanel,     ... },
  [AuctionType.Sealed]:    { BidForm: SealedBidForm,    PricePanel: SealedPricePanel,    ... },
  [AuctionType.Raise]:     { BidForm: RaiseBidForm,     PricePanel: RaisePricePanel,     ... },
  [AuctionType.Ascending]: { BidForm: AscendingBidForm, PricePanel: AscendingPricePanel, ... },
  [AuctionType.Lbp]:       { BidForm: LbpBidForm,       PricePanel: LbpPricePanel,       ... },
  [AuctionType.Quadratic]: { BidForm: QuadraticBidForm, PricePanel: QuadraticPricePanel, ... },
}
```

TypeScript enforces that the registry is exhaustive — a missing `AuctionType` is a compile error. At runtime however, API data can carry an unknown type (e.g. new type before frontend update). Always access the registry through `getRegistrySlot`:

```ts
// features/auctions/registry.ts
export function getRegistrySlot(type: AuctionType): AuctionTypeSlot | null {
  return AUCTION_REGISTRY[type] ?? null
}
```

Usage:
```tsx
const slot = getRegistrySlot(auction.type)
if (!slot) return <UnsupportedAuctionType type={auction.type} />
<slot.BidForm auction={auction} records={records} blockHeight={blockHeight} />
<slot.PricePanel auction={auction} blockHeight={blockHeight} />
```

### 4.3 Folder Structure

Flat, two levels deep. All types live in one directory, suffixed by type:

```
features/auctions/
├── registry.ts                    # AUCTION_REGISTRY + slot interface
├── bid-forms/
│   ├── DutchBidForm.tsx
│   ├── SealedBidForm.tsx          # handles commit + reveal phases internally
│   ├── RaiseBidForm.tsx
│   ├── AscendingBidForm.tsx
│   ├── LbpBidForm.tsx
│   └── QuadraticBidForm.tsx
├── price-panels/
│   ├── DutchPricePanel.tsx
│   ├── SealedPricePanel.tsx
│   ├── RaisePricePanel.tsx
│   ├── AscendingPricePanel.tsx
│   ├── LbpPricePanel.tsx
│   └── QuadraticPricePanel.tsx
├── progress-panels/
│   ├── DefaultProgressPanel.tsx   # supply bar (Dutch, Ascending, Sealed, Quadratic, LBP)
│   └── RaiseProgressPanel.tsx     # supply bar + raise target threshold line
├── pricing-steps/
│   ├── DutchPricingStep.tsx       # wizard step 3 per type
│   ├── SealedPricingStep.tsx      # adds commitEndBlock offset
│   ├── RaisePricingStep.tsx
│   ├── AscendingPricingStep.tsx
│   ├── LbpPricingStep.tsx
│   └── QuadraticPricingStep.tsx
├── components/
│   ├── AuctionCard.tsx
│   ├── AuctionFilters.tsx
│   ├── AuctionSearch.tsx
│   ├── CountdownBlock.tsx
│   ├── PriceDisplay.tsx           # current price box (shared)
│   └── SupplyBar.tsx
├── hooks/
│   ├── useAuctions.ts
│   ├── useAuction.ts
│   ├── useAuctionFilters.ts
│   ├── useCurrentPrice.ts
│   └── useProtocolConfig.ts       # reads fairdrop_config.aleo mappings
└── pages/
    ├── AuctionListPage.tsx
    ├── AuctionDetailPage.tsx
    └── CreateAuctionPage.tsx
```

### 4.4 Overall apps/web Directory Structure

```
apps/web/src/
├── main.tsx
├── app.tsx                         # Layout: sidebar + topbar + <Outlet />
├── env.ts                          # Vite env validation; throws on missing VITE_* vars
│
├── providers/
│   ├── WalletProvider.tsx
│   ├── QueryProvider.tsx
│   └── index.ts
│
├── config/index.ts                 # defineConfig(import.meta.env.*); exports config
│
├── stores/
│   ├── transaction.store.ts
│   └── ui.store.ts
│
├── services/                       # HTTP client for services/api
│   ├── api.client.ts
│   ├── auctions.service.ts
│   ├── tokens.service.ts
│   ├── users.service.ts
│   └── indexer.service.ts
│
├── hooks/
│   ├── useWalletRecords.ts
│   ├── useBlockHeight.ts
│   ├── useTransaction.ts
│   └── useLocalStorage.ts
│
├── features/
│   ├── auctions/                   # see §4.3
│   ├── bids/
│   │   ├── hooks/useMyBids.ts
│   │   └── pages/MyBidsPage.tsx
│   ├── claim/
│   │   ├── hooks/useClaimable.ts
│   │   └── pages/ClaimPage.tsx
│   ├── creator/
│   │   ├── hooks/useMyAuctions.ts
│   │   └── pages/
│   │       ├── CreatorDashboardPage.tsx
│   │       └── MyAuctionsPage.tsx
│   ├── earnings/                   # cross-auction earn hub (§9)
│   │   ├── hooks/useEarnings.ts
│   │   └── pages/EarningsPage.tsx
│   ├── referral/
│   │   ├── hooks/useReferralCodes.ts
│   │   └── pages/ReferralPage.tsx
│   ├── vesting/
│   │   ├── hooks/useVestingSchedules.ts
│   │   └── pages/VestingPage.tsx
│   ├── gate/
│   │   ├── hooks/useGateStatus.ts
│   │   └── pages/GatePage.tsx
│   ├── token-launch/
│   │   └── pages/TokenLaunchPage.tsx
│   ├── token-manager/
│   │   └── pages/TokenManagerPage.tsx
│   ├── admin/
│   │   └── pages/AdminPage.tsx     # §15
│   └── dashboard/
│       └── pages/DashboardPage.tsx
│
├── shared/
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx
│   │   │   ├── TopBar.tsx              # <NetworkBadge /> + <IndexerStatus /> (see §5.7)
│   │   │   └── ErrorBoundary.tsx
│   │   └── wallet/
│   │       ├── ConnectButton.tsx
│   │       ├── WalletMenu.tsx
│   │       └── ConnectWalletPrompt.tsx
│   # field utils removed — import isValidField, fieldToHex from '@fairdrop/sdk/parse'
│
└── workers/
    ├── worker.ts
    └── AleoWorker.ts               # expose terminate(); copied as-is from fairdrop/src/workers/
                                    # No computation changes — wallet handles all ZK proof generation
                                    # terminate() called in WalletProvider cleanup useEffect:
                                    #   useEffect(() => () => aleoWorker.terminate(), [])
```

---

## 5. State Management

### 5.1 Server State — TanStack Query

```ts
function useAuctions(params: AuctionListParams) {
  return useQuery({
    queryKey: ['auctions', params],
    queryFn:  () => auctionsService.list(params),
    staleTime: 15_000,
    refetchInterval: 30_000,
  })
}

function useAuction(id: string) {
  return useQuery({
    queryKey: ['auction', id],
    queryFn:  () => auctionsService.get(id),
    staleTime: 10_000,
    refetchInterval: (query) =>
      query.state.data?.status === AuctionStatus.Cleared ||
      query.state.data?.status === AuctionStatus.Voided
        ? false : 15_000,
  })
}

// Protocol config — fairdrop_config.aleo mappings; cached 60s
function useProtocolConfig() {
  return useQuery({
    queryKey: ['protocolConfig'],
    queryFn:  fetchProtocolConfig,
    staleTime: 60_000,
  })
}

function useBlockHeight() {
  return useQuery({
    queryKey: ['blockHeight'],
    queryFn:  () => aleoClient.getLatestBlockHeight(),
    staleTime: 5_000,
    refetchInterval: 5_000,
  })
}
```

### 5.2 Global Client State — Zustand

```ts
// stores/transaction.store.ts
interface TransactionState {
  txId:      string | null
  status:    'idle' | 'signing' | 'pending' | 'confirmed' | 'failed' | 'rejected'
  label:     string | null
  setTx:     (txId: string, label: string) => void
  setStatus: (s: TransactionState['status']) => void
  reset:     () => void
}
```

Replaces `TransactionTrackerContext` and `RefreshContext`. Query invalidation via `queryClient.invalidateQueries` replaces `refreshAuctions()`.

### 5.3 Local Component State

Form inputs, collapse state, modal visibility — `useState` only.

### 5.4 Transaction Lifecycle UX

The wallet handles all ZK proof generation internally. From the frontend's perspective there are four states:

```
idle → submitting → pending → terminal
```

| State | Description | UI |
|---|---|---|
| `idle` | No active transaction | Default button labels |
| `submitting` | Wallet popup open; user signing | Button disabled, "Waiting for wallet..." |
| `pending` | Tx submitted; polling for terminal state | Fixed bottom-right toast: spinner + label |
| `terminal` | `ACCEPTED` / `FAILED` / `REJECTED` | Toast updates: green / red; auto-dismisses after 5s on success |

**No "proving phase"** — proof generation is handled inside the wallet adapter. The frontend never generates ZK proofs.

`TxStatusStepper` — fixed bottom-right component reading from `transaction.store.ts`:

```tsx
// shared/components/layout/TxStatusStepper.tsx
function TxStatusStepper() {
  const { status, label, txId } = useTransactionStore()
  if (status === 'idle') return null
  return (
    <div className="fixed bottom-4 right-4 ...">
      <Spinner visible={status === 'pending'} />
      <span>{label ?? 'Transaction'}</span>
      <StatusLabel status={status} />
      {txId && status === 'confirmed' && <ExplorerLink txId={txId} />}
    </div>
  )
}
```

**Error reason parsing** — `assert_config` and other reverts surface as opaque error strings. Parse known revert patterns before showing the user:

```ts
function parseExecutionError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  if (msg.includes('assert_config'))
    return 'Protocol config changed while the wizard was open. Review the updated fee and resubmit.'
  if (msg.includes('check_not_paused'))
    return 'Protocol is paused. Check status and try again later.'
  if (msg.includes('finalize_claim_commission'))
    return 'Commission amount changed (another credit ran concurrently). Retrying with updated amount...'
  return 'Transaction failed. Check your wallet for details.'
}
// claim_commission auto-retry: on finalize_claim_commission revert, re-read earned[code_id]
// and re-submit once with the fresh value before surfacing the error to the user.
```

After any `ACCEPTED` tx, call `queryClient.invalidateQueries` on the affected query keys to trigger re-fetch.

### 5.5 Error Handling Patterns

Three tiers — each handles a distinct failure mode:

**1. Inline form validation** — synchronous, before any tx:
- Required fields, numeric ranges, block ordering (`startBlock < endBlock`)
- Commission BPS > `maxReferralBps` → inline error below input
- `auction_id` format → `isValidField()` from `@fairdrop/sdk/parse`

**2. Toast notifications** — async outcomes (tx, API errors):
- Tx terminal states → `TxStatusStepper` (see §5.4)
- API fetch error → bottom-right toast: "Failed to load auction data. Showing cached values."
- IPFS fetch error → silent fallback to skeleton (not user-actionable; no toast)

**3. Route-level `<ErrorBoundary>`** — fatal component errors:
- Wraps each route in `App.tsx`
- Fallback: "Something went wrong. Reload the page." with a reload button
- Error reported to console (and future error tracking service)

**API down or slow**: TanStack Query stale data shown transparently — no blank screens. A non-blocking banner above page content reads: "Data may be delayed — API unavailable". Banner auto-clears on next successful fetch.

**IPFS failure**: on `<img>` load error → render letter avatar fallback. IPFS failures never propagate to higher error tiers.

### 5.6 Multi-Step Transaction Flows

Some flows require sequential transactions — each step must reach `ACCEPTED` before the next is enabled.

```ts
export function useSequentialTx(steps: Array<() => Promise<void>>) {
  const [currentStep, setCurrentStep] = useState(0)
  const [done,        setDone]        = useState(false)
  const [error,       setError]       = useState<Error | null>(null)

  async function advance() {
    setError(null)
    try {
      await steps[currentStep]()
      if (currentStep + 1 >= steps.length) setDone(true)
      else setCurrentStep(s => s + 1)
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)))
      // step index does NOT advance on failure — caller retries via advance()
    }
  }

  return { currentStep, totalSteps: steps.length, done, advance, error }
}
```

`error` is reset to `null` on each `advance()` call. The UI reads `error` to show which step failed and why (via `parseExecutionError`). The failed step button re-enables so the user can retry without restarting the whole flow.

Used in:

| Flow | Steps |
|---|---|
| Gate → Bid | 1. `verify_merkle` or `verify_credential`; 2. `place_bid` (enabled after step 1 ACCEPTED) |
| Credit + Claim commission | 1–N. `credit_commission(code_id, bidder_key)` per uncredited bidder (sequential); N+1. `claim_commission(code, amount)` |
| Wizard authorization | 1. `set_role(auctionProgram, 3)`; 2. (optional) `set_role(fairdrop_vest.aleo, 3)`; 3. `create_auction` |

Each step button shows: "Step N of M: [action label]". Prior steps shown as completed (checkmark). Step N+1 button disabled until step N ACCEPTED (polled via TanStack Query).

### 5.7 Network & Liveness Indicators

Shown persistently in `TopBar.tsx`. Two independent indicators:

**Network Badge** (static — from `env.network`):
- `TESTNET` — amber pill
- `MAINNET` — neutral/grey pill
- Derived from `VITE_ALEO_NETWORK` at load; never changes at runtime

**Indexer Status** (dynamic — polled every 30s):

```ts
// services/indexer.service.ts
export async function fetchIndexerStatus(): Promise<IndexerStatus> {
  return apiFetch('/indexer')  // { latestIndexedBlock, latestChainBlock, lagBlocks }
}

// hooks/useIndexerStatus.ts
function useIndexerStatus() {
  return useQuery({
    queryKey:       ['indexerStatus'],
    queryFn:        indexerService.fetchStatus,
    staleTime:      30_000,
    refetchInterval: 30_000,
  })
}
```

Status dot + label:

| `lagBlocks` | Dot | Label |
|---|---|---|
| < 5 | green | "Live" |
| 5 – 50 | amber | "Delayed" |
| > 50 | red | "Lagging" |
| fetch error | grey | "Offline" |

Tooltip on hover: "Indexer at block N / Chain at block M (N blocks behind)".

Stale data banner (§5.5): shown when `lagBlocks > 50` or API unreachable — non-blocking, above page content.

**Bid form enforcement**: all bid form submit buttons are disabled when `lagBlocks > 10`. Tooltip: "Indexer lagging — phase detection may be incorrect". Prevents submitting to the wrong phase based on a stale block height.

### 5.8 Wallet Network Mismatch

Detected in `WalletProvider.tsx` immediately after connect. If `wallet.network !== env.network`, a **blocking modal** is shown — all page content disabled until resolved:

```tsx
// providers/WalletProvider.tsx
useEffect(() => {
  if (!wallet.connected) return
  if (wallet.network !== env.network) setNetworkMismatch(true)
  else setNetworkMismatch(false)
}, [wallet.connected, wallet.network])

// Rendered at app root (above all routes):
{networkMismatch && (
  <NetworkMismatchModal
    walletNetwork={wallet.network}
    appNetwork={env.network}
  />
)}
```

Modal text: "Your wallet is connected to **{wallet.network}** but this app runs on **{env.network}**. Switch your wallet network to continue." No dismiss button — the modal clears automatically when the wallet switches to the correct network.

---

## 6. Data Layer

### 6.1 API Client (services/api)

```ts
// services/auctions.service.ts
export const auctionsService = {
  list:    (params: AuctionListParams): Promise<Page<AuctionListItem>> =>
             apiFetch(`/auctions?${toQueryString(params)}`),
  get:     (id: string): Promise<AuctionView> =>
             apiFetch(`/auctions/${id}`),
  bids:    (id: string, p: PaginationParams): Promise<Page<BidView>> =>
             apiFetch(`/auctions/${id}/bids?${toQueryString(p)}`),
  filters: (): Promise<AuctionFilters> =>
             apiFetch(`/auctions/filters`),
}
```

### 6.2 Protocol Config Fetch

Protocol config is served by `GET /config` on `services/api`. The indexer writes the row whenever a `set_*` transition is indexed; the API serves the DB row with a 5-minute server-side TTL, falling back to contract defaults when the row is absent (i.e. before any `set_*` has been called on-chain).

```ts
// shared/services/config.service.ts
export const configService = {
  get: (): Promise<ProtocolConfig> => apiFetch('/config'),
}
```

This is required for:
- Showing the `creation_fee` in the wizard review step (no obscurity)
- Client-side validation of `minDuration` for `endBlock - startBlock`
- Showing `closerReward` in the Actions panel
- Validating referral `commission_bps` against `maxReferralBps` in the referral page

**No chain reads from the client for config.** 100 simultaneous users each hitting the same 9 mappings would be 900 RPC calls. With `GET /config`, that collapses to one request per 5-minute window regardless of concurrent users.

### 6.3 Hybrid Data Strategy

| Data | Source | Cache tier |
|---|---|---|
| Auction list & detail | API (`GET /auctions`) | TanStack Query — 15s staleTime |
| `currentPrice` at current block | Recomputed client-side from `AuctionView` | None — pure computation |
| Token metadata | API (`GET /tokens/:id/metadata`) | localStorage (no expiry) + TanStack Query (`staleTime: Infinity`) |
| Bid records | Wallet `requestRecords` | TanStack Query — refetch on wallet change |
| Token records | Wallet `requestRecords` | TanStack Query — refetch on wallet change |
| Credit records | Wallet `requestRecords` | TanStack Query — refetch on wallet change |
| Commitment records (Sealed) | Wallet `requestRecords(PROGRAMS.sealed.programId)` | TanStack Query |
| VestedAllocation records | Wallet `requestRecords(PROGRAMS.vest.programId)` | TanStack Query |
| ReferralCode records | Wallet `requestRecords(PROGRAMS.ref.programId)` | TanStack Query |
| ParticipationReceipt records | Wallet `requestRecords(PROGRAMS.proof.programId)` | TanStack Query |
| `auction_configs[id]` | Chain RPC (direct mapping read) | localStorage (no expiry) + TanStack Query (`staleTime: Infinity`) |
| `auction_index[n]` | Chain RPC | localStorage (no expiry) + TanStack Query (`staleTime: Infinity`) |
| Gate config per auction | Chain RPC (`gate_modes`, `allowlists`, `credential_issuers`) | localStorage (no expiry) + TanStack Query (`staleTime: Infinity`) |
| Protocol config | API (`GET /config`) | TanStack Query — 5 min staleTime |
| Creator reputation | Chain RPC (`PROGRAMS.proof.programId/reputation`) | TanStack Query — 60s staleTime |
| Referral chain state | Chain RPC (`PROGRAMS.ref.programId` mappings) | TanStack Query — on demand |
| Block height | Chain RPC | TanStack Query — 5s staleTime |

### 6.4 Cache Layer

#### Why TanStack Query alone is not enough

TanStack Query is an **in-memory cache** — it resets on every page reload. For data that is genuinely immutable on-chain (e.g. `auction_configs`, `auction_index`, token metadata), re-fetching it every session is wasteful and adds unnecessary RPC load. The right answer is a persistent cache for immutable data, with TanStack Query reading from it on startup.

#### Data mutability classes

| Class | Examples | Cache strategy |
|---|---|---|
| **Immutable** — no on-chain setter exists | `auction_configs`, `auction_index` entries, token metadata, gate config per auction | localStorage, **no expiry ever** |
| **Write-once then immutable** | `fairdrop_ref/registrations[code_id]`, `fairdrop_proof/participated[key]` | localStorage, no expiry |
| **Admin-only, changes rarely** | All `fairdrop_config.aleo` params (`fee_bps`, `creation_fee`, etc.) | API-served with 5-min server TTL; TanStack Query `staleTime: 5min` client-side. Always re-fetch before `create_auction`. |
| **Changes per auction activity** | `auction_states`, `earned[code_id]`, `referral_reserve`, `reputation` | TanStack Query only — no persistence |
| **Real-time** | Block height | TanStack Query only — 5s staleTime |

#### Package location

```
packages/sdk/src/cache/
├── persist.ts            # localStorage abstraction with versioning; no React dependency
├── auction-config.ts     # getPersistedAuctionConfig, setPersistedAuctionConfig
├── auction-index.ts      # getPersistedAuctionIndex, setPersistedAuctionIndex
├── token-meta.ts         # getPersistedTokenMeta, setPersistedTokenMeta
└── gate-config.ts        # getPersistedGateConfig, setPersistedGateConfig
```
Protocol config is **not** persisted in localStorage — the API already caches it server-side for 5 minutes and returns defaults when the row is absent.

Lives in `packages/sdk` (not `apps/web`) — no React dependency, reusable by any consumer, consistent with where the parsers and registry helpers live.

#### Cache key versioning

A single `CACHE_VERSION` constant namespaces every key. Bumping it on deploy busts all stored entries automatically — no need for users to manually clear localStorage:

```ts
// packages/sdk/src/cache/persist.ts
const CACHE_VERSION = 'v1'

export function cacheKey(entity: string, id?: string): string {
  return id
    ? `fairdrop:${CACHE_VERSION}:${entity}:${id}`
    : `fairdrop:${CACHE_VERSION}:${entity}`
}

export function getPersisted<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch { return null }
}

export function setPersisted<T>(key: string, value: T): void {
  try { localStorage.setItem(key, JSON.stringify(value)) }
  catch { /* quota exceeded — silent fail, TanStack Query still works */ }
}

```

#### Integration with TanStack Query

`initialData` connects the persistence layer to TanStack Query. On cache hit, the query starts in a fresh state (no loading spinner); on miss, it fetches normally and then persists the result.

```ts
// features/auctions/hooks/useAuctionConfig.ts
function useAuctionConfig(id: string) {
  return useQuery({
    queryKey: ['auctionConfig', id],
    queryFn:  async () => {
      const config = await fetchAuctionConfig(id)     // chain RPC
      setPersistedAuctionConfig(id, config)           // write-through
      return config
    },
    initialData:     () => getPersistedAuctionConfig(id) ?? undefined,
    initialDataUpdatedAt: () =>
      getPersistedAuctionConfig(id) ? Date.now() : 0, // treat persisted data as always fresh
    staleTime: Infinity,  // immutable — never re-fetch unless manually invalidated
    gcTime:    Infinity,
  })
}

// features/auctions/hooks/useProtocolConfig.ts
function useProtocolConfig() {
  return useQuery({
    queryKey: ['protocolConfig'],
    queryFn:  () => configService.get(),  // GET /config — API-cached, never hits chain
    staleTime: 5 * 60 * 1000,            // 5 minutes in-session; server TTL is also 5 min
  })
}
```

#### API server-side cache (services/api)

The API already has `token-cache.ts`. Extend it to align with the same immutability semantics:

| Data cached server-side | Current TTL | Should be |
|---|---|---|
| Token metadata | TTL-based | **No expiry** — immutable after registration |
| Auction configs | Not cached | **No expiry** — immutable; indexer already wrote to DB |
| Protocol config | 5-minute TTL ✓ | Implemented — `services/api/src/lib/config-cache.ts` |
| Auction list (DB query result) | Not cached | 15s TTL — short; DB is already fast, this smooths burst traffic |

The DB is the authoritative cache for all indexed data — the indexer writes it, the API reads it. No additional server caching is needed for `auction_states` or referral state; those are served directly from the DB.

### 6.5 Security: Untrusted IPFS Content

Auction metadata (name, description, logo, links) is creator-supplied and pinned to IPFS. It must be treated as untrusted input.

**XSS prevention**: metadata text fields (`name`, `description`, `website`) are never rendered as HTML. No `dangerouslySetInnerHTML`. All text passed to standard JSX text nodes — React escapes by default.

**Open redirect prevention**: external URLs (website, social links) are sanitised before use:

```ts
// packages/sdk/src/format/url.ts
const ALLOWED_SCHEMES = ['https:']

export function sanitizeExternalUrl(raw: string | null): string | null {
  if (!raw) return null
  try {
    const url = new URL(raw)
    return ALLOWED_SCHEMES.includes(url.protocol) ? url.toString() : null
  } catch { return null }
}
```

`null` return means the link is not rendered. Applies to website, Twitter, Discord, and any other external URL field.

**Logo images**: fetched via the configured IPFS gateway (`VITE_IPFS_GATEWAY`), not a raw `ipfs://` URI:

```tsx
<img
  src={`${env.ipfsGateway}${metadata.logoCid}`}
  referrerPolicy="no-referrer"
  onError={() => setLogoFailed(true)}
  alt={metadata.name}
/>
```

`referrerPolicy="no-referrer"` prevents leaking the app URL to the gateway. On load error → letter avatar fallback. `img-src` in CSP lists only the single gateway host; raw `ipfs://` URIs are not rendered.

---

## 7. Auction Listing

### 7.1 Filters & Sort

```
type:     AuctionType (Dutch | Sealed | Raise | Ascending | Lbp | Quadratic) — multi-select
status:   AuctionStatus (Upcoming | Active | Clearing | Cleared | Voided | Ended) — multi-select
gate:     GateMode (open | merkle | credential)
vested:   boolean
creator:  aleo1... address
q:        free-text search (name from metadata — server-side)
sort:     newest | ending_soon | price_asc | price_desc | progress | volume
page + pageSize
```

### 7.2 Auction Card

- Name + logo (IPFS metadata; fallback to sale token symbol)
- Type badge, status badge
- Current price (recomputed client-side from card data + blockHeight)
- Progress bar (Raise: shows target threshold line)
- Countdown to `endBlock`
- Gate + vest indicator icons

### 7.3 Search

Debounced input (300ms) → `q` param → TanStack Query refetch. Server-side only.

### 7.4 URL State for Filters

All `AuctionListParams` are synced to the URL via `useSearchParams` from React Router. Filters are bookmarkable and shareable — navigating to `/auctions?type=sealed&status=active` opens the listing pre-filtered.

```ts
// features/auctions/hooks/useAuctionParams.ts
export function useAuctionParams(): [AuctionListParams, (p: Partial<AuctionListParams>) => void] {
  const [params, setParams] = useSearchParams()
  const parsed: AuctionListParams = {
    type:     params.get('type') as AuctionType | null ?? undefined,
    status:   params.get('status') as AuctionStatus | null ?? undefined,
    sort:     (params.get('sort') ?? 'newest') as SortOption,
    q:        params.get('q') ?? undefined,
    page:     Number(params.get('page') ?? 1),
    pageSize: Number(params.get('pageSize') ?? 25),
  }
  const update = (next: Partial<AuctionListParams>) =>
    setParams(prev => ({ ...Object.fromEntries(prev), ...next }), { replace: true })
  return [parsed, update]
}
```

`replace: true` on filter changes prevents back-button history spam. TanStack Query `queryKey` includes `params` — any filter change triggers a refetch automatically.

---

## 8. Auction Detail — CEX-Style Trade Interface

The detail page is the most important page. Inspired by a centralized exchange trade view — focused, information-dense, clean. Two-column layout on desktop; single column on mobile.

### 8.1 Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│ HEADER                                                               │
│ [Logo] Auction Name  [Type Badge] [Status Badge]  [Gate] [Vest]     │
│ auction_id (monospace, copyable)                                     │
│ Creator: aleo1... · N auctions · N filled · Volume N ALEO           │
└──────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────┬─────────────────────────────────────┐
│  LEFT (60%)                    │  RIGHT (40%) — sticky on scroll     │
│                                │                                     │
│  ┌──────────────────────────┐  │  ┌───────────────────────────────┐  │
│  │  PRICE PANEL             │  │  │  BID PANEL                    │  │
│  │  (type-dispatched chart  │  │  │  (type-dispatched; phase-     │  │
│  │  + countdown blocks)     │  │  │   aware for Sealed)           │  │
│  └──────────────────────────┘  │  └───────────────────────────────┘  │
│                                │                                     │
│  ┌──────────────────────────┐  │  ┌───────────────────────────────┐  │
│  │  PROGRESS PANEL          │  │  │  ACTIONS PANEL                │  │
│  │  (type-dispatched)       │  │  │  (close / cancel / slash /    │  │
│  └──────────────────────────┘  │  │   withdraw — role-gated)      │  │
│                                │  └───────────────────────────────┘  │
└────────────────────────────────┴─────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│  TABS:  [Info]  [Earn]  [Referral]  [Your Receipts]                 │
└──────────────────────────────────────────────────────────────────────┘
```

On mobile: all panels stack vertically. Right column is sticky on desktop so the bid form stays visible during chart scroll.

### 8.2 Header

- Auction name (from `metadata.name`; fallback: `SaleTokenSymbol / ALEO`)
- Logo (IPFS; fallback: token letter avatar)
- `AuctionType` badge (colored: Dutch=blue, Raise=green, Sealed=purple, Ascending=teal, LBP=orange, Quadratic=pink)
- `AuctionStatus` badge
- Gate icon (padlock if gated)
- Vest icon (hourglass if enabled)
- `auction_id` truncated with copy button
- Creator address (truncated, links to creator profile)
- Creator reputation from `fairdrop_proof.aleo/reputation[creator]`:
  `N auctions · N filled · Volume N ALEO`

### 8.3 Price Panel (type-dispatched via registry)

| Type | Content |
|---|---|
| Dutch | Step-down chart `startPrice → floorPrice`; vertical line at current block; dot at current price |
| Sealed | "Price determined at commit end (block N)" — shows mini Dutch chart for reference; shows `clearingPrice` after close |
| Raise | Fixed price label (no chart); shows raise target progress prominently |
| Ascending | Step-up chart `startPrice → ceilingPrice`; current price highlighted |
| LBP | Bonding curve chart; estimated price vs committed supply |
| Quadratic | Fixed per-token price; vote-weight curve display |

### 8.4 Countdowns

Rendered with `CountdownBlock` from `packages/ui/src/fairdrop/countdown.tsx`: `N blocks (~M min)`.

Wall-clock estimation uses `estimateDate` from `packages/sdk/src/format/blocks.ts`:

```ts
const BLOCK_TIME_MS = 10_000  // 10s average Aleo block time

export function estimateDate(targetBlock: number, currentBlock: number, now = new Date()): Date {
  const deltaMs = (targetBlock - currentBlock) * BLOCK_TIME_MS
  return new Date(now.getTime() + deltaMs)
}
```

Display pattern: `N blocks (~M min)` with a tooltip showing the full estimated timestamp. Used everywhere block numbers are displayed (countdowns, Info tab, Create Auction timing step).

For all types except Sealed: single "Ends in N blocks" while active; "Ended N blocks ago" after.

**Sealed auction** shows three phase markers with a progress indicator:

```
  [● COMMIT]     ─────────     [○ REVEAL]     ─────────     [○ CLOSED]
  block N–M                    block M–end                    block end+
```

| Sealed countdown | Block target | When shown |
|---|---|---|
| Commit window ends | `commit_end_block` | While `blockHeight < commit_end_block` |
| Reveal window ends | `end_block` | While `commit_end_block ≤ blockHeight < end_block` |
| Slash window open | `end_block` passed | While `blockHeight >= end_block AND not Cleared` |

### 8.5 Bid Panel (type-dispatched via registry)

`SealedBidForm` handles its own phase logic internally based on `blockHeight` vs `commit_end_block` and `end_block`:
- Commit phase: quantity + nonce input → `commit_bid_private` or `commit_bid_public`
- Reveal phase: `quantity` and `nonce` **pre-filled from the decrypted `Commitment` record** (AutoDecrypt) → `reveal_bid`
- Past reveal window: "Reveal window closed"

**Sealed bid nonce — no persistence needed (Option A)**: The `Commitment` record stores `quantity: u128` and `nonce: field` as private fields (encrypted to the bidder's view key on-chain). AutoDecrypt makes them available to the frontend from the wallet at reveal time. The frontend reads the decrypted record and pre-fills both fields — no localStorage, no cross-device fragility. See contract change in `fairdrop_sealed.aleo` `Commitment` record.

**Commitment record filtering**: a user may hold Commitment records for multiple sealed auctions. The hook `useCommitmentRecord(auctionId)` filters `requestRecords(PROGRAMS.sealed.programId)` by `record.auction_id === auctionId` to find the one relevant to the current detail page. Never assume a single record per program.

Other types:

| Type | User inputs | Transition called |
|---|---|---|
| Dutch | quantity; computed payment (qty × price / saleScale) | `place_bid_dutch` or `place_bid_dutch_ref` |
| Raise | payment amount (µcredits) | `place_bid_raise` or `place_bid_raise_ref` |
| Ascending | quantity; computed payment | `place_bid_ascending` or ref variant |
| LBP | payment amount | `place_bid_lbp` or ref variant |
| Quadratic | quantity (votes) | `place_bid_quadratic` or ref variant |

Referral code: optional input below the main form. If `?ref=<address>` in URL, pre-filled. When present, calls the `*_ref` transition variant.

Fee breakdown shown below the submit button (derived from `useProtocolConfig`):
- Estimated payment amount
- Protocol fee: `payment × feeBps / 10000` — labeled "Protocol fee (2.5%)"
- Referral cut if referral code present

All forms: disabled when wallet not connected, gate not verified, or auction not in the correct phase.

### 8.6 Progress Panel (type-dispatched)

- Default (all types except Raise): supply bar `totalCommitted / supply`
- Raise: supply bar + **target threshold line** at `raiseTarget` with label "Raise target: N ALEO"

### 8.7 Actions Panel (role-gated)

Collapsible card on the right column below the bid panel.

| Action | Condition | Who | Transition |
|---|---|---|---|
| **Close auction** | `endBlock < currentBlock AND not Cleared AND not Voided` OR `status === Clearing` | Anyone | `close_auction` — earns `closerReward` if caller ≠ creator |
| **Cancel auction** | `status === Upcoming OR Active` | Creator only | `cancel_auction` |
| **Slash unrevealed** *(Sealed only)* | `blockHeight > endBlock AND commitments exist` | Anyone | `slash_unrevealed(commitment, auction_id)` |
| **Withdraw revenue** | `status === Cleared` | Creator | `withdraw_payments` |
| **Withdraw unsold** | `status === Cleared` | Creator | `withdraw_unsold` |
| **Push referral budget** | `status === Cleared AND referralBudget > 0` | Anyone | `push_referral_budget` |

"Close auction" framing by caller:
- Creator closing after `supply_met` → "Close Auction"
- Non-creator closing after `endBlock` without close → **"Claim Closer Reward: N ALEO"** (reward from protocol treasury, displayed from `useProtocolConfig.closerReward`)

### 8.8 Info Tab

Structured data rows, no actions:

| Field | Source |
|---|---|
| Auction ID | `auction.id` — monospace, copyable |
| Sale Token | symbol + tokenId |
| Payment Token | ALEO Credits |
| Supply | formatted amount |
| Start Block | N (estimated date) |
| End Block | N (estimated date) |
| Commit End Block *(Sealed only)* | `commit_end_block` |
| Gate Mode | Open / Merkle Allowlist / Credential |
| Vesting | Enabled: cliff N blocks, end N blocks / Disabled |
| Protocol Fee | feeBps / 100 as % |
| Closer Reward | closerReward µcredits formatted |
| Slash Reward *(Sealed only)* | `slashRewardBps` from config |
| Referral Budget | `referralBudget` / none |
| Links | website, twitter, discord from metadata |

### 8.9 Earn Tab (Auction-Scoped)

Shows earning opportunities for this specific auction without bidding:

| Opportunity | Condition | Action |
|---|---|---|
| Close auction + earn | `endBlock < currentBlock AND not Cleared/Voided` | "Close & Earn N ALEO" → `close_auction` |
| Slash unrevealed *(Sealed)* | `blockHeight > endBlock AND commitments exist` | "Slash → Earn N%" → `slash_unrevealed` |
| Push referral budget | `Cleared AND referralPoolBps > 0 AND NOT reserve_funded[auction_id]` | "Push Referral Budget" → `push_referral_budget` — permissionless |
| Credit commission | `Cleared AND user has ReferralCode for this auction AND uncredited bidders exist` | "Credit Commission" → `credit_commission(code_id, bidder_key)` per uncredited bidder |
| Claim commission | `earned[code_id] > 0` | "Claim N ALEO" → `claim_commission(code, earned_amount)` |

### 8.10 Referral Tab

- Shows user's `ReferralCode` record for this auction (if any) — from wallet
- "Create Referral Code" button if none: calls `create_code(auction_id, commission_bps)`
- Referral link: `https://app.fairdrop.xyz/auctions/:id?ref=<myAddress>` — copy button
- Commission rate and pending earnings (`earned[code_id]` from chain)

### 8.11 Your Receipts Tab

- Lists `ParticipationReceipt` records from wallet (`requestRecords(PROGRAMS.proof.programId)`) for this `auction_id`
- Display only. No user action required — receipts are auto-issued at `commit_bid` / `place_bid` via CPI from the auction contract to the proof program's `issue_receipt` transition
- Shows `commitment_hash` for Sealed receipts (useful for reveal verification)
- Empty state: "Receipts appear here after you bid. No action required."

---

## 9. Earnings Page (Cross-Auction)

Route: `/earnings`. Aggregates all earning opportunities across the protocol.

### 9.1 Summary Header

```
┌──────────────────────────────────────────────────────────────┐
│  Your Earning Opportunities                                  │
│  Closer Rewards:      N ALEO across M auctions              │
│  Referral Earned:     N ALEO (ready to claim)               │
│  Slash Opportunities: N unrevealed bids                      │
└──────────────────────────────────────────────────────────────┘
```

### 9.2 Tab: Close Auctions (Closer Reward)

Lists auctions from `GET /auctions?status=ended` (past `endBlock`, not yet cleared):
- Auction name + type
- Time since `endBlock` passed (longer = more opportunity cost)
- Closer reward: N ALEO (from `useProtocolConfig.closerReward`)
- "Close & Earn" → `close_auction` on the relevant program

Sorted by oldest-ended-first (highest urgency).

### 9.3 Tab: Slash Bids (Sealed Auctions)

Lists sealed auctions past `end_block` with unrevealed commitments (from API + indexer data):
- Auction name
- Number of unrevealed commitments
- Slash reward per bid: `payment_amount × slashRewardBps / 10000`
- "Slash" → `slash_unrevealed(commitment_record, auction_id)` — requires commitment record from wallet

Note: a slasher needs the actual `Commitment` record. If the slasher holds the record (e.g., they bid and didn't reveal), they can slash themselves for the partial reward. Third-party slashers need off-chain discovery of commitment records — that is a future indexer feature. This tab shows opportunity; the actual slash requires the record.

### 9.4 Tab: Referral Commissions

For each `ReferralCode` record in wallet:
- Auction name + commission rate
- Uncredited bidders: `referral_count[code_id]` from chain — enumerate via `referral_list` to find uncredited ones
- Pending earnings: `earned[code_id]` from chain
- "Credit All Bidders" → batch `credit_commission(code_id, bidder_key)` for uncredited bidder_keys — permissionless, anyone can call
- "Claim N ALEO" → `claim_commission(code, earned_amount)` — consumes the `ReferralCode` record

Flow enforced by contract: `credit_commission` must run for each bidder before `claim_commission` accumulates earnings. Frontend should run `credit_commission` for all uncredited bidder_keys before showing the "Claim" button.

**Chain-derived readiness check** — determining what to show per code:

```ts
// Program IDs always from PROGRAMS — never hardcoded strings.
import { PROGRAMS }                               from '@fairdrop/config'
import { parseU64, parseU128, u128ToBigInt,
         parseBool, parseStruct }                 from '@fairdrop/sdk/parse'

async function fetchCodeStatus(codeId: string, auctionId: string) {
  const ref = PROGRAMS.ref.programId
  const [earnedRaw, countRaw, fundedRaw] = await Promise.all([
    aleoClient.getMappingValue(ref, 'earned', codeId),
    aleoClient.getMappingValue(ref, 'referral_count', codeId),
    aleoClient.getMappingValue(ref, 'reserve_funded', auctionId),
  ])
  // parseU128 returns string — convert to bigint for arithmetic/comparison.
  // parseU64 returns bigint — referral_count is u64 in the contract.
  const earnedAmount  = earnedRaw ? u128ToBigInt(parseU128(earnedRaw)) : 0n
  const totalCount    = countRaw  ? parseU64(countRaw)                 : 0n
  const reserveFunded = fundedRaw ? parseBool(fundedRaw)               : false

  // ⚠ N serial RPC calls — this should move to GET /referrals/:code_id/status (see below)
  const bidderKeys: string[] = []
  for (let i = 0n; i < totalCount; i++) {
    const listKey = `BHP256(RefListKey { code_id: ${codeId}, index: ${i}u64 })`
    const bk = await aleoClient.getMappingValue(ref, 'referral_list', listKey)
    if (bk) bidderKeys.push(bk)
  }

  // Check credited status per bidder
  const uncreditedKeys = await Promise.all(
    bidderKeys.map(async bk => {
      const rec = await aleoClient.getMappingValue(ref, 'referral_records', bk)
      const credited = rec ? parseBool(parseStruct(rec).credited) : false
      return credited ? null : bk
    })
  ).then(ks => ks.filter(Boolean) as string[])

  return {
    earnedAmount,           // bigint
    reserveFunded,
    creditsPending: uncreditedKeys.length > 0,
    uncreditedKeys,
    canClaim: earnedAmount > 0n,
  }
}
```

**Production note**: the N-serial-RPC enumeration loop above is the client-side reference implementation only. In production, expose this as an API endpoint so the indexer handles the enumeration server-side:

```
GET /referrals/:code_id/status
Response: {
  earnedAmount:   string,      // u128 as decimal
  reserveFunded:  boolean,
  totalCount:     number,
  uncreditedKeys: string[],    // bidder_keys not yet credited
  canClaim:       boolean
}
```

The indexer tracks `record_referral` events and `referral_records[bk].credited` in DB — O(1) lookup per code, replacing N RPC calls from the browser.

UI state from `fetchCodeStatus` (or the API equivalent):
- `creditsPending && reserveFunded` → show "Credit N bidder(s)" button (uses `useSequentialTx` §5.6)
- `canClaim` → show "Claim N ALEO" button
- Neither → show "No earnings yet"

---

## 10. Create Auction Wizard

### 10.1 Steps

Steps 1, 2, 4–8 are shared across all types. Step 3 is type-specific (from `pricing-steps/` registry).

```
Step 1 — Auction Type
  Six type cards: Dutch, Sealed, Raise, Ascending, LBP, Quadratic
  Each card: type name, 1-line mechanism description, visual icon

Step 2 — Token & Supply
  Sale token: selector from useTokenRecords()
    Shows: token name/symbol from registry, balance = record.amount
    Supply = record.amount — read-only field, displayed prominently:
      "You will sell the entire record: 1,000,000 MYTOKEN"
    Link: "Don't have a token yet? Create one →" (/tokens/launch)

  ── Inline Authorization Check ──
    After token + type selected:
    auctionProgramAddr = PROGRAMS[selectedType].programAddress  // aleo1... — NOT the .aleo name
    Check: token_registry.aleo/roles[BHP256(TokenOwner{auctionProgramAddr, tokenId})]
    If SUPPLY_MANAGER_ROLE (3) is missing:
      Show blocking callout: "Authorize [auction program] to manage supply"
      "Authorize" button → token_registry.aleo/set_role(auctionProgramAddr, 3)
      Wait for tx confirmation → proceed
    Note: set_role takes address (aleo1...), not program ID string.
          programAddress is pre-computed in programs.json / ProgramEntry.
  ─────────────────────────────────

  Payment token: ALEO Credits (display only — not selectable)
  Max bid amount: optional (0 = unlimited)
  Min bid amount: optional

Step 3 — Pricing (type-specific, from pricing-steps/ registry)
  Dutch:     startPrice, floorPrice, priceDecayBlocks, priceDecayAmount
  Sealed:    startPrice, floorPrice, priceDecayBlocks, priceDecayAmount
             + commitEndBlock (offset from startBlock; must be < endBlock)
  Raise:     fixedPrice, raiseTarget
  Ascending: startPrice, ceilingPrice, priceRiseBlocks, priceRiseAmount
  LBP:       initialWeightBps, finalWeightBps, weightShiftBlocks
  Quadratic: pricePerToken, maxVotes

Step 4 — Timing
  startBlock: default currentBlock + 100; must be ≥ currentBlock + 10
  endBlock:   default startBlock + 2160 (~6h); must be > startBlock + minDuration
  Sealed only: commitEndBlock must be startBlock < commitEndBlock < endBlock
  Show estimated wall-clock dates below each block input
  Show: "Minimum duration: N blocks (~N hours) — from protocol config"

Step 5 — Gate & Vesting
  Gate mode: Open | Merkle Allowlist | Credential
    Merkle: input root (computed off-chain); tool link for allowlist generation
    Credential: issuer address input
  Vesting: toggle
    If enabled: vestCliffBlocks, vestEndBlocks (blocks; show estimated duration)

    ── Vest Authorization Check ──
      Check: token_registry.aleo/roles[BHP256(TokenOwner{fairdrop_vest.aleo, tokenId})]
      If SUPPLY_MANAGER_ROLE missing:
        Show: "Authorize fairdrop_vest.aleo to release vested tokens"
        "Authorize" button → set_role(fairdrop_vest.aleo, 3) → wait → proceed
    ──────────────────────────────

Step 6 — Referral Budget
  referralPoolBps: optional (0 = no referral program)
  Show: "At close, X% of protocol fee is reserved as referral budget"
  Show: "Max referral commission per code: N% (from protocol config)"

Step 7 — Metadata
  Name, description (optional)
  Logo: upload → pin to IPFS → POST /metadata → returns hash (shown read-only)
  Website, Twitter, Discord (optional)

Step 8 — Review & Submit
  Summary table of all params
  ── Fee Breakdown ──
    Creation fee: N ALEO (N µcredits) — from fairdrop_config.aleo/creation_fee
    Paid from: credit record selector (useCredicRecords)
    "This anti-spam fee is non-refundable"
  ── Protocol fee at close (estimated) ──
    "~N% of total_payments at close (current protocol rate)"
  Re-fetch protocol config immediately before submit.
  If any value changed since wizard opened → show warning banner, require re-review.
  ── Auction nonce ──
    Read creator_nonces[wallet.address] from the selected auction program immediately
    before executeTransaction. Pass as the nonce param to create_auction.
    This derives the deterministic auction_id on-chain.
    On revert (nonce collision from concurrent submission): surface error and re-read nonce.
  Submit → calls create_auction on the selected auction program
```

### 10.2 Creation Fee — No Obscurity

- Always shown in Step 8; never hidden or deemphasized
- Fetched from `GET /config` before wizard opens and re-fetched immediately before submit (invalidates TanStack Query cache)
- Displayed as "Creation Fee: N ALEO (N µcredits)" with credit record selector below
- Warning text: "This fee is deducted at auction creation and is non-refundable"
- `assert_config` in the contract will revert the tx if fee drifted between read and execute — warn user if values changed

### 10.3 Supply is Always the Full Record Amount

- Supply input field is read-only; always equals `selectedRecord.amount`
- Shown prominently: "Selling 1,000,000 MYTOKEN — full record balance"
- Explains: "The entire record is used. To sell a partial amount, split the record first."
- Link: "Split in Token Manager →"
- No ambiguity; no free-form entry

### 10.4 Token Authorization (Inline, Not a Separate Page)

With 6 auction contracts + `fairdrop_vest.aleo`, token authorization cannot be a one-time step. It must be inline in the wizard:
- Step 2: check and authorize the selected auction contract using `PROGRAMS[type].programAddress`
- Step 5: if vest enabled, check and authorize `fairdrop_vest.aleo` using `PROGRAMS.vest.programAddress`
- Each authorization is a blocking step — wizard cannot advance until the tx confirms
- `token_registry.aleo/set_role` takes an `address` (aleo1...) — always use `programAddress`, never the `.aleo` program name

This replaces the old TokenLaunchPage "Authorize" step, which only worked for a single program.

---

## 11. Claim Page

### 11.1 Dispatch by Record Type and Auction State

User holds one of: `Bid` record, `Commitment` record (Sealed only), `VestedAllocation` record.

| Record | Auction state | Action | Transition |
|---|---|---|---|
| `Bid` | `Cleared`, vest disabled | Claim allocation | `claim(bid, auction_id)` |
| `Bid` | `Cleared`, vest enabled | Get vesting schedule | `claim_vested(bid, auction_id)` → issues `VestedAllocation` |
| `Bid` | `Voided` | Reclaim payment | `claim_voided(bid, auction_id)` |
| `Commitment` (Sealed) | `Voided` | Reclaim commitment payment | `claim_commit_voided(commitment, auction_id)` |
| `VestedAllocation` | `blockHeight >= cliff_block` | Release tokens | `PROGRAMS.vest.programId/release(vest, amount)` |

Claim page groups by auction, resolves status via API, shows the correct action for each record. "Claim All" where possible.

**Bid records span 6 programs** — `useClaimable` must request records from every auction program:

```ts
// features/claim/hooks/useClaimable.ts
const AUCTION_PROGRAMS = [
  PROGRAMS.dutch, PROGRAMS.sealed, PROGRAMS.raise,
  PROGRAMS.ascending, PROGRAMS.lbp, PROGRAMS.quadratic,
]

const allBidRecords = await Promise.all(
  AUCTION_PROGRAMS.map(p => wallet.requestRecords(p.programId))
).then(results => results.flat())
// Each record carries its originating program — use it to determine
// which program to call for claim/claim_voided/claim_commit_voided.
```

Commitment records come only from `PROGRAMS.sealed.programId`. `VestedAllocation` records from `PROGRAMS.vest.programId`. Each filtered by `record.auction_id` to associate with the correct auction.

### 11.2 Vesting Release Display

For `VestedAllocation` records:
- Total: N tokens
- Released: N tokens
- Vested so far: N tokens (computed client-side: same math as `finalize_release`)
- Cliff: block N (estimated date)
- Fully vested: block N (estimated date)
- Release input: amount (max = vested_so_far - released)
- "Release" → `fairdrop_vest.aleo/release(vest, amount)`

Client-side vesting math (mirrors contract):
```ts
function computeVested(vest: VestedAllocation, currentBlock: number): bigint {
  if (currentBlock < vest.cliff_block) return 0n
  const duration = BigInt(vest.end_block - vest.cliff_block)
  const elapsed  = BigInt(Math.min(currentBlock, vest.end_block) - vest.cliff_block)
  return vest.total_amount * elapsed / duration
}
```

---

## 12. Token Launch Page

Keeps its 3-step structure (Register → Mint). The old Step 3 "Authorize" is removed:
- Authorization for specific auction contracts → handled inline in Create Auction Wizard (Step 2)
- Authorization for `fairdrop_vest.aleo` → handled inline in Create Auction Wizard (Step 5)

The Token Launch page adds a single informational callout at the end: "Before creating an auction with this token, you'll need to authorize the auction contract — this is done automatically in the Create Auction wizard."

---

## 13. Referral Page

Route: `/referral`.

### 13.1 Create Referral Code

- Auction search by name or ID
- Commission BPS input: validated client-side ≤ `maxReferralBps` from `useProtocolConfig`
- "Create Code" → `fairdrop_ref.aleo/create_code(auction_id, commission_bps)` → returns `ReferralCode` record
- Share link: `https://app.fairdrop.xyz/auctions/:id?ref=<myAddress>`

### 13.2 Code List

All `ReferralCode` records from wallet. Per code, call `fetchCodeStatus(code.code_id, code.auction_id)` (see §9.4) to derive:

- Auction name, commission rate
- Earnings: `earnedAmount` from `earned[code_id]` mapping
- Uncredited bidders: `uncreditedKeys.length` — enumerated from `referral_count` + `referral_list` + `referral_records[bk].credited`
- `reserveFunded`: `reserve_funded[auction_id]` — auction must be cleared and reserve funded before `credit_commission` produces earnings
- "Credit N Bidder(s)" → `credit_commission(code_id, bidder_key)` per uncredited bidder via `useSequentialTx` (§5.6)
- "Claim N ALEO" → `claim_commission(code, earned_amount)` — correct function name; consumes the record

---

## 14. Gate Page

Per-auction gate verification. Reached from auction detail bid panel when gate ≠ Open.

### 14.1 Merkle Gate

Bidder calls `fairdrop_gate.aleo/verify_merkle(auction_id, proof: [field; 20], path_bits: u32)`.

- Explain: "This auction restricts bidding to an allowlist"
- Show: "Check if your address is included" (off-chain lookup if creator provides tool)
- Input: 20-element proof array + `path_bits` u32 (computed off-chain per gate spec in contract comments)
- "Verify & Enable Bidding" → tx → on success `verified[key] = true` → bid panel unlocks

Merkle spec (from `fairdrop_gate.aleo`):
- Depth 20 → max 1,048,576 addresses
- Leaf: `BHP256(LeafHash { addr })`, empty sentinel: `BHP256(LeafHash { ZERO_ADDRESS })`
- Node: `BHP256(MerkleNode { left, right })`
- `path_bits`: bit i = 0 means bidder is left child at level i

### 14.2 Credential Gate

Bidder calls `fairdrop_gate.aleo/verify_credential(auction_id, issuer, sig, expiry)`.

- Explain: "This auction requires a credential from the issuer"
- Show issuer address (from `credential_issuers[auction_id]` mapping)
- Credential is obtained from the `credential-signer` service (external; not yet implemented)
- Input: signature + expiry block (from credential service response)
- "Verify Credential" → tx → bid panel unlocks

**Credential expiry UX**: credentials have an `expiry` block after which `verify_credential` will revert.

| Condition | UI |
|---|---|
| `currentBlock < expiry - 10` | Show "Expires at block N (~M min)" — green |
| `expiry - 10 ≤ currentBlock < expiry` | Amber warning: "Credential expires in N blocks — submit soon" |
| `currentBlock ≥ expiry` | "Credential has expired. Request a new one." — submit button disabled |

Expiry block shown below the input at all times using `estimateDate(expiry, currentBlock)`. When expired, hide the submit button entirely and show a "Get New Credential" link to the credential-signer service. The credential service should issue credentials with sufficient expiry buffer (recommend ≥ 50 blocks from issuance).

---

## 15. Admin Panel

Route: `/admin`. Only accessible when connected wallet === `protocol_admin` from `fairdrop_config.aleo/protocol_admin` mapping.

### 15.1 fairdrop_config.aleo

Display current value + edit input for each param:

| Setting | Current value | Hard cap | Setter |
|---|---|---|---|
| Protocol fee | `fee_bps` (250 = 2.5%) | 1000 bps (10%) | `set_fee_bps` |
| Creation fee | `creation_fee` (µcredits) | 1,000,000,000 µcredits | `set_creation_fee` |
| Closer reward | `closer_reward` (µcredits) | 1,000,000,000 µcredits | `set_closer_reward` |
| Slash reward | `slash_reward_bps` | 5000 bps (50%) | `set_slash_reward_bps` |
| Max referral commission | `max_referral_bps` | 5000 bps | `set_max_referral_bps` |
| Referral pool share | `referral_pool_bps` | 2000 bps (20%) | `set_referral_pool_bps` |
| Min auction duration | `min_auction_duration` (blocks) | none | `set_min_auction_duration` |
| Paused | `paused` (bool) | — | `set_paused` |
| Protocol admin | `protocol_admin` | — | `set_protocol_admin` |

**Pause toggle**: shown in red. Label: "Emergency Pause — halts all auction activity". Unpausing shows "Resume Protocol".

**Admin transfer** (`set_protocol_admin`): show prominent red warning box: "This is an immediate, irreversible transfer. Entering a wrong address permanently locks admin access. The only recovery is a contract upgrade via the deployer key." Require typing the new address twice to confirm.

### 15.2 set_allowed_caller Matrix

Each utility contract (`gate`, `proof`, `ref`, `vest`) has its own `allowed_callers` mapping. Each auction program must be registered in each utility.

Display as a grid — rows are utility contracts, columns are auction programs:

| | dutch | sealed | raise | ascending | lbp | quadratic |
|---|---|---|---|---|---|---|
| **gate** | ✓/✗ | ✓/✗ | ✓/✗ | ✓/✗ | ✓/✗ | ✓/✗ |
| **proof** | ✓/✗ | ✓/✗ | ✓/✗ | ✓/✗ | ✓/✗ | ✓/✗ |
| **ref** | ✓/✗ | ✓/✗ | ✓/✗ | ✓/✗ | ✓/✗ | ✓/✗ |
| **vest** | ✓/✗ | ✓/✗ | ✓/✗ | ✓/✗ | ✓/✗ | ✓/✗ |

Each cell: green ✓ if `allowed_callers[programAddr] = true` (read from chain). "Authorize" / "Revoke" button per cell. "Authorize All Missing" button to batch-authorize all unchecked cells.

This is a critical Phase 1 deployment step — no auction can succeed until all 24 cells are authorized.

---

## 16. Verified Contract Function Reference

Only functions listed here should be called from the frontend. Confirmed by reading Leo source.

### fairdrop_config.aleo (admin only)
- `set_fee_bps(new_value: u16)`
- `set_protocol_admin(new_admin: address)` ← irreversible immediate transfer
- `set_creation_fee(new_value: u128)`
- `set_closer_reward(new_value: u128)`
- `set_slash_reward_bps(new_value: u16)`
- `set_max_referral_bps(new_value: u16)`
- `set_referral_pool_bps(new_value: u16)`
- `set_min_auction_duration(new_value: u32)`
- `set_paused(new_value: bool)`
- `assert_config(...)` — CPI only; not called from frontend
- `assert_ref_bps(commission_bps: u16)` — CPI only
- `check_not_paused()` — CPI only

### fairdrop_ref.aleo
- `set_allowed_caller(program_addr: address, allowed: bool)` — admin
- `create_code(auction_id: field, commission_bps: u16)` → `ReferralCode` — user
- `credit_commission(code_id: field, bidder_key: field)` — **permissionless** (anyone)
- `claim_commission(code: ReferralCode, claimed_amount: u128)` → private credits — record owner
- `fund_reserve`, `record_referral` — CPI only

### fairdrop_vest.aleo
- `set_allowed_caller(program_addr: address, allowed: bool)` — admin
- `release(vest: VestedAllocation, amount: u128)` → `(Token, VestedAllocation)` — record owner
- `create_vest(...)` — CPI only

### fairdrop_proof.aleo
- `set_allowed_caller(program_addr: address, allowed: bool)` — admin
- `issue_receipt(...)` — CPI only; **no user-callable minting**
- `update_reputation(...)` — CPI only
- `ParticipationReceipt` records are auto-issued at bid/commit time; user receives them via wallet

### fairdrop_gate.aleo
- `set_allowed_caller(program_addr: address, allowed: bool)` — admin
- `verify_merkle(auction_id: field, proof: [field; 20], path_bits: u32)` — bidder
- `verify_credential(auction_id: field, issuer: address, sig: signature, expiry: u32)` — bidder
- `register_gate(...)`, `check_admission(...)` — CPI only

### fairdrop_sealed.aleo (key user-facing transitions)
- `create_auction(...)` — creator
- `commit_bid_private(...)` / `commit_bid_public(...)` — bidder, commit phase only
- `commit_bid_private_ref(...)` / `commit_bid_public_ref(...)` — bidder with referral
- `reveal_bid(commitment: Commitment, ...)` — bidder, reveal phase only
- `slash_unrevealed(commitment: Commitment, auction_id: field)` — anyone, after end_block
- `close_auction(...)` — anyone, after supply_met or end_block
- `push_referral_budget(...)` — anyone, after close
- `claim(bid: Bid, auction_id: field)` — bidder, non-vesting
- `claim_vested(bid: Bid, auction_id: field)` — bidder, vest_enabled
- `withdraw_payments(...)` / `withdraw_unsold(...)` — creator
- `cancel_auction(...)` — creator
- `claim_voided(bid: Bid, auction_id: field)` — bidder holding Bid after cancel
- `claim_commit_voided(commitment: Commitment, auction_id: field)` — bidder holding Commitment after cancel

---

## 17. Gap Summary (Revised)

| # | Gap | Severity | Addressed in |
|---|---|---|---|
| G1 | `useAuctions` does N+50 RPC calls | Critical | §5/6 — TanStack Query + API |
| G2 | Detail page uses Dutch-only logic for all types | Critical | §4 — registry pattern |
| G3 | `BidForm` is Dutch-only | Critical | §4 — bid-forms/ |
| G4 | `CreateAuctionPage` is a stub | Critical | §10 |
| G5 | No earnings/closer/slash UI | High | §9 |
| G6 | No referral creation/claim UI | High | §13 |
| G7 | No vesting release UI | High | §11 |
| G8 | No gate verification UI | High | §14 |
| G9 | No admin panel | High | §15 |
| G10 | Type drift: local types vs @fairdrop/types | High | §3.3 |
| G11 | DRY: parsers/utils duplicate packages/sdk | High | §3.1 |
| G12 | `claim_commit_voided` missing from Claim flow | High | §11 |
| G13 | Supply misleadingly shown as free input | High | §10.3 |
| G14 | Token authorization doesn't work for multi-contract | High | §10.4 |
| G15 | Creation fee never shown | High | §10.2 |
| G16 | Sealed bid countdowns (commit/reveal phases) missing | Medium | §8.4 |
| G17 | No route-level error boundaries | Medium | §4.4 |
| G18 | No ascending price chart | Medium | §8.3 |
| G19 | No search | Medium | §7.3 |
| G20 | `TransactionTracker` unmount leak | Medium | §5.2 |
| G21 | `AleoWorker` never terminated | Medium | §4.4 |
| G22 | `auction_id` URL param not validated | Medium | §4.4 |
| G23 | `ParticipationReceipt` described as user-mintable (wrong) | Medium | §16 / §8.11 |
| G24 | Wrong function names (`claim_vested`, `withdraw_commission`) | Medium | §16 |
| G25 | No creator reputation display | Low | §8.2 |
| G26 | No URL state for filters (not bookmarkable/shareable) | Medium | §7.4 |
| G27 | Untrusted IPFS content rendered without sanitization (XSS/open redirect risk) | High | §6.5 |
| G28 | No network indicator or indexer liveness state | Medium | §5.7 |
| G29 | No transaction lifecycle UX (wallet states, error parsing) | High | §5.4/§5.5 |
| G30 | No `SYSTEM_PROGRAMS` constant — Aleo protocol program IDs (`token_registry.aleo`, `credits.aleo`) hardcoded ad-hoc | Medium | §3.1 |
| G31 | `finalize_claim_commission` revert not handled in error parser — no auto-retry for D11 concurrent credit | Medium | §5.4 |
| G32 | Commitment record filtering not specified — user may hold records across multiple sealed auctions | Medium | §8.5 |
| G33 | `push_referral_budget` misattributed to Creator only — contract allows anyone to call it | Medium | §8.7/§8.9 |
| G34 | `useClaimable` fetches records from one program only — Bid records span all 6 auction programs | High | §11.1 |
| G35 | `creator_nonces` not read before `create_auction` submit — nonce collision unhandled | High | §10.1 |
| G36 | Credential gate expiry UX missing — no expiry display, warning, or disabled submit | Medium | §14.2 |
| G37 | `parseU64` missing from SDK — `fetchCodeStatus` references it but it did not exist | High | §3.1/§9.4 |
| G38 | `parseU128` returns `string` used with BigInt operators — type error in `fetchCodeStatus` | High | §9.4 |
| G39 | Program address vs program ID — `set_role` takes `address` (aleo1...) not `.aleo` name; `ProgramEntry` had no `programAddress` field | Critical | §3.1/§10.1/§10.4 |
| G40 | `AUCTION_REGISTRY` direct indexing — no runtime null guard for unknown `AuctionType` from API | Medium | §4.2 |
| G41 | `useSequentialTx.advance()` does not expose step errors — callers cannot show which step failed or allow retry | Medium | §5.6 |

---

## 18. Migration Order

### Phase 1 — Foundation (no user-visible changes)
1. Merge `parsePlaintext` into `packages/sdk/src/parse/leo.ts`
2. Move auction parsers, registry helpers, credits, formatting into `packages/sdk/src/`
3. Delete local `src/shared/types/`; import from `@fairdrop/types/*`
4. Replace `src/config/network.ts` with `defineConfig(import.meta.env.*)`
5. Scaffold `apps/web/` structure; port bootstrap files
6. Set up TanStack Query + Zustand stores
7. Write `services/api.client.ts` + typed service modules

### Phase 2 — Listing & Detail (all types)
8. Replace `useAuctions` with TanStack Query → `GET /auctions` (G1)
9. Build `AUCTION_REGISTRY` + stubs for all per-type components (G2, G3 foundation)
10. Wire `AuctionDetailPage` to registry
11. Implement all bid-forms, price-panels, progress-panels per type
12. Sealed phase countdowns: commit / reveal / slash (G16)
13. Route-level error boundaries + skeletons (G17)
14. `auction_id` URL param validation (G22)
15. Search input (G19)

### Phase 3 — Creator Flow
16. 8-step create auction wizard (G4, G13, G14, G15)
17. Inline token authorization per contract (G14)

### Phase 4 — Actions & Earnings
18. Actions panel: close / cancel / slash / withdraw (G5 partial)
19. Earnings page: closer reward + slash + referral tabs (G5, G6)
20. `credit_commission` enumeration + `claim_commission` flow (G6)

### Phase 5 — User Features
21. Claim page: all record types + `claim_commit_voided` (G7, G12)
22. Vesting release: `fairdrop_vest.aleo/release` (G7)
23. Gate page: `verify_merkle`, `verify_credential` (G8)
24. Participation receipt display (G23)
25. Creator reputation display (G25)

### Phase 6 — Admin
26. Admin panel: config setters + allowed_caller matrix (G9)

### Phase 7 — Quality
27. Fix `TransactionTracker` teardown (G20)
28. Fix `AleoWorker` terminate (G21)

### Phase 8 — Guides
29. Write all guides in `docs/guides/`
30. In-app guide renderer

---

## 19. Key Design Decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | Registry pattern for per-type components | Adding a 7th type = one file per category; no if/else hunts |
| D2 | TanStack Query for server + chain data | Deduplication, stale/fresh tracking, automatic cleanup |
| D3 | Zustand for tx + UI state | No context re-renders; simpler than Redux |
| D4 | API-first for public data; wallet for private records | API has indexed, queryable data; wallet is the only source of private records |
| D5 | Recompute `currentPrice` client-side from block height | API price is seconds stale; decay/rise happens per block |
| D6 | Single source of types: `@fairdrop/types/*` | Prevents drift between backend and frontend |
| D7 | Referral link via `?ref=<address>` query param | Simple, shareable; pre-fills at bid time |
| D8 | Inline token authorization in wizard | Multi-contract protocol; authorization must be per auction type |
| D9 | Re-fetch protocol config before create_auction submit | `assert_config` reverts on drift; warn user if params changed during wizard |
| D10 | `credit_commission` separate from `claim_commission` | Contract design: crediting is permissionless; claiming requires consuming the record |
| D11 | Admin panel hidden unless connected === `protocol_admin` | Pointless for non-admin; reads admin address from chain |
| D12 | CEX-style two-column sticky layout for detail page | Information density; bid form always visible; bottom tabs for secondary info |
| D13 | Three-tier cache: localStorage (immutable) + TanStack Query (session) + API in-memory | TanStack Query resets on reload; truly immutable on-chain data has no reason to ever be re-fetched |
| D14 | Cache module lives in `packages/sdk/src/cache/`, not `apps/web` | No React dependency; reusable by any consumer; consistent with parse/registry/format modules |
| D15 | `CACHE_VERSION` constant namespaces all localStorage keys | Single constant bump busts all stale entries on deploy without user action |
| D16 | Immutable data cached with no expiry; protocol config with 1hr TTL, always re-fetched before `create_auction` | `assert_config` CPI reverts if snapshotted params drifted; immutable data literally cannot change |
| D17 | No client-side ZK proof generation — wallet handles it entirely | `executeTransaction` inside the wallet adapter runs proof generation; frontend only calls it and polls the result |
| D18 | URL state for all auction list filters | Bookmarkable, shareable, back-button safe; TanStack Query reacts to URL param changes automatically |
| D19 | Three-tier error handling: inline → toast → ErrorBoundary | Each tier handles a distinct failure scope; IPFS failures never surface beyond the component that triggered them |
| D20 | IPFS content treated as untrusted — `sanitizeExternalUrl`, no `dangerouslySetInnerHTML`, letter avatar fallback | Creator-supplied metadata is arbitrary; XSS and open redirect are real risks without sanitization |
| D21 | Network badge static from `VITE_ALEO_NETWORK`; indexer status polled every 30s | Two independent signals: one confirms environment, one confirms data freshness |
| D22 | Sequential multi-step flows via `useSequentialTx`; each step waits for `ACCEPTED` before enabling the next | Prevents partial-state bugs where step 2 executes before step 1 finalizes on-chain |
| D23 | `parseU64` returns `bigint`; `parseU128` returns `string` + `u128ToBigInt()` for arithmetic | u64 fits in Number at low counts but is unsafe at protocol scale; u128 is always unsafe — two distinct return types prevent silent precision loss |
| D24 | `ProgramEntry` carries `programAddress` (aleo1...) alongside `programId` — pre-computed in `programs.json` | `token_registry` takes address not name; runtime derivation would require Aleo WASM; pre-computed is simpler and has zero runtime cost |
| D25 | `getRegistrySlot()` wrapper instead of direct `AUCTION_REGISTRY[type]` indexing | TypeScript exhaustiveness is compile-time only; API can return unknown types; null guard prevents runtime crash |
| D26 | `useSequentialTx` exposes `error` state; `advance()` resets error and keeps step index on failure | Callers show which step failed; user can retry without restarting the whole flow |

---

## 20. Out of Scope

- `credential-signer` service implementation (separate design doc needed)
- Merkle allowlist proof generation tool (off-chain CLI)
- IPFS pinning service for metadata upload
- Mobile app
- Analytics / telemetry
- Multi-language i18n
