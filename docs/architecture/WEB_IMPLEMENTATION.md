# WEB_IMPLEMENTATION.MD — apps/web Frontend Implementation Todo

> Derived from WEB_DESIGN.md. Each item maps to a specific section in the design.
> Work through phases in order — each phase depends on the previous.

---

## Phase 1 — Foundation

### packages/sdk

- [ ] Merge `parsePlaintext` → `parseStruct` in `packages/sdk/src/parse/leo.ts` (`parseU64` + `u128ToBigInt` already added)
- [ ] Move auction parsers (`parseAuctionConfig`, `parseAuctionState`) → `packages/sdk/src/parse/auction.ts`
- [ ] Move token parsers (`parseTokenMetadata`, `asciiToU128`, `u128ToAscii`) → `packages/sdk/src/parse/token.ts`
- [ ] Move token registry queries (`fetchTokenMetadata`, `fetchTokenBalance`, `fetchTokenRole`, `computeTokenOwnerKey`) → `packages/sdk/src/registry/token.ts`
- [ ] Move credits helpers (`microToAleo`, `aleoToMicro`, `formatMicrocredits`, `isCreditsToken`) → `packages/sdk/src/credits/index.ts`
- [ ] Move format utils (`formatAmount`, `parseTokenAmount`, `truncateAddress`, `formatField`) → `packages/sdk/src/format/index.ts`
- [ ] Add `estimateDate(targetBlock, currentBlock, now?)` → `packages/sdk/src/format/blocks.ts`
- [ ] Add `sanitizeExternalUrl(raw)` (https-only allowlist) → `packages/sdk/src/format/url.ts`
- [ ] Build cache layer → `packages/sdk/src/cache/persist.ts` (`cacheKey`, `getPersisted`, `setPersisted`, `CACHE_VERSION`)
- [ ] Build per-entity cache files: `auction-config.ts`, `auction-index.ts`, `token-meta.ts`, `gate-config.ts`
- [ ] Move/export `AleoNetworkClient` singleton → `packages/sdk/src/client.ts`

### packages/ui

- [ ] Port `Spinner`, `ProgressBar`, `DataRow`, `PageHeader` → `packages/ui/src/ui/`
- [ ] Port `TokenAmountInput`, `CopyField` → `packages/ui/src/fairdrop/`
- [ ] Add `CountdownBlock` (`N blocks (~M min)` + tooltip) → `packages/ui/src/fairdrop/countdown.tsx`
- [ ] use `packages/ui/src/styles/globals.css`, `packages/ui/src/providers/theme-provider.tsx`, `packages/ui/src/hooks/use-mobile.ts`
### apps/web scaffold

- [ ] Create `apps/web/src/env.ts` — throws at module load on missing `VITE_*` vars
- [ ] Create `.env.example` with all 4 required vars (`VITE_ALEO_NETWORK`, `VITE_ALEO_RPC_URL`, `VITE_API_URL`, `VITE_IPFS_GATEWAY`)
- [ ] Delete legacy `src/shared/types/` — import exclusively from `@fairdrop/types/*`
- [ ] Replace `src/config/network.ts` with `defineConfig(import.meta.env.*)`
- [ ] Scaffold full `apps/web/src/` directory structure (§4.4 of WEB_DESIGN.md)
- [ ] Set up `providers/QueryProvider.tsx` (TanStack Query)
- [ ] Set up Zustand `stores/transaction.store.ts` (`txId`, `status`, `label`, `setTx`, `setStatus`, `reset`)
- [ ] Set up Zustand `stores/ui.store.ts`
- [ ] Write `services/api.client.ts` (`apiFetch`, `toQueryString`)
- [ ] Write `services/auctions.service.ts` (`list`, `get`, `bids`, `filters`)
- [ ] Write `services/tokens.service.ts`
- [ ] Write `services/users.service.ts`
- [ ] Write `services/indexer.service.ts` (`fetchIndexerStatus`)
- [ ] Write `services/config.service.ts` (`configService.get()` → `GET /config`)
- [ ] Fix `workers/AleoWorker.ts` — expose `terminate()`; call in `WalletProvider` cleanup `useEffect`
- [ ] `providers/WalletProvider.tsx` — network mismatch detection + blocking `NetworkMismatchModal`
- [ ] `shared/components/layout/TxStatusStepper.tsx` (fixed bottom-right, reads `transaction.store.ts`)
- [ ] `parseExecutionError` utility — known revert patterns: `assert_config`, `check_not_paused`, `finalize_claim_commission`
- [ ] `shared/components/layout/ErrorBoundary.tsx` — wraps each route in `app.tsx`
- [ ] `hooks/useSequentialTx.ts` — `error` state + retry-without-restart on failure (step index held on error)
- [ ] `hooks/useBlockHeight.ts` — TanStack Query, 5s staleTime + refetchInterval
- [ ] `hooks/useIndexerStatus.ts` — TanStack Query, 30s staleTime + refetchInterval
- [ ] `shared/components/layout/TopBar.tsx` — `NetworkBadge` (static from `env.network`) + `IndexerStatus` dot (live/delayed/lagging/offline) + stale data banner when `lagBlocks > 50`
- [ ] `shared/components/layout/Sidebar.tsx` — all routes listed

---

## Phase 2 — Listing & Detail

### Auction Listing

- [ ] `features/auctions/hooks/useAuctionParams.ts` — sync all `AuctionListParams` to URL via `useSearchParams`; `replace: true` on filter change
- [ ] `features/auctions/hooks/useAuctions.ts` — TanStack Query → `GET /auctions`; 15s staleTime, 30s refetchInterval
- [ ] `features/auctions/hooks/useAuction.ts` — TanStack Query → `GET /auctions/:id`; disable refetch when Cleared/Voided
- [ ] `features/auctions/hooks/useProtocolConfig.ts` — TanStack Query → `configService.get()`; 5min staleTime
- [ ] `features/auctions/components/AuctionCard.tsx` — name, logo + IPFS fallback, type badge, status badge, current price, progress bar, countdown, gate/vest icons
- [ ] `features/auctions/components/AuctionFilters.tsx` — type multi-select, status multi-select, gate, vested, creator, sort
- [ ] `features/auctions/components/AuctionSearch.tsx` — debounced 300ms → `q` param
- [ ] `features/auctions/pages/AuctionListPage.tsx` — filters + list + pagination

### AUCTION_REGISTRY

- [ ] `features/auctions/registry.ts` — `AuctionTypeSlot` interface + `AUCTION_REGISTRY` (all 6 types) + `getRegistrySlot(type)` null guard
- [ ] `features/auctions/bid-forms/DutchBidForm.tsx` — qty × price, private/public credits paths, referral code input, fee breakdown
- [ ] `features/auctions/bid-forms/SealedBidForm.tsx` — commit phase (qty + nonce input) + reveal phase (pre-filled from decrypted `Commitment` record via AutoDecrypt) + past-reveal fallback
- [ ] `features/auctions/bid-forms/RaiseBidForm.tsx` — payment amount only
- [ ] `features/auctions/bid-forms/AscendingBidForm.tsx` — qty × current price
- [ ] `features/auctions/bid-forms/LbpBidForm.tsx` — payment amount
- [ ] `features/auctions/bid-forms/QuadraticBidForm.tsx` — quantity (votes)
- [ ] All bid forms: optional `?ref=<address>` pre-fill; fee breakdown from `useProtocolConfig`; disabled when `lagBlocks > 10`
- [ ] `features/auctions/price-panels/DutchPricePanel.tsx` — step-down chart, vertical block line, current price dot
- [ ] `features/auctions/price-panels/SealedPricePanel.tsx` — mini Dutch chart for reference; `clearingPrice` shown after close
- [ ] `features/auctions/price-panels/RaisePricePanel.tsx` — fixed price label + raise target progress
- [ ] `features/auctions/price-panels/AscendingPricePanel.tsx` — step-up chart, current price highlighted
- [ ] `features/auctions/price-panels/LbpPricePanel.tsx` — bonding curve chart
- [ ] `features/auctions/price-panels/QuadraticPricePanel.tsx` — fixed price + vote-weight curve
- [ ] `features/auctions/progress-panels/DefaultProgressPanel.tsx` — supply bar (`totalCommitted / supply`)
- [ ] `features/auctions/progress-panels/RaiseProgressPanel.tsx` — supply bar + raise target threshold line
- [ ] `features/auctions/pricing-steps/DutchPricingStep.tsx` — wizard step 3 for Dutch
- [ ] `features/auctions/pricing-steps/SealedPricingStep.tsx` — Dutch fields + `commitEndBlock` offset
- [ ] `features/auctions/pricing-steps/RaisePricingStep.tsx` — `fixedPrice`, `raiseTarget`
- [ ] `features/auctions/pricing-steps/AscendingPricingStep.tsx` — `startPrice`, `ceilingPrice`, rise params
- [ ] `features/auctions/pricing-steps/LbpPricingStep.tsx` — weight params
- [ ] `features/auctions/pricing-steps/QuadraticPricingStep.tsx` — `pricePerToken`, `maxVotes`

### Auction Detail Page

- [ ] `features/auctions/pages/AuctionDetailPage.tsx` — 2-column layout (60/40, sticky right on desktop; stacked mobile)
- [ ] Header — name, logo + letter avatar fallback, type badge (6 colors), status badge, gate/vest icons, `auction_id` copyable monospace, creator link, creator reputation
- [ ] `features/auctions/hooks/useCurrentPrice.ts` — pure client-side recomputation per `blockHeight` (not from API)
- [ ] `features/auctions/components/AuctionCard.tsx` — sealed auction: 3-phase progress indicator (commit → reveal → closed) + phase-correct countdowns (`commit_end_block`, `end_block`, slash window)
- [ ] **Actions Panel** (collapsible card, right column below bid panel):
  - [ ] Close auction — label "Close Auction" (creator) or "Claim Closer Reward: N ALEO" (non-creator)
  - [ ] Cancel auction — creator only, Upcoming/Active only
  - [ ] Slash unrevealed — Sealed only, anyone, after `end_block`
  - [ ] Withdraw revenue + Withdraw unsold — creator, Cleared status
  - [ ] Push referral budget — anyone, Cleared + `referralBudget > 0`
- [ ] **Info Tab** — all data rows: auction ID, sale token, supply, start/end block, commit end block (Sealed), gate mode, vesting, protocol fee, closer reward, slash reward (Sealed), referral budget, metadata links (§8.8)
- [ ] **Earn Tab** — per-auction earning opportunities: close, slash, push referral budget, credit commission, claim commission (§8.9)
- [ ] **Referral Tab** — user's `ReferralCode` for this auction; "Create Referral Code" button; share link copy (§8.10)
- [ ] **Your Receipts Tab** — `ParticipationReceipt` records from `requestRecords(PROGRAMS.proof.programId)` filtered by `auction_id`; display only; empty state copy (§8.11)
- [ ] `auction_id` URL param validation via `isValidField()` before any RPC call; render 404 on invalid format
- [ ] Route-level `<ErrorBoundary>` wrapping `AuctionDetailPage`

---

## Phase 3 — Creator Flow

- [ ] **8-step Create Auction Wizard** (`features/auctions/pages/CreateAuctionPage.tsx`):
  - [ ] Step 1 — Auction type: 6 type cards (name, 1-line mechanism, icon)
  - [ ] Step 2 — Token & Supply: record selector from `useTokenRecords()`; supply = `record.amount` (read-only); inline authorization check → `token_registry/set_role(PROGRAMS[type].programAddress, 3)` via `useSequentialTx`; "Split in Token Manager →" link
  - [ ] Step 3 — Pricing: dispatched to `pricing-steps/` registry per selected type
  - [ ] Step 4 — Timing: `startBlock` (default `currentBlock + 100`), `endBlock`; `minDuration` from `useProtocolConfig` shown; estimated wall-clock dates under each input; Sealed adds `commitEndBlock` between start and end
  - [ ] Step 5 — Gate & Vesting: gate mode selector (Open/Merkle/Credential); vesting toggle; if vest enabled → inline vest authorization check → `set_role(PROGRAMS.vest.programAddress, 3)`
  - [ ] Step 6 — Referral Budget: `referralPoolBps` input; show `maxReferralBps` from `useProtocolConfig`
  - [ ] Step 7 — Metadata: name, description; logo upload → IPFS → `POST /metadata` → hash shown read-only; website, Twitter, Discord (optional)
  - [ ] Step 8 — Review & Submit: full summary table; creation fee (from `useProtocolConfig`, always visible, non-refundable warning); estimated protocol fee at close; re-fetch config immediately before submit + drift warning banner if params changed; read `creator_nonces[wallet.address]` from auction program immediately before `executeTransaction`; surface nonce collision error + re-read on revert

---

## Phase 4 — Actions & Earnings

- [ ] **Earnings Page** (`features/earnings/pages/EarningsPage.tsx`, route `/earnings`):
  - [ ] Summary header: closer rewards total, referral earned total, slash opportunities count
  - [ ] Tab — Close Auctions: `GET /auctions?status=ended`; sorted oldest-ended-first; "Close & Earn N ALEO" button per row
  - [ ] Tab — Slash Bids: sealed auctions past `end_block` with unrevealed commitments; slash reward per bid; `slash_unrevealed(commitment, auction_id)` — requires user to hold the `Commitment` record
  - [ ] Tab — Referral Commissions: per `ReferralCode` record from wallet; `fetchCodeStatus` (earned, uncredited keys, reserveFunded); "Credit N Bidder(s)" via `useSequentialTx`; "Claim N ALEO" via `claim_commission`; auto-retry on `finalize_claim_commission` revert (re-read `earned[code_id]` and resubmit once)

---

## Phase 5 — User Features

### Claim Page

- [ ] `features/claim/hooks/useClaimable.ts` — `Promise.all` across all 6 auction program IDs; flat-merge results; include Commitment records from `PROGRAMS.sealed`; `VestedAllocation` records from `PROGRAMS.vest`
- [ ] `features/claim/pages/ClaimPage.tsx` — group by auction; dispatch by record type + auction state:
  - `Bid` + Cleared + vest disabled → `claim(bid, auction_id)`
  - `Bid` + Cleared + vest enabled → `claim_vested(bid, auction_id)` → issues `VestedAllocation`
  - `Bid` + Voided → `claim_voided(bid, auction_id)`
  - `Commitment` + Voided → `claim_commit_voided(commitment, auction_id)`
  - `VestedAllocation` + `blockHeight >= cliff_block` → `release(vest, amount)`
- [ ] Vesting release display per `VestedAllocation`: total, released, vested-so-far (`computeVested` mirroring contract math), cliff/fully-vested block estimates, release amount input (max = vested_so_far − released)
- [ ] "Claim All" batch where multiple claimable records exist for same auction

### Gate Page

- [ ] `features/gate/pages/GatePage.tsx` — reached from bid panel when `gate_mode != Open`
- [ ] Merkle gate: explain allowlist; 20-element proof array input + `path_bits u32`; `verify_merkle` tx; bid panel unlocks on ACCEPTED
- [ ] Credential gate: show issuer address from `credential_issuers[auction_id]`; sig + expiry block input; `verify_credential` tx
- [ ] Credential expiry UX:
  - `currentBlock < expiry - 10` → green "Expires at block N (~M min)"
  - `expiry - 10 ≤ currentBlock < expiry` → amber warning "Credential expires in N blocks — submit soon"
  - `currentBlock >= expiry` → "Credential has expired." — submit hidden, "Get New Credential" link shown

### Referral Page

- [ ] `features/referral/pages/ReferralPage.tsx` (route `/referral`)
- [ ] Auction search by name or ID
- [ ] Commission BPS input: validated ≤ `maxReferralBps` from `useProtocolConfig`; "Create Code" → `create_code(auction_id, commission_bps)`
- [ ] Share link copy: `https://app.fairdrop.xyz/auctions/:id?ref=<myAddress>`
- [ ] Code list per `ReferralCode` record: auction name, commission rate, `earnedAmount`, uncredited count, "Credit N Bidder(s)" (via `useSequentialTx`), "Claim N ALEO"

### Vesting Page

- [ ] `features/vesting/pages/VestingPage.tsx` (route `/vesting`)
- [ ] List all `VestedAllocation` records from wallet
- [ ] Per record: total, released, vested so far, cliff/end dates, release amount input, `release(vest, amount)` tx

### Remaining Detail Page features

- [ ] Creator reputation from `fairdrop_proof_v2.aleo/reputation[creator]` — displayed in auction header
- [ ] Participation receipts tab fully wired (filter `requestRecords(PROGRAMS.proof.programId)` by `auction_id`)

---

## Phase 6 — Admin

- [ ] `/admin` route — only render if `wallet.address === protocolConfig.protocolAdmin`; otherwise redirect
- [ ] `features/admin/pages/AdminPage.tsx`:
  - [ ] `fairdrop_config_v3.aleo` param editor: display current value + input + hard cap per param; setter transition per row (9 params, see §15.1)
  - [ ] Pause toggle: red, labeled "Emergency Pause — halts all auction activity" / "Resume Protocol"
  - [ ] Admin transfer (`set_protocol_admin`): prominent red warning box; require new address typed twice before submit
  - [ ] `set_allowed_caller` matrix: 4×6 grid (utility contracts × auction programs); ✓/✗ read from `allowed_callers[programAddr]` on each utility; "Authorize" / "Revoke" per cell; "Authorize All Missing" batch button

---

## Phase 7 — Quality

- [ ] Fix `TransactionTracker` unmount teardown — AbortController cleanup in `useEffect` return
- [ ] Fix `AleoWorker` singleton — `terminate()` called in `WalletProvider` cleanup `useEffect`
- [ ] Stale data banner — non-blocking top-of-page; shown when `lagBlocks > 50` or API unreachable; auto-clears on next successful fetch
- [ ] IPFS `<img>` `onError` → letter avatar fallback; failure never propagates to toast or ErrorBoundary

---

## Phase 8 — Guides

- [ ] Write `docs/guides/` content — one guide per major flow: create auction, bid, claim, referral, vesting, gate, admin
- [ ] In-app guide renderer — links from feature pages to the relevant guide section
