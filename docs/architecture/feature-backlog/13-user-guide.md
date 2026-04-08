# Plan: Fairdrop User Guide

## Summary

A structured, user-facing guide covering every auction mechanic, workflow, and earning
opportunity on Fairdrop. Content lives in `docs/guides/user-guide/` as plain `.md` files —
the canonical source of truth. The frontend renders the guide at `/guide` via a dedicated
React feature. Because the content is pure Markdown, it can be served verbatim on a separate
docs subdomain (e.g. `docs.fairdrop.xyz`) via VitePress, Docusaurus, or any static site
generator with zero modifications.

**Nothing is assumed.** Each implementation phase lists the exact codebase files to read
before writing the corresponding guide section. Facts are confirmed; nothing is guessed.

---

## Folder placement

The most appropriate folder is `docs/guides/user-guide/`. The `docs/guides/` directory
already holds the `credential-gate/` reference; the user guide is a parallel branch of
the same guides tree.

```
docs/guides/
├── credential-gate/          ← operator reference (existing)
└── user-guide/               ← NEW — end-user guide (this plan)
    ├── README.md             ← guide index / table of contents
    ├── 00-overview.md        ← what Fairdrop is
    ├── auctions/
    │   ├── README.md         ← auction types overview + comparison table
    │   ├── dutch.md
    │   ├── sealed.md
    │   ├── raise.md
    │   ├── ascending.md
    │   ├── lbp.md
    │   └── quadratic.md
    ├── creating/
    │   ├── README.md         ← wizard overview (8 steps)
    │   ├── 01-type.md
    │   ├── 02-token.md
    │   ├── 03-pricing.md     ← per-type pricing fields
    │   ├── 04-timing.md
    │   ├── 05-gate-vest.md   ← gate modes + vesting
    │   ├── 06-referral.md
    │   ├── 07-metadata.md
    │   └── 08-review.md
    ├── bidding/
    │   ├── README.md         ← how to place a bid (general)
    │   ├── dutch.md
    │   ├── sealed.md         ← commit + reveal phases
    │   ├── raise.md
    │   ├── ascending.md
    │   ├── lbp.md
    │   └── quadratic.md
    ├── claiming/
    │   ├── README.md         ← when and how to claim
    │   ├── claim.md          ← claim won tokens / refund credits
    │   ├── vesting.md        ← release vesting schedule
    │   └── sealed-reveal.md  ← reveal-then-claim flow for Sealed
    └── earnings/
        ├── README.md         ← earning opportunities overview
        ├── close.md          ← close an ended auction for closer reward
        ├── slash.md          ← slash unrevealed Sealed bids
        └── referral.md       ← referral commissions
```

---

## Frontend: `/guide` route

- Route already exists: `AppRoutes.guide = '/guide'` — currently shows a `Placeholder`.
- Create `apps/frontend/src/features/guide/` with the standard feature layout.
- Use [`react-markdown`](https://github.com/remarkjs/react-markdown) +
  [`remark-gfm`](https://github.com/remarkjs/remark-gfm) to render `.md` files imported as
  raw strings via Vite's `?raw` suffix.
- Sub-routes use React Router nested routes:
  `/guide`, `/guide/auctions/dutch`, `/guide/creating`, etc.
- A left-nav sidebar within the guide page links all sections — mirrors the docs folder tree.
- Pluggable: the `.md` files are imported from `docs/guides/user-guide/` relative to the
  monorepo root via Vite's `@/` alias or a dedicated path alias (e.g. `@guide`).
  If the guide is moved to a subdomain, the same files are pointed at by the docs site config
  — no content duplication.

---

## Implementation phases

### Phase 1 — Infrastructure + overview (no content yet, no speculation)

**Deliverables:**
- `docs/guides/user-guide/README.md` — table of contents (links only, populated per phase)
- `docs/guides/user-guide/00-overview.md` — what Fairdrop is, privacy model, Aleo context
- `apps/frontend/src/features/guide/` — scaffold: page shell, left-nav, markdown renderer,
  route wiring in `App.tsx`
- `AppRoutes` extended with guide sub-routes

**Before writing `00-overview.md`:** read `docs/architecture/DESIGN.md` (protocol summary),
`docs/README.md` (doc index), and `apps/frontend/src/features/dashboard/pages/DashboardPage.tsx`
(hero copy).

**Frontend scaffold steps:**
1. Install `react-markdown`, `remark-gfm` (check `package.json` first).
2. Create `features/guide/pages/GuidePage.tsx` — layout with left-nav + content pane.
3. Add Vite path alias `@guide` → `../../docs/guides/user-guide` in `vite.config.ts`.
4. Wire sub-routes in `App.tsx`: `/guide/*` → `GuidePage` with nested `Route` entries.

---

### Phase 2 — Auction types

**Confirmed sources (read before writing each file):**
- `apps/frontend/src/features/auctions/registry.ts` — `description`, `isContributionType`,
  `hasRaiseTarget`, `hasFillThreshold`, `supportsEarlyClose`, `hasPriceCurve` for each type.
- `apps/frontend/src/features/auctions/simulators/` — one simulator per type; explains the
  economic mechanics.
- `apps/frontend/src/features/auctions/price-panels/` — how price is displayed per type.
- `apps/frontend/src/features/auctions/pricing-steps/` — fields each type exposes when
  creating; field names, defaults, validation.

**Files to produce:**

| File | Confirmed type facts |
|---|---|
| `auctions/README.md` | Comparison table: 6 types × key flags from registry |
| `auctions/dutch.md` | Price steps down; uniform clearing price; early close; price curve |
| `auctions/sealed.md` | Commit-reveal; two-phase; price curve; early close |
| `auctions/raise.md` | Fixed price; contribution type; raise target; fill threshold; no price curve |
| `auctions/ascending.md` | Price rises over time; early close; price curve |
| `auctions/lbp.md` | Weight-decay LBP; price curve; no early close |
| `auctions/quadratic.md` | Square-root weighting; contribution type; raise target; fill threshold |

Each type file covers: how it works, who it is for, price mechanics, settlement mechanics,
what "winning" means, and a one-paragraph real-world analogy.

---

### Phase 3 — Creating auctions

**Confirmed wizard steps (from `CreateAuctionPage.tsx` `STEPS` array):**

| # | ID | Label | Wizard component |
|---|---|---|---|
| 1 | `type` | Type | `TypeStep` |
| 2 | `token` | Token | `TokenStep` |
| 3 | `pricing` | Pricing | `PricingStep` → per-type `*PricingStep` |
| 4 | `timing` | Timing | `TimingStep` |
| 5 | `gate` | Gate & Vest | `GateVestStep` |
| 6 | `referral` | Referral | `ReferralStep` |
| 7 | `metadata` | Metadata | `MetadataStep` |
| 8 | `review` | Review | `ReviewStep` |

**Before writing each guide file, read the corresponding wizard step component** to confirm
exact field names, constraints, and help text shown to users.

**Gate modes (confirmed from `packages/types/src/contracts/utilities/gate.ts`):**
- `0` = Open — no restriction
- `1` = Merkle — Merkle root allowlist; bidder proves inclusion with a proof
- `2` = Credential — issuer-signed credential from a `credential-signer` service

**Vesting fields (confirmed from wizard validation in `CreateAuctionPage.tsx`):**
- `vestEnabled: boolean`
- `vestCliffBlocks: number` — blocks before any tokens release
- `vestEndBlocks: number` — blocks until full release; must be > cliff

**Referral (confirmed from `ReferralStep.tsx`):**
- The auction automatically participates in the referral pool.
- Protocol fee → referral pool (percentage of protocol fee).
- `maxReferralPct` — max commission a referrer earns from the referral pool.
- No creator action required beyond reviewing the economics at this step.

**Pricing: read the `*PricingStep` component for each type before writing `03-pricing.md`**
to list the exact fields (start price, end price, step size, LBP weights, etc.).

---

### Phase 4 — Bidding

**Confirmed bid form components** (from `registry.ts` → `BidForm` field):

| Type | Form component | Notes |
|---|---|---|
| Dutch | `DutchBidForm` | Bid at current or higher price |
| Sealed | `SealedBidForm` + `SealedCommitForm` + `SealedRevealForm` | Two-phase: commit then reveal |
| Raise | `RaiseBidForm` | Contribution amount in ALEO credits |
| Ascending | `AscendingBidForm` | Bid at current price (price rises) |
| LBP | `LbpBidForm` | Buy at current weight-derived price |
| Quadratic | `QuadraticBidForm` | Contribution in ALEO credits; sqrt weighting |

**Before writing each type's bidding guide:** read the corresponding `*BidForm.tsx` to
confirm field names, validation rules, and any UX notes shown to the bidder.

**Sealed auction — two-phase flow (confirmed from component names):**
- Phase 1 (Commit): bidder submits a hidden commitment via `SealedCommitForm`.
- Phase 2 (Reveal): after `commitEndBlock`, bidder reveals via `SealedRevealForm`.
- **Read both forms** before writing `bidding/sealed.md` and `claiming/sealed-reveal.md`.

**Gate-gated auctions:** read `gate/components/MerkleGateForm.tsx` and
`gate/components/CredentialGateForm.tsx` before writing the gating section of `bidding/README.md`.

---

### Phase 5 — Claiming and vesting

**Confirmed pages:**
- `ClaimPage` at `apps/frontend/src/features/claim/pages/ClaimPage.tsx`
- `VestingPage` at `apps/frontend/src/features/vesting/pages/VestingPage.tsx`

**Before writing `claiming/claim.md`:** read `ClaimPage.tsx` and its child components to
confirm: what tokens/credits can be claimed, when they become claimable, how many
transactions are needed.

**Before writing `claiming/vesting.md`:** read `VestingPage.tsx` to confirm: how the
vesting schedule is displayed, what "release vesting" does, whether partial release is
supported, and what the cliff/end-block relationship means in practice.

**Before writing `claiming/sealed-reveal.md`:** read `SealedRevealForm.tsx` and confirm
the exact sequence: reveal → wait for finalize → claim.

---

### Phase 6 — Earnings

**Confirmed from `EarningsPage.tsx`:** three tabs, three earning actions.

**Close auctions (`earnings/close.md`):**
- Auctions in `Ended` or `Clearing` status are closeable by anyone.
- Closer earns `protocolConfig.closerReward` per auction closed.
- **Before writing:** read `CloseAuctionsTab.tsx` to confirm the close transaction,
  any conditions, and the reward amount source.

**Slash bids (`earnings/slash.md`):**
- Sealed auctions: bidders who committed but did not reveal can be slashed by anyone.
- Slasher earns the slashed amount (or a portion — confirm from `SlashBidsTab.tsx`).
- **Before writing:** read `SlashBidsTab.tsx` to confirm exact mechanics, how long after
  commit-end the slash window opens, and what the slasher receives.

**Referral commissions (`earnings/referral.md`):**
- Referrers earn a commission when their referred bidders participate.
- **Before writing:** read `ReferralCommissionsTab.tsx` and `ReferralPage.tsx` to confirm
  how a referral link is generated, how commissions are tracked, and how they are claimed.

---

## Pluggability notes

The guide is pluggable because:

1. **Content is pure Markdown** in `docs/guides/user-guide/`. No JSX, no framework lock-in.
2. **Frontend imports via `?raw`** — the `.md` content is a string. Switching to a different
   renderer (MDX, VitePress, Docusaurus) requires pointing the docs tool at the same folder.
3. **Subdomain hosting**: add a `vitepress.config.ts` (or equivalent) at the monorepo root
   that sources content from `docs/guides/user-guide/`. No content duplication.
4. **Internal links** in `.md` files use relative paths (`../auctions/dutch.md`). Both the
   frontend router and a static docs site resolve these correctly.

---

## What this plan does NOT cover

- Contract-level mechanics (covered in `docs/architecture/DESIGN.md`).
- Operator setup for credential-gate (covered in `docs/guides/credential-gate/`).
- API or indexer internals.
- Any mechanic not yet confirmed in the codebase — guide sections for those are
  explicitly deferred to their respective phase.

---

## Steps

1. **Phase 1**: scaffold `features/guide/`, wire route, create `README.md` + `00-overview.md`.
2. **Phase 2**: read registry + simulators + pricing steps → write all 7 auction type files.
3. **Phase 3**: read each wizard step component → write all 8 creation guide files.
4. **Phase 4**: read each bid form component + gate forms → write all 6 bidding files.
5. **Phase 5**: read `ClaimPage`, `VestingPage`, `SealedRevealForm` → write claiming files.
6. **Phase 6**: read `CloseAuctionsTab`, `SlashBidsTab`, `ReferralCommissionsTab` → write earnings files.
7. Link all files from `README.md` index; verify no broken relative links.
8. Update `docs/README.md` to include `guides/user-guide/` row.
