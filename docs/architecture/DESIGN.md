# Fairdrop — Architecture & Design Decisions

This document is the single source of truth for all architectural decisions, constraints, tradeoffs, and open questions. Update it before changing any contract or companion contract design. It is not audience-facing — write plainly.

---

## Table of Contents

1. [What Fairdrop Is](#1-what-fairdrop-is)
2. [Contract Architecture](#2-contract-architecture)
3. [The Aleo Finalize Constraint](#3-the-aleo-finalize-constraint)
4. [Auction Types](#4-auction-types)
5. [Companion Contracts](#5-companion-contracts)
6. [Core Data Model](#6-core-data-model)
7. [Key Design Decisions & Why](#7-key-design-decisions--why)
8. [Known Gaps & Their Solutions](#8-known-gaps--their-solutions)
9. [What Is Live](#9-what-is-live)
10. [Implementation Order](#10-implementation-order)
11. [Backend Architecture](#11-backend-architecture)
12. [Privacy Threat Model](#12-privacy-threat-model)

---

## 1. What Fairdrop Is

A token launch platform on Aleo. Three auction modes, one shared infrastructure layer.

**The core claim:** the only token launch platform where bid quantities are sealed during the auction. This is structurally impossible on transparent chains — Aleo's ZK model makes it native.

**Current live product:** `fairdrop_dutch_v3.aleo` (was `fairdrop_v4.aleo`) — a Dutch descending-price auction with uniform clearing price, dual private/public bid paths, and full `token_registry.aleo` + `credits.aleo` CPI integration. Working on Aleo Testnet Beta.

---

## 2. Contract Architecture

```
fairdrop_dutch_v3.aleo      ← live. Dutch descending-price auction.
fairdrop_sealed_v3.aleo     ← build next. Sealed-bid commit-reveal, uniform clearing price.
fairdrop_raise_v3.aleo      ← fixed-price sealed allocation, pro-rata by payment.
fairdrop_ascending_v3.aleo  ← ascending-price auction, pay-what-you-bid, early = cheapest.
fairdrop_lbp_v3.aleo        ← supply-weighted descending price. Bots can't frontrun.
fairdrop_quadratic_v3.aleo  ← pro-rata by sqrt(payment). Anti-whale, ZK-native fairness.

     all six import ↓

fairdrop_gate_v2.aleo       ← allowlist + ZK credential gating
fairdrop_proof_v2.aleo      ← participation receipts + creator reputation
fairdrop_ref_v2.aleo        ← referral codes + commission distribution
fairdrop_vest_v2.aleo       ← post-claim token vesting
```

**PROGRAM_SALT constants (assigned before any deployment — changing breaks all existing IDs):**
```
fairdrop_dutch_v3.aleo      PROGRAM_SALT = 1field
fairdrop_ascending_v3.aleo  PROGRAM_SALT = 2field
fairdrop_sealed_v3.aleo     PROGRAM_SALT = 3field
fairdrop_raise_v3.aleo      PROGRAM_SALT = 4field
fairdrop_lbp_v3.aleo        PROGRAM_SALT = 5field
fairdrop_quadratic_v3.aleo  PROGRAM_SALT = 6field
```

**Why split:**
- Core contracts handle money. Utility contracts handle identity and social features.
- Each contract is small enough to be fully read in a review session.
- Utility contracts are independently auditable and reusable across auction types.
- New features don't require touching money-handling code.
- A 2000-line monolith cannot be fully absorbed in a demo review. Four 150-line focused contracts can.

**CPI direction:** auction contracts import and call utility contracts. Utility contracts never call auction contracts. One-way dependency.

**Record ownership:** records belong to their defining program. `fairdrop_dutch_v3.aleo/Bid` cannot be consumed by `fairdrop_sealed_v3.aleo`. Each auction type defines its own record types. Utility contracts define their own records (e.g. `fairdrop_proof_v2.aleo/ParticipationReceipt`).

**Leo contract mutability (important):** Leo contracts deployed on-chain are upgradeable within these rules:
- **Allowed:** add new `import` statements, add new transitions, add new finalize functions, modify existing finalize/transition logic, add new mappings, add new records, add new structs.
- **Not allowed:** change existing transition or finalize parameter lists or return types, delete existing records or mappings.
- **Strategy:** bump version (`fairdrop_dutch_v1`, `_v2`, ...) when a breaking interface change is unavoidable. Non-breaking additions can be deployed in-place. This means most Phase 1 work is additive and does not require version bumps.

---

## 3. The Aleo Finalize Constraint

**This is the most important architectural constraint in the entire system. Every design decision flows from it.**

Aleo `finalize` functions (on-chain execution) only accept **public** inputs. Any value that updates a public mapping must arrive as a public parameter — it cannot be private.

**Consequence for sealed bids:** to accumulate `total_committed` in a public mapping, bid quantities must be public at the time they reach finalize. This means you cannot have both:
- Hidden quantity during the auction
- Running on-chain supply tracking

**The only solution on current Aleo:** commit-reveal.
- Commit phase: quantity is hidden (only a hash reaches finalize). Payment is locked.
- Reveal phase: quantity is revealed to finalize. `total_committed` is updated.

**There is no simpler mechanism that achieves true quantity hiding with price discovery on Aleo today.** Multi-party computation and homomorphic encryption are not available.

**The one exception:** `fairdrop_raise_v3.aleo` avoids commit-reveal by abandoning price discovery. It tracks only `total_payments` (public), computes allocation privately at claim time. No quantity ever reaches finalize.

---

## 4. Auction Types

### 4a. Dutch Auction (`fairdrop_dutch_v3.aleo`)
**Status:** live on testnet.

Price descends block-by-block from `start_price` to `floor_price` on a fixed decay schedule. Bids are accepted at the current price. When `total_committed >= supply`, the auction closes and the price at that block becomes the uniform clearing price. All winners pay the same price regardless of when they bid.

**Privacy:** bid source is hidden (private credits UTXO consumed). Bid quantity is public (required for `total_committed` tracking). Order book is visible in real time.

**Key params in AuctionConfig:**
```
supply, start_price, floor_price, start_block, end_block,
price_decay_blocks, price_decay_amount, min_bid_amount,
max_bid_amount, sale_scale, payment_token_id, sale_token_id,
gate_mode, vest_enabled, vest_cliff_blocks, vest_end_blocks,
metadata_hash: field   // BHP256 of off-chain metadata JSON (name, description, website, logo IPFS CID)
```

**`metadata_hash`**: Leo has no string type — freeform text cannot be stored directly. A single `field` stores the BHP256 hash of the metadata JSON uploaded to IPFS by the creator at `create_auction` time. The frontend uses this to fetch and verify off-chain metadata. Token name and symbol come from `token_registry.aleo/TokenMetadata` via `sale_token_id` — `metadata_hash` covers auction-specific context only.

**`sale_scale = 10^sale_token_decimals`** — passed by frontend at creation, stored in config. Eliminates registry reads in finalize. Used in all payment math: `payment * sale_scale >= quantity * price`.

**`create_auction` input validation (required in finalize_create_auction for all auction types):**
```
// Division-by-zero guards:
assert(config.price_decay_blocks > 0u32)   // Dutch, Sealed
assert(config.price_rise_blocks > 0u32)    // Ascending
assert(config.end_block > config.start_block)  // LBP (total_duration denominator)
assert(config.supply > 0u128)              // All (allocation denominators)

// Block ordering:
assert(config.start_block >= block.height) // Cannot create auction in the past
assert(config.end_block > config.start_block)
// Sealed only:
assert(config.commit_end_block > config.start_block)
assert(config.reveal_end_block > config.commit_end_block)

// Price sanity:
assert(config.start_price >= config.floor_price)   // Dutch, Sealed
assert(config.ceiling_price >= config.floor_price)  // Ascending
assert(config.min_bid_amount > 0u128)
```
These assertions prevent arithmetic panics in downstream finalize functions. A misconfigured auction cannot be fixed post-deployment.

**`cancel_auction` transition (all auction types):**

Creator-only, callable only before `start_block` (no bids possible yet) OR when `total_committed == 0` (no bids placed). Cannot cancel an auction with live bids.

```
transition cancel_auction(auction_id: field)
  // Precondition check in finalize:
  //   assert(self.signer == config.creator)
  //   assert(block.height < config.start_block || state.total_committed == 0)
  //   assert(!state.cleared && !state.voided)
  //   state.voided = true  (reuses void path for clean refund logic)
  // Side effects:
  //   creator calls withdraw_unsold separately to recover sale token mint budget
  //   no escrow_payments to return (no bids placed)
```

If bids have been placed (`total_committed > 0`), `cancel_auction` is rejected — the auction must run to completion or void naturally (raise not meeting target). This prevents rug-pull cancellations. Bidders can always recover funds via `claim_voided` if `state.voided == true`.

---

### 4b. Sealed-Bid Auction (`fairdrop_sealed_v3.aleo`)
**Status:** not yet built. Build after utility contracts.

Three on-chain phases, two user actions (third is automated):

```
COMMIT WINDOW [start_block → commit_end_block]
  User action: commit_bid()
  - payment locked in escrow
  - commitment = BHP256::hash(quantity, nonce, bidder) stored in pending_commits
  - Commitment record issued to bidder
  - Nothing about quantity reaches on-chain state

REVEAL WINDOW [commit_end_block → reveal_end_block]
  User action: reveal_bid()  ← frontend auto-submits this
  - Commitment record consumed
  - Hash verified on-chain: BHP256::hash(quantity, nonce, self.signer) == stored hash
  - effective_quantity = min(quantity, max_bid_amount)  ← post-reveal capping
  - total_committed += effective_quantity
  - Bid record issued to bidder

SLASH WINDOW [after reveal_end_block]
  Anyone: slash_unrevealed()
  - pending_commits entries where revealed == false → forfeit
  - payment split: 80% protocol_treasury, 20% caller
```

**Clearing price mechanism (G12 — resolved):**

Clearing price = Dutch price at `commit_end_block`. The price descends block-by-block during the commit window (same `price_decay_amount` / `price_decay_blocks` config as Dutch). After `commit_end_block`, price movement stops. The clearing price is fully determined before any reveals — no manipulation possible.

In `finalize_close_auction`:
```
blocks_elapsed = commit_end_block - config.start_block
price_drop = blocks_elapsed * config.price_decay_amount / config.price_decay_blocks
clearing_price = config.start_price - min(price_drop, config.start_price - config.floor_price)
```

No `committed_price` field needed in `CommitState` — clearing price is always computable from config. Bidders lock `payment_amount` at commit time to cover their bid at any price in the window. The difference is refunded at claim: `refund = bid.payment_amount - actual_quantity * clearing_price / sale_scale`.

**Why this design:** the Dutch descent creates a natural deadline incentive (commit before `commit_end_block`). Uniform clearing price ensures all winners pay the same. The clearing price is set before reveals begin, so reveal order cannot influence price. Bidders simply lock sufficient collateral at commit time.

**New AuctionConfig fields needed:**
```
commit_end_block: u32
reveal_end_block: u32
```

**New mappings:**
```
pending_commits: field => CommitState   // commitment_hash → { payment_amount, revealed }
commit_counts: field => u64             // auction_id → commits (for analytics)
```

**Minimum collateral enforcement at commit time (C4 fix):**
Since `clearing_price` is deterministic from config (Dutch price at `commit_end_block`), it is computable inside the transition's private execution. The transition asserts:
```
let clearing_price: u128 = compute_dutch_price(config, config.commit_end_block);
assert(payment_amount >= quantity * clearing_price / sale_scale);
```
`quantity` is private in the transition body — this check is valid there (private inputs are available). The ZK proof attests the check was performed honestly. Finalize receives only the public `payment_amount` (already validated). This prevents underpayment and the resulting underflow at claim.

**New structs:**
```
struct CommitKey { auction_id: field, quantity: u128, nonce: u64, bidder: address }
// auction_id included to prevent cross-auction hash reuse (C5 fix)

struct CommitState { payment_amount: u128, revealed: bool }
// Note: no committed_price in CommitState — clearing price computed from config at close time
```

**`cancel_commitment` transition (missing spec — added):**
Callable during the commit window only (`block.height < config.commit_end_block`). Consumes the `Commitment` record. Refunds `payment_amount` via `transfer_public_to_private`. In finalize:
```
finalize_cancel_commitment(commitment_hash, auction_id, bidder):
  // Mark revealed=true to prevent future slashing
  pending_commits.set(commitment_hash, { payment_amount: 0, revealed: true })
  // Reset bid_committed so bidder can re-commit in the same window
  bid_committed.set(BHP256::hash(bidder, auction_id), false)
  escrow_payments.set(auction_id, current - payment_amount)
```
Resetting `bid_committed = false` allows the bidder to submit a corrected commitment before the window closes.

**`slash_unrevealed` caller reward delivery (M5):**
The reward amount is derived from `pending_commits[hash].payment_amount` (known only in finalize). The transition uses the same caller-param pattern (D11): caller passes `public payment_amount`, which is validated against the stored value in finalize. The ZK proof attests nothing sensitive here since slash payment amounts are already public. The 20% reward is computed in the transition body and delivered via `transfer_public_to_private` CPI.

**UX simplification:** the reveal step is submitted automatically by the frontend. It stores `(quantity, nonce)` in localStorage at commit time. When the reveal window opens it submits `reveal_bid` without user interaction (or with a one-click prompt). User experience: two steps (bid, claim), not three.

**Why bidder must be online for reveal:** Aleo records are encrypted to the owner's view key. Only the owner can decrypt and prove knowledge of the record's fields. Reveals cannot be delegated to a relayer — the prover must hold the private key.

**Slasher bot — required infrastructure (S5):** `slash_unrevealed(commitment_hash)` is permissionless and callable after `reveal_end_block`. But `pending_commits` has no on-chain iterator. A slasher cannot enumerate unrevealed commitments — they must already know which hashes to target. The only way to know this is to watch the chain. **Fairdrop must run a slasher bot** that:
1. Watches for `commit_bid` finalize events, records all `commitment_hash` values
2. After `reveal_end_block`, checks which hashes have `revealed == false`
3. Calls `slash_unrevealed(hash)` for each unrevealed commitment, collecting the 20% caller reward

Without the slasher bot, non-revealers keep their locked funds indefinitely. This is the exact griefing vector slashing was designed to prevent. The bot is protocol infrastructure, not optional. It belongs in the deployment checklist.

**Slasher bot cold-start:** the bot wallet must be pre-funded with credits before submitting the first `slash_unrevealed` (to pay the transaction fee). Once active, the 20% reward per slashed commitment self-funds subsequent operations. The Fairdrop treasury funds the initial wallet balance. Operational monitoring must alert if the bot wallet drops below a minimum balance threshold.

**`close_auction` preconditions for sealed auction:** different from Dutch/ascending/LBP. For sealed, the state is not fully settled until all reveals are in and the slash window has ended. `finalize_close_auction` must assert:
```
assert(block.height > config.reveal_end_block)  // slash window has passed
// No check on total_committed < supply — reveals may fill supply, may not
// If no bids were ever committed (commit_counts == 0), void the auction
assert(state.total_committed > 0 || /* handle 0-bid void case */)
```
`ended_at_block` is set to `reveal_end_block` (not `block.height` at close), so vesting schedules are consistent regardless of when `close_auction` is called after the window ends.

---

### 4c. Fixed-Price Raise (`fairdrop_raise_v3.aleo`)
**Status:** not yet built. Simplest to build — no commit-reveal.

Creator sets `raise_target` (total credits to collect) and `supply` (tokens to distribute). Implied price = `raise_target / supply`. Bidders lock any payment ≥ `min_payment`. No quantity specified at bid time.

```
At bid:   payment_amount is public (updates total_payments)
          nothing else reaches on-chain state

At close: clearing_price = raise_target / supply (fixed)
          if total_payments < raise_target → floor_price fallback

At claim: actual_quantity = payment * supply / total_payments  (pro-rata)
          computed privately from Bid record
          never public
```

**Why no commit-reveal:** total_payments accumulates publicly. Quantity is never specified until claim and computed privately there. Allocation is always pro-rata — first-come-first-served doesn't apply.

**Both bid paths (M3 fix):** like `fairdrop_dutch_v3.aleo`, the raise supports:
- `bid_private` — consume credits UTXO. Source address is hidden. `payment_amount` still reaches finalize publicly (required to update `total_payments`).
- `bid_public` — deduct from public credits balance. Both source and amount are public.

The privacy benefit of `bid_private` is hiding the source UTXO (identity), not the amount. Worth implementing — same pattern as Dutch, adds one transition.

**Void-if-below-target (S10 — resolved):** if `total_payments < raise_target` at `close_auction`, the raise is voided (`state.voided = true`). Bidders call `claim_voided` for a full refund. Creator calls `withdraw_unsold` to recover the full supply — since `total_committed = 0` always in the raise (no quantity is ever specified), `config.supply - state.total_committed = supply`, and `withdraw_unsold` correctly returns all tokens. This is by construction, not coincidence, and must be documented to implementers.

**Tradeoff:** no price discovery. Fixed price is set by creator. This is a community raise, not a price-finding mechanism.

---

### 4d. Ascending Dutch (`fairdrop_ascending_v3.aleo`)
**Status:** not yet built. Simplest new auction type — invert the Dutch formula.

Price starts at `floor_price` and rises block-by-block to `ceiling_price`. Early bidders pay the least. Supply fills first-come-first-served. Auction closes when `total_committed >= supply` or `block.height >= end_block`.

**Payment model: pay-what-you-bid (not uniform clearing).** Bidders pay the price at the block they bid. Unlike descending Dutch, the clearing price cannot be applied retroactively — early bidders paid less and we cannot charge them more. Conversely, late bidders paying more cannot be refunded to a lower price. Each `Bid` record carries the `bid_price` at commit time. At claim: `cost = bid.quantity * bid.bid_price / sale_scale`. No refund unless voided.

```
In finalize_place_bid:
  blocks_elapsed = block.height - config.start_block
  price_rise = blocks_elapsed * config.price_rise_amount / config.price_rise_blocks
  current_price = min(config.floor_price + price_rise, config.ceiling_price)
  assert(payment_amount * sale_scale >= quantity * current_price)
  assert(block.height >= config.start_block && block.height < config.end_block)
  assert(!state.supply_met)
```

**Updated `Bid` record for ascending:**
```
record Bid {
    owner: address,
    auction_id: field,
    quantity: u128,
    payment_amount: u128,
    bid_price: u128,   ← price at time of bid (pay-what-you-bid)
}
```

**AuctionConfig fields:**
```
supply, floor_price, ceiling_price, start_block, end_block,
price_rise_blocks, price_rise_amount, min_bid_amount, max_bid_amount,
sale_scale, payment_token_id, sale_token_id, gate_mode
```

**Creator revenue:** `state.total_payments` — no refunds beyond voided auctions. Revenue is variable and typically higher than descending Dutch (late bidders pay ceiling).

**Why compelling:** rewards early commitment with the cheapest price. Inverts the descending Dutch's "wait for the dip" metagame. Ideal for community raises where early supporters should be rewarded. Descending and ascending Dutch as a pair gives creators full control over which direction to create price incentives.

---

### 4e. LBP — Liquidity Bootstrap Pool (`fairdrop_lbp_v3.aleo`)
**Status:** not yet built. Most demanded DeFi launch mechanism on current chains — better on Aleo because frontrunning bots are structurally impossible.

Price is a joint function of time elapsed AND remaining supply. As tokens sell, the price naturally decelerates its descent — high demand slows the price drop. If nobody buys, price drops fast to attract buyers. The mechanism self-corrects toward market-clearing without an oracle.

**Price formula:**
```
remaining     = config.supply - state.total_committed
time_remaining = config.end_block - block.height
total_duration = config.end_block - config.start_block

// Both fractions use PRECISION = 1_000_000u128 (1e6, avoids u128 overflow)
supply_fraction = remaining * PRECISION / config.supply
time_fraction   = time_remaining * PRECISION / total_duration

price_spread    = config.start_price - config.floor_price
current_price   = config.floor_price
                + price_spread * supply_fraction / PRECISION
                              * time_fraction   / PRECISION
```

When `remaining = supply` (nothing sold) and time is full: `current_price = start_price`.
When `remaining = 0` (fully sold): `current_price = floor_price` (all proceeds already locked).
When `time_remaining = 0`: `current_price = floor_price` regardless of supply.

**Payment model: pay-what-you-bid** (same as ascending Dutch). Each `Bid` records `bid_price`. Creator revenue = `total_payments`. No uniform clearing refund.

**AuctionConfig fields:**
```
supply, start_price, floor_price, start_block, end_block,
min_bid_amount, max_bid_amount, sale_scale, payment_token_id, sale_token_id, gate_mode
// No price_decay_blocks — price is a function of both time and supply, not a fixed schedule
```

**Why compelling on Aleo specifically:** LBPs on Ethereum are plagued by sandwich bots that front-run buy transactions, pushing price up then immediately selling. On Aleo, transaction inputs are encrypted — no MEV, no sandwich attacks. The LBP mechanism is cleaner here than anywhere it currently exists. This is a concrete and marketable claim: "Balancer LBP, but bots can't see your transaction."

**Overflow note:** `price_spread * supply_fraction` where `price_spread ≤ start_price` and `supply_fraction ≤ PRECISION`. With `PRECISION = 1e6` and `start_price ≤ 1e18` (u64 range in microcredits), the product is `≤ 1e24` — well within u128 max (~3.4e38). Safe.

---

### 4f. Quadratic Allocation (`fairdrop_quadratic_v3.aleo`)
**Status:** not yet built. Most technically novel. No other launch platform offers this.

Bidders pay any amount. Allocation is proportional to the square root of payment, not the payment itself. A bidder with 100× your budget receives only 10× your tokens. Sybil attacks are penalized (splitting a payment into N sub-payments produces `N × sqrt(P/N) = sqrt(N×P) × ... ` — actually splitting is advantageous for Sybil! See note below).

**Core formula:**
```
contribution_weight = approx_integer_sqrt(payment_amount)
total_sqrt_weight  += contribution_weight            // in finalize

At claim:
actual_quantity = supply * bid.contribution_weight / state.total_sqrt_weight
cost = bid.payment_amount    // pays full amount, no refund
```

**Sybil note:** in quadratic voting, splitting payments across N accounts produces `N × sqrt(P/N) = sqrt(N) × sqrt(P)` — MORE weight than a single account with `sqrt(P)`. This is known and inherent to the quadratic mechanism. Mitigation: combine with ZK credential gating (one credential per unique human) to prevent Sybil splitting. Quadratic + credential gating is the full anti-whale mechanism.

**Integer sqrt in Leo finalize (Newton-Raphson, 20 unrolled iterations):**
```
// approx_sqrt(n: u128) — unrolled 20 iterations, sufficient for u64-range inputs
let x: u128 = n;
let x: u128 = if n > 0u128 { (x + n / x) / 2u128 } else { 0u128 };
// ... repeat 19 more times
// Final result is within 1 of the true integer sqrt for all u64-range inputs
```
20 iterations is sufficient for exact integer sqrt of all values up to ~2^64. Each iteration is 3 arithmetic ops — 60 ops total, easily within Leo's finalize constraints.

**QuadraticBid record (stores pre-computed weight so claim doesn't recompute):**
```
record QuadraticBid {
    owner: address,
    auction_id: field,
    payment_amount: u128,
    contribution_weight: u128,   // approx_sqrt(payment_amount), computed at bid time
}
```

**New mapping:**
```
sqrt_weights: field => u128   // auction_id → total accumulated sqrt weight
```

**AuctionConfig fields:**
```
supply, min_payment, max_payment, raise_target, start_block, end_block,
sale_scale, payment_token_id, sale_token_id, gate_mode, vest_enabled
```

**Payment model:** bidder pays `payment_amount` entirely. No clearing price, no refund (unless voided). Creator revenue = `total_payments`. Allocation is determined by `contribution_weight / total_sqrt_weight`.

**Why compelling:** quadratic allocation is a well-studied fairness mechanism (Vitalik, Gitcoin, RadicalxChange) but has never been applied to token launches. On Aleo, the ZK privacy means bidders cannot see each other's weights during the auction — removing the psychological games that would exist on a transparent chain. Combined with credential gating, it's a credibly neutral token distribution mechanism.

---

## 5. Companion Contracts

### 5a. `fairdrop_gate_v2.aleo` — Access Control
Handles all auction gating. Imported by all auction contracts.

```
mapping allowed_callers: address => bool      // authorized auction programs (set by protocol_admin)
mapping allowlists: field => field            // auction_id → merkle_root
mapping credential_issuers: field => address  // auction_id → issuer pubkey
mapping verified: field => bool               // BHP256(bidder, auction_id) → admitted

transition set_allowed_caller(program: address, allowed: bool)
  // protocol_admin only. Registers trusted auction programs.

transition register_gate(auction_id, gate_mode: u8, root, issuer)
  // Called via CPI from auction contract during create_auction
  // gate_mode: 0 = open, 1 = Merkle allowlist, 2 = ZK credential
  // finalize: assert(allowed_callers.get_or_use(self.caller, false))
  // auction_id already globally unique via PROGRAM_SALT (G23 fix) — no key namespacing needed

transition verify_merkle(auction_id, proof: [field; 20])
  // For Merkle-gated auctions (gate_mode == 1)
  // Verifies inclusion in allowlists[auction_id], marks verified[BHP256(bidder, auction_id)] = true

transition verify_credential(auction_id, sig: signature, expiry: u32)
  // For credential-gated auctions (gate_mode == 2)
  // Verifies CredentialMessage hash against credential_issuers[auction_id]
  // Checks block.height < expiry, marks verified[BHP256(bidder, auction_id)] = true
  // Credential verification (signature::verify) happens in the transition body (private)
  // Finalize only updates the verified mapping — no signature in finalize inputs
```

**Why split (S2 fix):** `verify_and_admit(proof, sig, expiry)` forces Merkle auctions to pass dummy sig/expiry and credential auctions to pass a dummy 20-field proof array. Leo has no optional parameters. Depth-20 dummy fields waste proving time. Two separate transitions are cleaner — the auction contract calls whichever one applies based on `config.gate_mode`, or neither if `gate_mode == 0`.

**No-op gate for ungated auctions (M1 fix):** Leo does not support conditional CPI calls — you cannot `if mode == 0 { skip() }` inside finalize. Solution: `gate_mode = 0` is stored in config. The auction's own finalize asserts `verified[BHP256(self.signer, auction_id)] == true` only when `config.gate_mode != 0`. Ungated auctions never touch the `verified` mapping. The gate import is always present but the admission check is conditional on mode.

**Caller authentication (S6/D12 fix):** `register_gate` and all state-mutating transitions in gate/proof/ref assert `allowed_callers.get_or_use(self.caller, false)` in finalize. `self.caller` in finalize is the address of the calling program (not the signer). Protocol admin populates `allowed_callers` at deployment time via `set_allowed_caller`. Adding a new auction program version requires only a `set_allowed_caller` transaction from protocol_admin — no contract redeployment.

**Cross-program auction_id uniqueness (G23 fix):** Each auction program defines a hardcoded `PROGRAM_SALT: field` constant (e.g., `1field` = Dutch, `2field` = Sealed, `3field` = Raise). `auction_id = BHP256::hash({ PROGRAM_SALT, creator, nonce })`. Same creator + same nonce in different programs produces different `auction_id` values. Utility contract mapping keys use bare `auction_id` — no `self.caller` namespacing needed in keys. `self.caller` is used only for `allowed_callers` authentication, not as a key prefix.

**Merkle allowlist:** proof is `[field; 20]` public parameter. Depth 20 = ~1M addresses. Each field element adds proving overhead — acknowledge this tradeoff to users. Merkle verification is manually unrolled (20 `BHP256::hash` calls) since Leo has no loops.

**ZK credential gating:** Leo supports `signature::verify(pubkey, message, sig)` natively. Credential message struct is formally defined:
```
struct CredentialMessage {
    holder: address,      // self.signer at verify time
    auction_id: field,
    expiry: u32,
}
// Hash: BHP256::hash_to_field(CredentialMessage { holder, auction_id, expiry })
```
The off-chain Fairdrop signing service MUST hash fields in this exact order using BHP256. Fairdrop bootstraps as first issuer. Any address can be an issuer — `credential_issuers` is per-auction and set by creator at `register_gate`.

**Credential reuse prevention:** covered by the namespaced `verified` mapping. Once a bidder is admitted to a specific program's auction, they cannot be re-admitted via a fresh credential.

---

### 5b. `fairdrop_proof_v2.aleo` — Participation & Reputation
Issues participation receipts and tracks creator reputation. Imported by all auction contracts.

```
mapping allowed_callers: address => bool      // authorized auction programs (same pattern as gate)
mapping reputation: address => CreatorStats   // { auctions_run, filled, volume }
mapping participated: field => bool           // BHP256(bidder, auction_id) → true

record ParticipationReceipt {
    owner: address,
    auction_id: field,
    commitment_hash: field,  // BHP256(CommitKey { auction_id, quantity, nonce, bidder })
}

transition issue_receipt(auction_id, commitment_hash) → ParticipationReceipt
  // CPI from auction contract at commit_bid / place_bid
  // finalize: assert(allowed_callers.get_or_use(self.caller, false))
  // Sets participated[BHP256(self.signer, auction_id)] = true
  // self.signer = bidder address; auction_id already globally unique via PROGRAM_SALT

transition update_reputation(creator, filled: bool, volume: u128)
  // CPI from auction contract at close_auction
  // finalize: assert(allowed_callers.get_or_use(self.caller, false))
  // Updates reputation[creator] stats
```

**M2 fix — no double-hash:** `commitment_hash` already hides quantity, nonce, bidder. No extra hash with undefined salt.

**Caller authentication:** same `allowed_callers` pattern as `fairdrop_gate_v2.aleo`. Only registered auction programs can call state-mutating transitions.

**Unique auction_ids (G23 fix):** `participated` uses bare `BHP256(self.signer, auction_id)`. Dutch and Sealed auction IDs are already globally distinct via `PROGRAM_SALT` — no key namespacing needed.

**`participated` semantics (M6):** `participated = true` means "submitted a bid or commitment" — it is NOT reset by `cancel_commitment`. Gating contracts that read `participated` must document that it includes cancelled commitments. If a future gating use case requires "completed participation" (claim was settled), a separate `settled` mapping should be added.

---

### 5c. `fairdrop_ref_v2.aleo` — Referral Commissions
Handles referral code creation, tracking, and commission distribution. Imported by auction contracts.

```
mapping allowed_callers: address => bool           // authorized auction programs
mapping registrations: field => ReferralConfig     // code_id → { auction_id, bps }
mapping referral_reserve: field => u128            // BHP256(caller, auction_id) → available credits
mapping earned: field => u128                      // code_id → accrued credits
mapping referral_recorded: field => bool           // BHP256(bidder_key, auction_id) → credited

record ReferralCode {
    owner: address,      // referrer — proves ownership to claim commission
    code_id: field,
    auction_id: field,
    commission_bps: u16,
}

transition create_code(auction_id, commission_bps) → ReferralCode
  // Creator or referrer creates a code for a specific auction
  // commission_bps bounded by protocol max (enforced in finalize)

transition fund_reserve(auction_id, amount)
  // CPI from close_auction — deposits platform_fee share into referral_reserve
  // finalize: assert(allowed_callers.get_or_use(self.caller, false))
  // referral_reserve[BHP256(self.caller, auction_id)] += amount

transition record_referral(code_id, auction_id, bidder_key)
  // CPI from commit_bid / place_bid — pseudonymous bidder_key
  // finalize: assert(allowed_callers.get_or_use(self.caller, false))
  // assert(!referral_recorded.get_or_use(BHP256(bidder_key, auction_id), false))
  // Sets referral_recorded[...] = true  ← prevents double-crediting (G19 fix)

transition credit_commission(code_id, payment_amount)
  // Permissionless — callable by anyone after state.cleared == true
  // earned[code_id] += min(payment_amount * bps / 10000, referral_reserve remaining)
  // draws from referral_reserve, not escrow_payments

transition claim_commission(code: ReferralCode)
  // Referrer consumes ReferralCode record
  // transfer_public_to_private earned[code_id] credits to referrer
```

**Commission funding from platform fee (S7 fix):** referral commissions are funded by the protocol fee, not from creator revenue or escrow. At `close_auction`, the auction contract calls `fund_reserve(auction_id, referral_budget)` via CPI. `referral_budget = protocol_fee_collected * REFERRAL_SHARE_BPS / 10000`. `credit_commission` draws from `referral_reserve`, not from `escrow_payments`. This cleanly separates creator revenue from referral payouts and prevents escrow insolvency. The referral budget is bounded by the platform fee — creators cannot over-commit commissions.

**S1 fix — permissionless `credit_commission`:** callable anytime after `state.cleared == true`. No connection to `close_auction`.

**Privacy property:** referrer address lives only in the private `ReferralCode` record. It never appears in any finalize function. The bidder and referrer are never linked on-chain.

---

### 5d. `fairdrop_vest_v2.aleo` — Token Vesting
Post-claim token lockup with block-based release. Imported by auction contracts (atomic path at claim when creator enables vesting).

**S3 decision — creator-mandatory:** vesting is set by the creator at `create_auction` via `vest_enabled: bool`, `vest_cliff_blocks: u32`, `vest_end_blocks: u32` in AuctionConfig. When enabled, `claim` CPIs into `fairdrop_vest_v2.aleo/create_vest` instead of returning Token to the bidder. All claimers on a vesting-enabled auction receive `VestedAllocation` records, not Token records. The bidder cannot opt out.

**Why creator-mandatory, not bidder-optional:** if `claim` returns Token to the bidder, vesting requires a second transaction. The auction contract cannot force this — the bidder already received their token. Creator-mandatory is the correct model for TGE distributions: the creator's responsibility is to set fair vesting terms. Bidder-optional vesting defeats the purpose (whales skip it, creating dump pressure).

```
record VestedAllocation {
    owner: address,
    sale_token_id: field,
    total_amount: u128,
    released: u128,
    cliff_block: u32,
    end_block: u32,
}

transition create_vest(auction_id, token, ended_at_block: u32) → VestedAllocation
  // Called by claim (CPI) when config.vest_enabled == true
  // Receives the minted Token from token_registry CPI, wraps it in VestedAllocation
  // cliff_block = ended_at_block + config.vest_cliff_blocks  (S8 fix — uniform base)
  // end_block   = ended_at_block + config.vest_end_blocks
  // Requires fairdrop_vest_v2.aleo to hold SUPPLY_MANAGER_ROLE on the sale token

transition release(vest, public amount) → (Token, VestedAllocation)
  // Bidder releases vested tokens block-by-block after cliff
  // assert(block.height >= vest.cliff_block)
  // vested_so_far = total_amount * (block.height - cliff_block) / (end_block - cliff_block)
  // assert(amount <= vested_so_far - vest.released)
  // Returns new VestedAllocation with released += amount
```

**S8 fix — consistent vesting base:** absolute `cliff_block` and `end_block` are computed from `state.ended_at_block` (set at `close_auction`), not from `block.height` at claim time. All bidders on the same auction receive identical vesting schedules regardless of when they claim. `ended_at_block` is passed as a public parameter to `create_vest` and validated against `state.ended_at_block` in finalize.

**Role requirement:** `fairdrop_vest_v2.aleo` needs `SUPPLY_MANAGER_ROLE` on the sale token — a separate `set_role` transaction by the token creator. UX friction: this must happen before any auction using vesting can be created. Frontend should check and prompt.

---

## 6. Core Data Model

### Records

| Record | Program | Fields | Consumed at |
|---|---|---|---|
| `Bid` | dutch, sealed | owner, auction_id, quantity, payment_amount | claim |
| `AscendingBid` | ascending | owner, auction_id, quantity, payment_amount, bid_price | claim |
| `LBPBid` | lbp | owner, auction_id, quantity, payment_amount, bid_price | claim |
| `RaiseBid` | raise | owner, auction_id, payment_amount | claim (no quantity — computed at claim time) |
| `QuadraticBid` | quadratic | owner, auction_id, payment_amount, contribution_weight | claim |
| `Commitment` | sealed | owner, auction_id, commitment, payment_amount | reveal_bid or cancel_commitment |
| `ParticipationReceipt` | proof | owner, auction_id, commitment_hash | never (non-transferable) |
| `ReferralCode` | ref | owner, code_id, auction_id, commission_bps | claim_commission |
| `VestedAllocation` | vest | owner, token_id, total, released, cliff, end | release (partial) |

Note: `AscendingBid` and `LBPBid` carry `bid_price` because they are pay-what-you-bid. Records cannot be shared across programs (a record belongs to its defining program's address space), so each auction type defines its own record even when fields overlap.

### Key Mappings (auction contracts)

| Mapping | Key | Value | Program | Notes |
|---|---|---|---|---|
| `auction_configs` | auction_id | AuctionConfig | all auction | Immutable after create |
| `auction_states` | auction_id | AuctionState | all auction | Updated every phase |
| `escrow_payments` | auction_id | u128 | all auction | Credits held in escrow |
| `escrow_sales` | auction_id | u128 | all auction | Mint budget (from burn at create) |
| `bid_totals` | BHP256(bidder, auction_id) | u128 | dutch/ascending/lbp | Per-bidder total payment (pseudonymous) |
| `creator_nonces` | creator address | u64 | all auction | Per-creator counter for auction_id generation; increments atomically in finalize |
| `pending_commits` | commitment_hash | CommitState | sealed | Maps hash → { payment_amount, revealed } |
| `bid_committed` | BHP256(bidder, auction_id) | bool | sealed | Enforces one-commit-per-bidder (D6) |
| `sqrt_weights` | auction_id | u128 | quadratic | Accumulated sqrt weights for allocation |
| `protocol_treasury` | 0field | u128 | all auction | Accumulated protocol fees |

**`creator_nonces` and auction_id generation:** `auction_id = BHP256::hash({ PROGRAM_SALT, creator, nonce })` where `nonce = creator_nonces[creator]` read inside `finalize_create_auction`. Finalize atomically increments `creator_nonces[creator] += 1` after reading. Two simultaneous `create_auction` transactions from the same creator in the same block will both attempt to read the same current nonce — Aleo's finalize serializes conflicting mapping writes, so one transaction wins and the other reverts with a mapping conflict. The reverted transaction is a failed transaction (credits fee consumed, no state change). Frontend should retry with a fresh transaction if this happens. The nonce after the winning transaction is incremented, so the retry will succeed with a unique nonce.

### AuctionState fields

```
total_committed: u128
total_payments: u128
supply_met: bool
ended_at_block: u32
cleared: bool
clearing_price: u128
creator_revenue: u128
allocation_factor: u128    ← added in Phase 1c
unique_bidder_count: u64   ← added in Phase 1c
voided: bool               ← added in Phase 1c
```

---

## 7. Key Design Decisions & Why

### D1: `sale_scale` passed at creation, stored in config
**Decision:** frontend computes `sale_scale = 10^sale_token_decimals` from token metadata and passes it as a public parameter to `create_auction`. Stored in `AuctionConfig`. Reused in all subsequent finalize functions.

**Why:** eliminates `token_registry.aleo` mapping reads inside finalize functions. Finalize functions cannot easily fail mid-execution — failed registry reads would abort the transaction. Also avoids the `TokenMetadata` struct dependency inside fairdrop.

**Risk:** creator could pass a wrong `sale_scale`. Mitigated: wrong `sale_scale` only harms the creator's own auction (their revenue calculation breaks). No incentive to lie.

---

### D2: Burn at creation, mint at claim
**Decision:** creator deposits a Token record at `create_auction`. Contract immediately calls `burn_private` on the full `supply`. At claim, `mint_private` re-issues tokens to winners. Net supply change = 0.

**Why:** guarantees `mint_private` at claim will always succeed (no risk of hitting max_supply cap). Escrow model uses `escrow_sales` as a mint budget rather than holding tokens.

**Consequence:** `fairdrop.aleo` must hold `SUPPLY_MANAGER_ROLE` on the sale token. Frontend must check and guide creator through `set_role` before `create_auction`.

---

### D3: Uniform clearing price, not pay-what-you-bid
**Decision:** all winners pay the same clearing price regardless of when they bid.

**Why:** in pay-what-you-bid, early bidders (who bid at the high starting price) are penalized. Uniform price is the standard mechanism for fair distributions (used in US Treasury auctions, Google's IPO). Eliminates the incentive to wait until the last moment.

---

### D4: Pro-rata allocation with allocation_factor
**Decision:** when `total_committed > supply`, allocate proportionally using:
```
allocation_factor = supply * ALLOCATION_PRECISION / total_committed
actual_quantity   = bid.quantity * allocation_factor / ALLOCATION_PRECISION
```
`ALLOCATION_PRECISION = 1_000_000_000_000u128` (1e12).

**Why:** first-come-first-served rewards speed and bots. Pro-rata rewards participation. Natural fit for sealed-bid where total demand is only known after reveals complete.

**Integer division dust:** `sum(actual_quantity)` may be slightly less than `supply` due to per-claim truncation. Dust accumulates in `escrow_sales` and is claimable by creator via `withdraw_unsold`. Document this explicitly to users.

---

### D5: Post-reveal capping for `max_bid_amount`
**Decision:** `max_bid_amount` cannot be enforced at commit time (quantity unknown). Enforced at reveal:
```
effective_quantity = min(revealed_quantity, config.max_bid_amount)
```
Excess payment above `effective_quantity * clearing_price / sale_scale` is refunded at claim.

**Why:** bidders gain nothing by over-committing — they are capped and refunded. The invariant is preserved without requiring quantity knowledge at commit time.

---

### D6: One commit per bidder per auction
**Decision:** `finalize_commit_bid` enforces:
```
assert(!bid_committed.get_or_use(BHP256(bidder, auction_id), false))
bid_committed.set(BHP256(bidder, auction_id), true)
```
**Why:** without this, a bidder can spam commits with different nonces, lock up capital, and reveal only the favorable one. Also prevents credential reuse (same bidder cannot re-enter via a fresh credential).

**New mapping needed:**
```
bid_committed: field => bool    // BHP256(bidder, auction_id) → has committed
```

---

### D7: `claim_voided` is a separate transition
**Decision:** when `state.voided == true`, bidders call `claim_voided` instead of `claim`. `claim_voided` only calls `transfer_public_to_private` for a full refund — no `mint_private`.

**Why:** Leo requires fixed return signatures. `claim` always calls `mint_private` as part of its return. `mint_private(0)` is either invalid or produces a zero-amount record (harmful UX). A separate transition is the clean solution.

---

### D8: Two-step escrow for secondary market
**Decision:** `list_bid → purchase_bid`, not a single atomic swap.

**Why:** Aleo transactions have exactly one signer. Two different owners' records cannot be consumed in the same transaction. Single-transaction atomic swap is architecturally impossible.

**Safety:** `list_bid` copies `auction_id` and `quantity` from the consumed `Bid` record into a public mapping — the seller cannot misrepresent these fields. The buyer sees contract-verified values before paying.

**Privacy tradeoff:** listing a Bid reveals `quantity` publicly. A bidder who used sealed-bid to hide their quantity permanently reveals it if they list on the secondary market. This is unavoidable and must be documented clearly to users.

---

### D11: Caller-supplied params validated in finalize — this is the canonical Leo pattern
**Decision:** transitions pass caller-supplied public values (e.g., `clearing_price`, `payment_amount`) into CPI calls (e.g., `mint_private`, `transfer_public_to_private`). Finalize validates those values against on-chain state. If finalize rejects, the entire transaction reverts including any CPI outputs.

**Why:** finalize is the only place on-chain state can be read. Leo has no "read-then-compute" within finalize output pipelines. The pattern — compute in transition (private), validate in finalize (public) — is unavoidable and standard.

**Consequence for implementers:** every UI call that touches `claim`, `slash_unrevealed`, or `credit_commission` must derive params from on-chain state, not from local computation. Frontend must read `state.clearing_price` before calling `claim`. Wrong params → failed transaction, no loss of funds.

---

### D12: Utility contract caller authentication via `self.caller` + `allowed_callers`
**Decision:** state-mutating transitions in utility contracts (`register_gate`, `fund_reserve`, `issue_receipt`, `update_reputation`, `record_referral`) assert `allowed_callers.get_or_use(self.caller, false)` in finalize. `self.caller` in a utility contract's finalize is the address of the calling program (auction contract). Protocol admin populates `allowed_callers` via `set_allowed_caller(program, true)`.

**Why:** `self.caller` reliably identifies the calling program in a CPI context. `self.signer` is the original transaction signer (user's wallet) — useful for user-level auth but not for restricting which programs can mutate utility state. `self.caller` is NOT passed as a parameter (which would allow spoofing) — it is read directly from the execution context.

**Adding new auction programs:** requires one `set_allowed_caller` transaction from protocol_admin per new program address. No contract redeployment needed.

**Privilege separation:** `self.signer == protocol_admin` guard on `set_allowed_caller` itself (protocol_admin is a hardcoded constant or stored in a `protocol_admin: address` mapping).

---

### D13: Referral commissions funded from protocol fee, not creator revenue
**Decision:** at `close_auction`, the auction contract carves a `referral_budget` from the collected platform fee and calls `fairdrop_ref_v2.aleo/fund_reserve(auction_id, referral_budget)` via CPI. `credit_commission` draws from `referral_reserve[auction_id]`, bounded by `referral_budget`. Creator revenue and bidder refund escrow are never touched by referral payouts.

**Why:** creator revenue and bidder refunds must be solvent by construction. Mixing referral payouts into `escrow_payments` creates accounting complexity and potential insolvency. The platform fee is collected upfront at close — it is the natural source for protocol-funded incentives (referrals, slasher rewards, closer reward). This also naturally caps total referral payouts to `min(platform_fee, configured_budget)`.

**`commission_bps` cap:** enforced in `create_code` finalize: `commission_bps <= MAX_REFERRAL_BPS` (protocol constant, e.g., 2000 = 20% of platform fee). Prevents self-referral drain.

---

### D10: Sealed auction clearing price = Dutch price at commit_end_block
**Decision:** `fairdrop_sealed_v3.aleo` uses Dutch pricing during the commit window. The clearing price is the Dutch price at `commit_end_block`, computed deterministically from config fields — no extra storage.

**Why:** three alternatives were considered:
- *Fixed price:* no price discovery, same as `fairdrop_raise_v3.aleo` — redundant.
- *Vickrey (pay second-highest):* requires sorting all bids, impossible inside a single finalize function.
- *Dutch price at commit_end_block:* uniform clearing price set before reveals begin. Manipulating reveal order has zero effect on the final price. Bidders lock sufficient collateral at commit time and receive the overpayment as a refund at claim. The Dutch descent during the commit window creates a time-value incentive to commit without forcing a specific price point.

**Consequence:** `CommitState` stays `{ payment_amount, revealed }` — no `committed_price` field. Simpler struct, simpler finalize.

---

### D9: Modular companion contracts over monolith
**Decision:** split into `fairdrop_dutch`, `fairdrop_sealed`, `fairdrop_raise` (auction types) + `fairdrop_gate`, `fairdrop_proof`, `fairdrop_ref`, `fairdrop_vest` (utility contracts).

**Why:** each contract is small enough to be fully reviewed. Utility contracts are independently auditable. New features don't require touching money-handling code. A platform of focused contracts is more credible than a growing monolith.

---

### D14: Protocol fee = 250 bps (2.5%) of total_payments
**Decision:** at `close_auction`, `protocol_fee = total_payments * 250 / 10000`. Fee is deducted from `escrow_payments` before computing `creator_revenue = total_payments - protocol_fee`. Fee is split: up to `REFERRAL_SHARE_BPS / 10000` of the fee funds `referral_reserve` via `fund_reserve` CPI; remainder goes to `protocol_treasury`.

**Fee flow at close_auction:**
```
protocol_fee     = total_payments * 250 / 10000
referral_budget  = protocol_fee * REFERRAL_SHARE_BPS / 10000   // e.g., 2000 bps = 20% of fee
creator_revenue  = total_payments - protocol_fee
// CPI: fund_reserve(auction_id, referral_budget)   ← only if referral was registered
// protocol_treasury += protocol_fee - referral_budget
```

**Why 2.5%:** competitive with standard NFT/token platform rates (OpenSea: 2.5%, Manifold: 5%). Low enough that creators choose Fairdrop over self-deployment. High enough to sustain infrastructure.

**Configurability:** the fee BPS is a protocol constant initially. Future governance can expose it as a mutable mapping (`fee_bps: 0field => u16`) updated by protocol_admin.

**Creator revenue guarantee:** `escrow_payments[auction_id]` always starts >= `total_payments`. After the protocol_fee deduction, `creator_revenue + protocol_fee == total_payments`. Bidder escrow is never touched by fee extraction — bidder refunds come from the total escrow, protocol fee is a separate accounting bucket.

---

### D15: Closer reward + creator anti-spam deposit
**Decision:**

**Closer reward:** `close_auction` is permissionless — anyone can call it once the auction closes. Caller receives a flat 10_000u128 microcredits (0.01 credits) paid from `protocol_treasury` to `self.signer` (the transaction sender). This incentivizes timely settlement without requiring Fairdrop to run a close bot.

**Creator anti-spam deposit:** `finalize_create_auction` asserts and deducts a flat `CREATION_FEE = 10_000u128` microcredits from the creator's public balance (or requires them to pass it explicitly via a `transfer_public` CPI before calling `create_auction`). Fee goes to `protocol_treasury`. On testnet this is waived or minimal. On mainnet, 0.01 credits per auction creation makes spam economically irrational.

**Why separate from protocol fee:** the protocol fee applies per-auction at close (proportional to volume). The creation deposit is a fixed gate against zero-volume spam auctions. They serve different purposes.

---

## 8. Known Gaps & Their Solutions

| # | Gap | Contract | Solution | Status |
|---|---|---|---|---|
| G1 | `max_bid_amount` unenforceable at commit time | sealed | Post-reveal capping: `min(quantity, max_bid_amount)` | Designed |
| G2 | Timing fields `commit_end_block`, `reveal_end_block` not defined | sealed | Add to `AuctionConfig`; all finalize functions check against them | Designed |
| G3 | Multi-commit griefing — unlimited commits per bidder | sealed | `bid_committed` mapping: one commit per bidder per auction (D6) | Designed |
| G4 | `claim` cannot conditionally skip `mint_private` for voided auctions | dutch/sealed | Separate `claim_voided` transition — refund only, no mint CPI (D7) | Designed |
| G5 | Pro-rata integer division creates dust in `escrow_sales` | dutch/sealed | Dust is claimable by creator via existing `withdraw_unsold` | Designed |
| G6 | Credential reuse — same credential usable multiple times | gate | Covered by G3 fix (`bid_committed` mapping prevents re-entry) | Designed |
| G7 | `batch_claim` variable batch size impossible with Leo fixed arrays | dutch/sealed | Multiple fixed-size variants (`batch_claim_2`, `_4`, `_8`) or defer | Open |
| G8 | Secondary market reveals quantity publicly | dutch/sealed | Unavoidable tradeoff — document clearly, secondary market is opt-in | Accepted |
| G9 | No credential issuer ecosystem on Aleo | gate | Fairdrop bootstraps own signing service; multi-issuer by design | Designed |
| G10 | Single-transaction atomic swap impossible | dutch/sealed | Two-step escrow: `list_bid` → `purchase_bid` → `cancel_listing` (D8) | Designed |
| G11 | `fairdrop_vest_v2.aleo` needs separate SUPPLY_MANAGER_ROLE grant | vest | Frontend checks and guides creator through `set_role` before create | Open |
| G12 | `fairdrop_sealed_v3.aleo` had no price mechanism defined | sealed | Dutch price at `commit_end_block` as uniform clearing price; computable from config; no `committed_price` field needed | Designed |
| G13 | `credit_commission` cannot be called at `close_auction` — no iteration in finalize | ref | Make permissionless: callable by anyone after `state.cleared == true` | Designed |
| G14 | `verify_and_admit` mixes Merkle + credential — dummy inputs waste proving | gate | Split into `verify_merkle` and `verify_credential` separate transitions | Designed |
| G15 | Conditional CPI for optional gating not possible in Leo | gate | `gate_mode: u8` in config; auction finalize checks mode before enforcing `verified` | Designed |
| G16 | Vesting was two user steps but design implied one — intent unclear | vest | Creator-mandatory: `vest_enabled` in AuctionConfig; `claim` CPIs into `create_vest` | Designed |
| G17 | `fairdrop_raise_v3.aleo` needs `RaiseBid` record (no quantity), not shared `Bid` | raise | Separate `RaiseBid { owner, auction_id, payment_amount }` record; `Bid` is dutch/sealed only | Designed |
| G18 | Slasher requires off-chain indexer — not mentioned | sealed | Fairdrop-operated slasher bot watches `commit_bid` events and calls `slash_unrevealed` | Designed |
| G19 | `blinded_commitment = BHP256(hash, salt)` has undefined salt | proof | Use `commitment_hash` directly in `ParticipationReceipt` — already hides all fields | Designed |
| G20 | `fairdrop_raise_v3.aleo` missing private bid path | raise | Add `bid_private` (consume credits UTXO) alongside `bid_public` — same pattern as Dutch | Designed |
| G21 | `claim` uses caller-supplied params before finalize validates — fragile pattern | all auction | Standard Leo pattern (D11). Finalize rejects if mismatch → tx reverts. Frontend must read from on-chain state. | Designed |
| G22 | No minimum collateral enforced at sealed commit time — underflow at claim | sealed | In private transition body: assert `payment_amount >= quantity * clearing_price(commit_end_block) / sale_scale` | Designed |
| G23 | `auction_id` collides across programs — utility mappings share namespace | all | Per-program `PROGRAM_SALT` constant in `auction_id` generation: `BHP256({ PROGRAM_SALT, creator, nonce })` | Designed |
| G24 | Utility contract transitions have no caller auth — anyone can forge entries | gate/proof/ref | `allowed_callers: address => bool` + `self.caller` check in finalize (D12) | Designed |
| G25 | `credit_commission` funding source undefined — escrow insolvency risk | ref | Commissions funded from protocol fee via `referral_reserve[auction_id]` (D13) | Designed |
| G26 | Vesting cliff/end use `block.height` at claim — different schedules per claimer | vest | Base = `state.ended_at_block`. `cliff_block = ended_at_block + config.vest_cliff_blocks` (S8 fix) | Designed |
| G27 | `cancel_commitment` leaves `bid_committed = true` — permanent auction lockout | sealed | `finalize_cancel_commitment` resets `bid_committed[key] = false` | Designed |
| G28 | `fairdrop_raise_v3.aleo` void-if-below-target behavior undefined | raise | Void on `total_payments < raise_target`. `claim_voided` refunds. `withdraw_unsold` returns full supply. | Designed |
| G29 | `CredentialMessage` struct field order not defined — off-chain/on-chain mismatch | gate | Formal struct defined in Section 5a with explicit field order. Off-chain service must match exactly. | Designed |
| G30 | `record_referral` double-crediting — same bidder credited twice for same auction | ref | `referral_recorded: field => bool` keyed by `BHP256(bidder_key, auction_id)` prevents re-entry | Designed |
| G31 | `participated` not reset on `cancel_commitment` — cancelled bids appear as participation | proof | By design: `participated` = "committed intent." Gating contracts must document this semantics. | Accepted |
| G32 | Pro-rata `finalize_claim` must deduct `actual_quantity` from `escrow_sales`, not `bid.quantity` | sealed | Implementation note for Phase 1c: update escrow deduction line when adding allocation_factor | Open |
| G33 | Integer truncation: `sum(cost_i) ≤ creator_revenue` can leave escrow short by bounded dust | dutch/sealed | Accepted. Maximum gap = `N_bidders × (price/scale − 1)` microcredits. Negligible in practice. Document. | Accepted |
| G34 | Protocol fee rate never specified — referenced everywhere, value undefined | all auction | 250 bps (2.5%) of total_payments. See D14. | Designed |
| G35 | `cancel_auction` transition mentioned in Phase 1b but never specified | all auction | Defined in Section 4a. Creator-only. Callable before start_block or when total_committed == 0. Sets voided = true. | Designed |
| G36 | `creator_nonce` counter mapping undefined — auction_id generation breaks without it | all auction | `creator_nonces: address => u64` mapping. Atomically read + incremented in finalize. Race condition: concurrent creates from same creator — one reverts, retry succeeds. | Designed |
| G37 | `bid_committed` mapping missing from Section 6 data model | sealed | Added to Key Mappings table | Designed |
| G38 | Ascending/LBP bid records missing from Section 6 — treated as shared `Bid` | ascending, lbp | Separate `AscendingBid` and `LBPBid` records with `bid_price` field. Added to records table. | Designed |
| G39 | `close_auction` preconditions for sealed auction never defined | sealed | Must assert `block.height > config.reveal_end_block`. `ended_at_block` set to `reveal_end_block`. | Designed |
| G40 | Closer reward amount and mechanism never defined | all auction | Fixed 10_000u128 microcredits (0.01 credits) paid from `protocol_treasury` to `self.signer` of `close_auction`. See D15. | Designed |
| G41 | `create_auction` input validation guards not specified — division-by-zero possible | all auction | Assertions defined in Section 4a covering zero-denominators, block ordering, price sanity. | Designed |
| G42 | Multi-asset payment token flow undefined — credits.aleo CPI hardcoded vs payment_token_id | all auction | Credits-only for Phase 1–2. `payment_token_id` reserved for future Phase 3 multi-asset support. See Open Questions. | Open |
| G43 | Privacy threat model never documented per auction type | all | Added as Section 12 | Designed |
| G44 | Creator anti-spam — anyone can create infinite auctions | all auction | Minimum `create_auction` deposit = 10_000u128 microcredits paid to protocol_treasury (separate from sale token deposit). See D15. | Designed |

---

## 9. What Is Live

`fairdrop_v4.aleo` on Aleo Testnet Beta. Renamed to `fairdrop_dutch_v3.aleo` in the new architecture.

**Working transitions:**
- `create_auction` — burn deposit, store config, initialize escrow
- `place_bid_private` — consume credits UTXO, issue Bid record
- `place_bid_public` — deduct from public credits balance, issue Bid record
- `close_auction` — compute clearing price (permissionless)
- `claim` — mint sale tokens + refund (private settlement)
- `withdraw_payments` — creator revenue withdrawal
- `withdraw_unsold` — creator unsold token recovery

**Frontend (React + Vite + Tailwind v4):**
- Dashboard, auction browse, auction detail + price chart
- Bid form (private + public paths)
- Create auction wizard
- Token launch wizard (register → mint → authorize)
- Token manager (burn + role management)
- Creator dashboard (revenue + unsold management)
- Claim page
- Shield page (public → private credits conversion)
- Leo Wallet integration via `@provablehq/aleo-wallet-adaptor`

---

## 10. Implementation Order

```
CRITICAL DEPLOYMENT RULE (C2): Auction contracts import utility contracts at deploy time.
Imports cannot be added after deployment. Build ALL utility contracts first.
Deploy auction contracts ONCE, correctly, with all imports in place.

PHASE 1a  fairdrop_gate_v2.aleo + fairdrop_proof_v2.aleo
          ─ gate: verify_merkle, verify_credential, register_gate (gate_mode 0/1/2)
          ─ proof: issue_receipt (commitment_hash, not blinded), update_reputation
          ─ deploy both before writing any auction contract code

PHASE 1b  fairdrop_dutch_v3.aleo — NEW deployment (not an update to live v4)
          ─ imports fairdrop_gate_v2.aleo + fairdrop_proof_v2.aleo from day one
          ─ protocol fee + closer reward in close_auction
          ─ cancel_auction + claim_voided transitions (G4)
          ─ optional gating via gate_mode config field (M1)
          ─ NOTE: existing fairdrop_v4.aleo auctions run to completion independently

PHASE 1c  fairdrop_sealed_v3.aleo
          ─ commit_bid, reveal_bid, slash_unrevealed, close, claim, claim_voided
          ─ imports fairdrop_gate_v2.aleo + fairdrop_proof_v2.aleo
          ─ AuctionConfig: commit_end_block, reveal_end_block, start_price, floor_price, decay fields
          ─ clearing_price = Dutch price at commit_end_block (D10)
          ─ new mappings: pending_commits, bid_committed
          ─ deploy slasher bot as protocol infrastructure (S5)

PHASE 1d  fairdrop_raise_v3.aleo + fairdrop_ascending_v3.aleo
          ─ raise: bid_private + bid_public, RaiseBid record, pro-rata allocation
          ─ ascending: same structure as Dutch but price formula inverted
            pay-what-you-bid, Bid record carries bid_price, no refund at claim
          ─ both import fairdrop_gate_v2.aleo + fairdrop_proof_v2.aleo

PHASE 1e  fairdrop_ref_v2.aleo + fairdrop_vest_v2.aleo
          ─ ref: create_code, record_referral, credit_commission (permissionless), claim_commission
            fund_reserve funded from platform fee at close_auction (D13)
          ─ vest: create_vest (CPI from claim when vest_enabled), release
            cliff_block = state.ended_at_block + config.vest_cliff_blocks (S8 fix)
          ─ redeploy all Phase 1 auction contracts importing ref + vest
          ─ OR deploy _v2 variants if not yet deployed without ref/vest

PHASE 2a  fairdrop_lbp_v3.aleo
          ─ supply × time price formula, pay-what-you-bid, no uniform clearing
          ─ imports all utility contracts
          ─ validate fixed-point arithmetic (PRECISION = 1e6) against overflow cases
          ─ position: "Balancer LBP without MEV — bots can't see your transaction"

PHASE 2b  fairdrop_quadratic_v3.aleo
          ─ approx_integer_sqrt unrolled 20 iterations for finalize
          ─ QuadraticBid record carries pre-computed contribution_weight
          ─ sqrt_weights mapping, pro-rata by weight at claim
          ─ gate_mode = 2 (ZK credential) strongly recommended — anti-Sybil
          ─ imports all utility contracts

PHASE 2c  Secondary market (list_bid → purchase_bid → cancel_listing)
          Tiered auction design review (fairdrop_tiered.aleo — Phase 3 candidate)
          TypeScript SDK (@fairdrop/sdk)
          Aggregate analytics
          Security audit + bug bounty
          Mainnet deployment

─────────────────────────────────────────
BACKEND — parallel workstream (see Section 11)
─────────────────────────────────────────

PARALLEL 1a  Indexer v1 — watch dutch + sealed + raise finalize events
             Database schema deployed (auctions, bids, commitments tables)
             /auctions, /auctions/:id, /auctions/:id/bids endpoints live
             ← can start as soon as Phase 1b contracts are deployed on testnet

PARALLEL 1b  Metadata Service
             POST /metadata → IPFS pin + hash storage
             GET /metadata/:hash endpoint
             Frontend integrated: creator uploads metadata before create_auction
             ← needed before any auction UI is usable with names/logos

PARALLEL 1c  Slasher Bot
             Watches commitments table, submits slash_unrevealed after reveal_end_block
             Slasher wallet funded, alert thresholds configured
             ← needed before fairdrop_sealed_v3.aleo goes live

PARALLEL 1d  Reveal Notification Service
             Reveal window countdown subscriptions
             Email/push notifications at commit_end_block - 50 and reveal_end_block - 200
             ← needed before sealed auction is available to real users

PARALLEL 2a  Credential Signing Service
             KMS key generation, signing endpoint, per-auction eligibility config
             ← needed before any gated auction goes live

PARALLEL 2b  Indexer v2 — extend to watch ascending, lbp, quadratic, ref, proof
             price-chart endpoint, creator stats, referral activity
             Public API documentation for third-party frontends
```

---

## Open Questions

- **`batch_claim` implementation (G7):** multiple fixed-size variants (`batch_claim_2`, `_4`, `_8`) or defer to Phase 2? Fixed-size variants are the only Leo-compatible approach.
- **`fairdrop_vest_v2.aleo` role UX (G11):** how to make the `set_role` prerequisite invisible to creators? (Frontend prompt + bundled transaction flow?)
- **Reveal window duration:** what block count is acceptable for user experience? (30 min ≈ 450 blocks at ~4 s/block.)
- **Slash split ratio:** 80/20 protocol/caller is a placeholder — what ratio maximally incentivizes third-party slashers?
- **Commission bps range in `fairdrop_ref_v2.aleo`:** should there be a protocol-enforced max to prevent creators from self-referral gaming?
- **`fairdrop_raise_v3.aleo` supply-not-met handling:** full refund, or clear at floor_price if any payment came in?
- **Phase 1e deployment strategy:** redeploy `fairdrop_dutch_v2` etc. importing `ref` + `vest`, or ship Dutch/Sealed/Raise without ref/vest first and add them in a version bump? (Version bump is simpler operationally but splits the user base.)
- **G32 — pro-rata `escrow_sales` deduction:** when adding `allocation_factor` in Phase 1c, the `finalize_claim` deduction must change from `bid.quantity` to `actual_quantity`. Must be explicitly verified during implementation.
- **`PROGRAM_SALT` values:** canonical values assigned in Section 2 (1–6field). Once deployed, changing salt breaks all existing auction IDs. Treat as immutable constants.
- **Protocol admin address:** who holds protocol_admin privilege? Multisig? A governance contract? Must be decided before deploying utility contracts.
- **LBP PRECISION value:** `1e6` chosen to avoid overflow. Needs empirical testing against realistic `start_price` / `supply` ranges to confirm no edge-case overflow.
- **Quadratic sqrt precision:** 20 Newton-Raphson iterations sufficient for u64-range inputs. If `payment_amount` can exceed `u64::MAX` (unlikely but possible with high-value tokens), needs additional iterations or clamping.
- **Quadratic Sybil mitigation:** is ZK credential gating sufficient, or should the protocol enforce a minimum `payment_amount` that makes splitting economically irrational? (e.g., `min_payment >= 1000 credits` means splitting into 1000 accounts costs 1M credits to gain `sqrt(1000)` advantage).
- **Ascending Dutch: partial fill at ceiling_price?** If auction closes at `end_block` with `total_committed < supply`, creator receives less than ceiling revenue. Is a minimum-fill threshold (like raise's `raise_target`) appropriate?
- **Multi-asset payment token (G42):** `payment_token_id` in AuctionConfig is reserved but all Phase 1–2 contracts use `credits.aleo` CPI exclusively. Supporting arbitrary `token_registry` payment tokens requires a completely different transfer CPI path and breaks the current escrow model. This is a Phase 3 design problem — explicitly out of scope for mainnet launch.
- **Protocol fee BPS governance:** currently a hardcoded constant (250 bps per D14). Future governance can make it mutable via `fee_bps: 0field => u16` mapping updated by protocol_admin or a DAO vote. Needs governance design before any fee changes post-mainnet.
- **Closer reward value:** currently 10_000 microcredits (0.01 credits) per D15. Should be empirically set based on average Aleo transaction fee to ensure the reward consistently exceeds gas cost. Revisit when mainnet gas costs are known.
- **Creation fee (anti-spam):** 10_000 microcredits per D15. On testnet, may be waived. The fee needs to be high enough that spam is irrational but low enough that legitimate creators aren't deterred. Revisit before mainnet.

---

## 11. Backend Architecture

### Why a backend is non-negotiable

Aleo mappings have no iterator. There is no on-chain API call that returns "all keys in `auction_configs`." The frontend has no way to enumerate auctions without an external index. This means the product literally cannot show an auction list without a backend. Every other backend component builds on top of this requirement.

Aleo's public REST API provides: mapping reads by key (if you know the key), transaction history per program, block and transaction details. It does not provide: mapping iteration, aggregated auction stats, price history, event subscriptions, or bid activity feeds.

---

### Component Overview

```
┌─────────────────────────────────────────────────────┐
│                  Fairdrop Backend                   │
│                                                     │
│  ┌─────────────┐   ┌───────────┐   ┌─────────────┐ │
│  │   Indexer   │──▶│    API    │──▶│  Frontend   │ │
│  │  (watcher)  │   │  (REST)   │   │  (React)    │ │
│  └──────┬──────┘   └───────────┘   └─────────────┘ │
│         │                                           │
│  ┌──────▼──────┐   ┌───────────┐   ┌─────────────┐ │
│  │  Database   │   │  Slasher  │   │  Metadata   │ │
│  │ (Postgres)  │◀──│   Bot     │   │  Service    │ │
│  └─────────────┘   └───────────┘   └─────────────┘ │
│                                                     │
│  ┌──────────────────────────────────────────────┐   │
│  │         Credential Signing Service           │   │
│  │         (separate trust boundary)            │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
         ▲ polls blocks
    Aleo Node (REST API)
```

**Trust model:** the Indexer and API are convenience infrastructure — their data can be independently verified against the Aleo chain. The Credential Signing Service is a trust boundary — it holds the private key that authenticates ZK credentials. These two components must be deployed and operated separately with different security requirements.

---

### Component 1 — Indexer

The indexer polls the Aleo node, parses finalize executions for all Fairdrop program IDs, and writes structured records to the database. It is the data source for every other component.

**Programs to watch:**
```
fairdrop_dutch_v3.aleo
fairdrop_sealed_v3.aleo
fairdrop_raise_v3.aleo
fairdrop_ascending_v3.aleo
fairdrop_lbp_v3.aleo
fairdrop_quadratic_v3.aleo
fairdrop_gate_v2.aleo       (for gate registrations)
fairdrop_proof_v2.aleo      (for reputation updates)
fairdrop_ref_v2.aleo        (for referral activity)
```

**Events to capture per transition:**

| Program | Transition | Fields to index |
|---|---|---|
| all auction | `create_auction` | auction_id, creator, program_id, config (all fields), metadata_hash, block_height |
| dutch/ascending/lbp | `place_bid_private` | auction_id, amount, quantity, block_height (bidder unknown — private) |
| dutch/ascending/lbp | `place_bid_public` | auction_id, bidder (self.signer), amount, quantity, block_height |
| all auction | `close_auction` | auction_id, clearing_price (or total_payments), ended_at_block |
| all auction | `claim` | auction_id, claimer, sale_amount, refund_amount, block_height |
| all auction | `claim_voided` | auction_id, claimer, refund_amount, block_height |
| all auction | `withdraw_payments` | auction_id, creator, amount, block_height |
| sealed | `commit_bid` | auction_id, commitment_hash, payment_amount, block_height — **CRITICAL: required by slasher** |
| sealed | `reveal_bid` | commitment_hash, quantity, block_height |
| sealed | `cancel_commitment` | commitment_hash, block_height |
| sealed | `slash_unrevealed` | commitment_hash, slasher, block_height |
| raise/quadratic | `bid_private` | auction_id, payment_amount, block_height |
| raise/quadratic | `bid_public` | auction_id, bidder, payment_amount, block_height |
| quadratic | `bid_private/public` | also: contribution_weight (sqrt of payment) |
| gate | `register_gate` | auction_id, gate_mode, block_height |
| proof | `update_reputation` | creator, filled, volume, block_height |
| ref | `record_referral` | code_id, auction_id, block_height |
| ref | `credit_commission` | code_id, amount, block_height |

**Polling strategy:**
- Poll latest block every 4 seconds (1 block interval)
- On each new block: fetch all transactions for watched program IDs
- Parse `finalize` execution outputs to extract public inputs and mapping writes
- Maintain `last_indexed_block` cursor; on restart, replay from cursor (idempotent writes)
- Alert on indexing lag > 10 blocks

---

### Component 2 — Database Schema

```sql
-- Core auction record (one row per create_auction)
CREATE TABLE auctions (
    auction_id       TEXT PRIMARY KEY,   -- field as hex string
    program_id       TEXT NOT NULL,      -- "fairdrop_dutch_v3.aleo" etc.
    creator          TEXT NOT NULL,      -- creator address
    metadata_hash    TEXT,               -- field as hex — links to metadata table
    config           JSONB NOT NULL,     -- full AuctionConfig fields
    state            JSONB,              -- latest AuctionState snapshot
    created_at_block INTEGER NOT NULL,
    closed_at_block  INTEGER,
    status           TEXT NOT NULL       -- 'live' | 'ended' | 'cleared' | 'voided'
);

-- Bid events (dutch, ascending, lbp, raise, quadratic)
CREATE TABLE bids (
    id               SERIAL PRIMARY KEY,
    auction_id       TEXT NOT NULL REFERENCES auctions(auction_id),
    bidder           TEXT,               -- NULL for private bids (source hidden)
    payment_amount   NUMERIC NOT NULL,
    quantity         NUMERIC,            -- NULL for raise/quadratic (not specified at bid)
    contribution_weight NUMERIC,         -- quadratic only: sqrt(payment_amount)
    bid_price        NUMERIC,            -- ascending/dutch only: price at bid block
    block_height     INTEGER NOT NULL,
    tx_id            TEXT NOT NULL
);

-- Sealed auction commitments (critical for slasher bot)
CREATE TABLE commitments (
    commitment_hash  TEXT PRIMARY KEY,
    auction_id       TEXT NOT NULL REFERENCES auctions(auction_id),
    payment_amount   NUMERIC NOT NULL,
    committed_at     INTEGER NOT NULL,   -- block height
    revealed_at      INTEGER,            -- NULL if not yet revealed
    cancelled_at     INTEGER,            -- NULL if not cancelled
    slashed_at       INTEGER,            -- NULL if not slashed
    slasher          TEXT,               -- address that called slash_unrevealed
    status           TEXT NOT NULL       -- 'pending' | 'revealed' | 'cancelled' | 'slashed'
);

-- Creator reputation (from fairdrop_proof_v2.aleo)
CREATE TABLE creator_stats (
    creator          TEXT PRIMARY KEY,
    auctions_run     INTEGER DEFAULT 0,
    auctions_filled  INTEGER DEFAULT 0,
    total_volume     NUMERIC DEFAULT 0,
    updated_at_block INTEGER
);

-- Referral activity
CREATE TABLE referral_events (
    id               SERIAL PRIMARY KEY,
    code_id          TEXT NOT NULL,
    auction_id       TEXT NOT NULL,
    event_type       TEXT NOT NULL,      -- 'recorded' | 'credited' | 'claimed'
    amount           NUMERIC,
    block_height     INTEGER NOT NULL
);

-- Off-chain metadata (from Metadata Service)
CREATE TABLE metadata (
    metadata_hash    TEXT PRIMARY KEY,   -- matches AuctionConfig.metadata_hash
    ipfs_cid         TEXT NOT NULL,      -- actual IPFS CID for fetching
    name             TEXT,
    description      TEXT,
    website          TEXT,
    logo_ipfs        TEXT,               -- IPFS CID of logo image
    twitter          TEXT,
    discord          TEXT,
    raw_json         JSONB NOT NULL,
    pinned_at        TIMESTAMPTZ NOT NULL
);

-- Reveal notification subscriptions (for sealed auctions)
CREATE TABLE reveal_subscriptions (
    id               SERIAL PRIMARY KEY,
    auction_id       TEXT NOT NULL,
    commitment_hash  TEXT NOT NULL,
    notification_channel TEXT NOT NULL,  -- 'email' | 'push' | 'webhook'
    contact          TEXT NOT NULL,      -- email address, push token, or webhook URL
    notified_at      TIMESTAMPTZ,        -- NULL until sent
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexer cursor (single row)
CREATE TABLE indexer_state (
    id               BOOLEAN PRIMARY KEY DEFAULT TRUE,
    last_indexed_block INTEGER NOT NULL DEFAULT 0
);
```

---

### Component 3 — Public API

REST API consumed by the frontend. Stateless — all data served from the database. No authentication required except for notification subscription and credential endpoints.

```
GET  /auctions
     ?program=fairdrop_dutch_v3.aleo   (filter by type)
     ?creator=aleo1...              (filter by creator)
     ?status=live                   (filter by status)
     ?page=1&limit=20
     → [{ auction_id, program_id, name, status, fill_pct, current_price,
           supply, total_committed, creator, ends_at_block, metadata }]

GET  /auctions/:auction_id
     → { config, state, metadata, bid_count, status, current_price }

GET  /auctions/:auction_id/bids
     → [{ bidder?, payment_amount, quantity?, bid_price?, block_height }]

GET  /auctions/:auction_id/price
     → { current_price, block_height }
     // For dutch/ascending: computed from config + current block
     // For lbp: computed from config + current block + total_committed
     // For raise/quadratic: fixed (raise_target/supply) or N/A

GET  /auctions/:auction_id/price-chart
     → [{ block_height, price }]
     // One point per bid event — shows price trajectory over auction lifetime

GET  /auctions/:auction_id/commitments
     → { total: number, revealed: number, pending: number, slashed: number }
     // No individual commitment data exposed — just aggregate counts

GET  /creators/:address
     → { auctions_run, auctions_filled, total_volume, auctions: [...] }

GET  /bidder/:address/bids
     → [{ auction_id, payment_amount, quantity?, status: 'active'|'claimed' }]
     // Only covers public bids — private bids are anonymous

GET  /metadata/:hash
     → { name, description, website, logo_ipfs, twitter, discord }

POST /metadata
     body: { metadata_json, auction_id }
     → { metadata_hash, ipfs_cid }
     // Validates JSON schema, pins to IPFS, stores in DB
     // Called by frontend during create_auction flow before submitting tx

POST /subscriptions/reveal
     body: { auction_id, commitment_hash, channel, contact }
     → { subscription_id }
     // Stores notification preference for the reveal window

GET  /stats
     → { total_auctions, total_volume, active_auctions, programs: { ... } }
```

**Current price computation (server-side):**
The API server computes `current_price` from config fields and `block.height` using the same formula as the Leo contract. This is deterministic and verifiable — any client can re-derive it. The server provides it as a convenience so the frontend doesn't reimplement the formula.

---

### Component 4 — Slasher Bot

Runs as a module within the indexer process. Uses the same database. Has its own funded wallet for submitting slash transactions.

**Algorithm:**
```
every 100 blocks after any auction's reveal_end_block:

  candidates = SELECT commitment_hash, payment_amount, auction_id
               FROM commitments
               WHERE status = 'pending'
                 AND auction.reveal_end_block < current_block

  for each candidate:
    submit slash_unrevealed(commitment_hash, payment_amount) to fairdrop_sealed_v3.aleo
    if success: UPDATE commitments SET status='slashed', slashed_at=block_height
    if failed (already revealed or already slashed): UPDATE status accordingly
    // 20% caller reward goes to slasher wallet
```

**Operational requirements:**
- Slasher wallet must maintain a minimum credits balance for transaction fees
- Alert if balance drops below threshold
- Alert if any commitment remains pending > `reveal_end_block + 500 blocks` without being slashed
- Retry failed slashes with exponential backoff (max 5 retries)

**Why the slasher is funded by its own rewards:** the 20% caller reward from each slashed commitment covers gas costs and accumulates profit. At scale, the slasher is self-funding. At low volume, protocol should seed the slasher wallet.

---

### Component 5 — Metadata Service

Handles auction metadata that cannot be stored on-chain (Leo has no string type).

**Flow at `create_auction`:**
```
1. Creator fills metadata form in frontend (name, description, website, logo, socials)
2. Frontend POST /metadata { metadata_json, auction_id }
3. Server validates JSON schema
4. Server pins JSON to IPFS → gets IPFS CID
5. Server computes metadata_hash = BHP256(canonical_json_bytes)
6. Server stores { metadata_hash, ipfs_cid, parsed_fields } in DB
7. Server returns { metadata_hash, ipfs_cid } to frontend
8. Frontend includes metadata_hash in create_auction transaction inputs
9. On-chain AuctionConfig stores metadata_hash
```

**Integrity guarantee:** anyone can fetch the IPFS content at `ipfs_cid`, hash it with BHP256, and verify it matches `AuctionConfig.metadata_hash`. The on-chain hash is the anchor of trust. The IPFS content and the backend DB are convenience layers.

**If the Fairdrop backend goes down:** auctions remain fully functional on-chain. The frontend loses human-readable names and descriptions. Any operator can run their own metadata service by serving the same JSON for any `metadata_hash` they know.

---

### Component 6 — Credential Signing Service

Issues ZK credentials for gated auctions. Deployed separately from the indexer/API with stronger security requirements. This component holds the signing key that authorizes auction access — its compromise bypasses all credential gating.

**Endpoint:**
```
POST /credentials/request
Authorization: Bearer <access_token>   ← depends on auction's gate criteria
body: {
    auction_id: string,
    address: string,       // Aleo address requesting the credential
}
→ {
    sig: string,           // signature over CredentialMessage
    expiry: number,        // block height at which credential expires
    auction_id: string,
    holder: string,
}
```

**Per-auction eligibility criteria (configured by creator):**
- `OPEN` — any address gets a credential (functionally same as no gating)
- `ALLOWLIST` — address must be in a creator-supplied list (stored in credential service DB)
- `KYC` — address must have passed a KYC provider integration (e.g., Fractal, Synaps)
- `TOKEN_HOLD` — address must hold a minimum balance of a specified token (indexer verifies)
- `PREVIOUS_PARTICIPANT` — address must appear in `fairdrop_proof_v2.aleo/participated` for a prior auction

**Signing:**
```
CredentialMessage = { holder: address, auction_id: field, expiry: u32 }
message_hash = BHP256::hash_to_field(CredentialMessage)
sig = signing_key.sign(message_hash)
```
`signing_key` must match `credential_issuers[auction_id]` registered in `fairdrop_gate_v2.aleo` at auction creation. Each auction can designate any address as its issuer — Fairdrop's service is the default, but creators can run their own.

**Security requirements:**
- Signing key stored in cloud KMS (AWS KMS, GCP Cloud KMS) or HSM — never on disk
- Rate limit: one credential per (address, auction_id)
- Expiry window: `CREDENTIAL_VALIDITY_BLOCKS = 500` (~33 min at 4s/block). Short enough to prevent reuse; long enough to survive a slow proving time.
- Audit log: every credential issued with timestamp and eligibility reason
- Separate deployment from indexer — different VPC, different credentials, different on-call

---

### Component 7 — Reveal Notification Service

Sealed auction bidders must submit their reveal within `[commit_end_block, reveal_end_block]`. If they miss the window, their payment is slashed. A notification service prevents accidental fund loss.

**Triggers:**
- `commit_end_block - 50 blocks` (~3 min early warning): "Your reveal window opens soon for auction [name]. Your browser tab must be open or the reveal will be submitted automatically if you registered a contact."
- `commit_end_block`: "Reveal window is now open. Submitting your reveal automatically..." (frontend handles if tab is open; backend notification if registered)
- `reveal_end_block - 200 blocks` (~13 min): "Final reminder: reveal window closes in ~13 minutes."

**Implementation:** scheduled jobs query `reveal_subscriptions` for upcoming deadlines. Send via email (Resend/SendGrid), push notification (FCM), or HTTP webhook. Job runs every 50 blocks. Notification deduplication via `notified_at` field.

**Frontend fallback:** even without a subscription, the frontend polls `block.height` and shows a countdown banner when the user's committed auctions approach `commit_end_block`. The subscription service is a belt-and-suspenders measure for users who close their browser.

---

### Operational Checklist (before mainnet)

```
□ Indexer deployed and synced from genesis of fairdrop program deployments
□ All 6 auction programs and 4 utility programs added to watch list
□ Database migrations run, backup schedule confirmed
□ API rate limiting configured (per-IP, per-endpoint)
□ Slasher wallet funded with initial credits balance
□ Slasher alert configured: balance < 100 credits → page on-call
□ Credential signing key generated in KMS (not locally)
□ Credential service deployed to isolated environment (separate VPC)
□ IPFS pinning service configured (Pinata, web3.storage, or self-hosted)
□ Metadata schema validator tested against edge cases (empty fields, max lengths)
□ Reveal notification service tested end-to-end with a testnet sealed auction
□ API public endpoint documented for third-party frontend developers
□ Indexer lag monitoring: alert if > 10 blocks behind chain head
□ Database replication / read replica for API queries (indexer writes, API reads)
```

---

### What is verifiable vs. trusted

| Component | Verifiable on-chain? | Notes |
|---|---|---|
| Auction config, state, escrow | Yes | All in program mappings — read directly |
| Bid amounts | Partial | Public bids: verifiable. Private bids: amount in finalize output, bidder hidden. |
| Commitment hashes | Yes | `pending_commits` mapping — directly readable |
| Clearing price | Yes | Computed from config deterministically |
| Metadata content | Yes | Hash on-chain; content on IPFS; anyone can verify |
| Creator reputation | Yes | `fairdrop_proof_v2.aleo/reputation` mapping |
| Credential issuance | **No** | Signing service is a trust boundary — issuer's off-chain decisions are opaque |
| Indexer data | **Partially** | Convenience layer; any discrepancy is verifiable against chain |

The credential service is the only component where trust cannot be reduced by the protocol design. Creators who want a fully trustless gate must run their own credential issuer or use the Merkle allowlist path instead.

---

## 12. Privacy Threat Model

The product's core marketing claim is privacy. This section defines exactly what is and isn't private for each auction type. This table is the source of truth for marketing copy, audit scope, and user documentation.

### What "private" means on Aleo

Aleo ZK proofs hide the **inputs** of a transition. Public mappings are always visible. Once a value appears in a mapping (via finalize), it is permanently public. "Private" below means "never appears in any finalize output or public mapping."

### Per-auction-type privacy table

| | Dutch | Sealed | Raise | Ascending | LBP | Quadratic |
|---|---|---|---|---|---|---|
| **Bid quantity** | **PUBLIC** (finalize updates `total_committed`) | Private during commit window; public after reveal | N/A (not specified) | **PUBLIC** | **PUBLIC** | N/A (uses payment weight) |
| **Bid source address** | Private (private path) / Public (public path) | Private (private path) / Public (public path) | Same | Same | Same | Same |
| **Payment amount** | Private (private path); public after close via `creator_revenue` | Private during commit; public in finalize on commit | Public (updates `total_payments`) | Public (pay-what-you-bid, tracked) | Public | Public |
| **Bid timing** | Public (finalize block height logged by indexer) | Public (commit block height logged) | Public | Public | Public | Public |
| **Winner status** | Inferable post-close (anyone with `supply`, `clearing_price`, and `bid_totals` can compute) | Private — only revealed bidders can be winners; `total_committed` is sum of reveals | Inferable (pro-rata public) | Inferable (bid_totals visible) | Inferable | Inferable |
| **Allocation amount** | Private — only in Bid record, encrypted to owner | Private — only in Bid record after reveal | Private — computed at claim from private RaiseBid record | Private — in AscendingBid record | Private — in LBPBid record | Private — in QuadraticBid record |

### Key privacy properties

**Dutch auction:** this is the lowest-privacy auction type. Bid quantities appear in finalize on every `place_bid`. The order book (quantity per block range) is visible in real time. The main privacy benefit is bid source address via `place_bid_private` — identity is hidden, but not quantity or timing.

**Sealed auction:** this is the highest-privacy auction type during the commit window. Quantities are completely hidden. After reveals, quantities become public (as `total_committed` increments). The privacy window is `[start_block, reveal_end_block]`. Post-auction, all revealed quantities are permanently on-chain. Non-revealed commitments are eventually slashed — their payments become public, but the intended quantity is never known.

**Raise auction:** payment amounts are always public. Allocation ratios are inferable post-close from public `total_payments` and each public payment. This is the least private allocation mechanism — use Dutch or Sealed if quantity privacy is required.

**Ascending, LBP:** same as Dutch for quantity privacy (quantities reach finalize). The ZK benefit is bid source privacy (private path hides which wallet funded the bid).

### What on Aleo ZK does NOT protect against

1. **Timing correlation:** bid timing is always public (block number). Sophisticated observers can correlate wallet activity with bid timing.
2. **Amounts after settle:** even in sealed auctions, `total_committed` is fully public after the reveal window. The sum of all winning allocations is public. Individual allocations are not (they're in private records).
3. **Secondary market deanonymization:** listing a Bid record on the secondary market (`list_bid`) reveals the quantity publicly forever (D8).
4. **Validator observation:** Aleo validators execute transition inputs in plaintext during proof verification. They can observe private inputs. This is a known protocol-level privacy bound — Aleo's ZK proofs are snark-based, not MPC-based.
5. **View key compromise:** Bid records are encrypted to the owner's view key. If a bidder shares their view key (or it is compromised), all their bid records are visible.

### Privacy marketing accuracy

The correct claim: "bid quantities are hidden from other participants during the auction." Not: "bids are fully private." The qualifier "from other participants" is key — validators and the bidder's own view key can always see the data.

For the sealed auction specifically: "the order book is completely hidden while the auction is live. No one — not even Fairdrop — can see how much anyone bid until they choose to reveal." This is accurate and is the unique value proposition versus all transparent-chain alternatives.
