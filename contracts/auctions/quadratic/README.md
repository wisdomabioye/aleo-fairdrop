# fairdrop_quadratic_v2.aleo

Privacy-preserving quadratic allocation auction. Contribution weight is the **square root of payment** — not the payment itself. A bidder with 100× your budget receives only 10× your tokens. Anti-whale by design.

Credential gating (`gate_mode = 2`) is strongly recommended. Without it, a single participant can split their payment across N addresses to gain `sqrt(N)` times the weight they would have from one address.

## Status

Implementation complete (`src/main.leo`). Deployment and integration testing pending.

---

## Mechanism overview

### Allocation formula

```
contribution_weight  = approx_sqrt(payment_amount)
total_sqrt_weight   += contribution_weight            ← accumulated in mapping

At claim:
actual_quantity = supply × bid.contribution_weight / state.total_sqrt_weight
```

Weights are accumulated across all bids. Each bidder's allocation is their share of the total weight, applied to the full supply.

### `approx_sqrt` implementation

Newton-Raphson with 64 unrolled iterations. Starting estimate: `2^33 = 8_589_934_592` (strict overestimate of `sqrt(u64_max)`). Converges to `floor(sqrt(n))` for all `n` in `u64` range.

> **Note:** `payment_amount` must be within `u64` range for the sqrt to be valid. The frontend enforces this at bid time.

### Success / void

The auction always runs to `end_block` — there is no early close on `supply_met`.

| Condition at `close_auction` | Outcome |
|---|---|
| `total_payments >= raise_target` | **CLEARED** — allocations proceed |
| `total_payments < raise_target` | **VOIDED** — bidders refunded, creator reclaims supply |

### Sybil risk

Splitting payment `P` across `N` addresses produces `N × sqrt(P/N) = sqrt(N) × sqrt(P)` total weight — more than a single `sqrt(P)`. Combining `gate_mode = 2` (credential gate) with one credential per verified identity is the intended mitigation.

---

## Bidding

Bidders call `place_bid_private` (private credits UTXO) or `place_bid_public` (public credits balance). Referral variants are available.

The finalize block:
1. Computes `contribution_weight = approx_sqrt(payment_amount)`.
2. Adds it to `state.total_sqrt_weight`.
3. Records `escrow_payments` and per-bidder `payments` for later claim.
4. Asserts auction is active and payment ≥ `min_bid_amount`.

Per-bidder cumulative cap enforced via `max_bid_amount` (0 = no cap).

---

## Settlement

### Cleared path

At `claim`:
- `actual_quantity = supply × bid.contribution_weight / state.total_sqrt_weight`
- Cost and integer-rounding refund computed privately, validated in finalize.
- If `vest_enabled`, use `claim_vested` instead.

### Voided path

If the raise fails:
- `state.voided = true` at `close_auction`.
- Bidders call `claim_voided` — full `payment_amount` returned privately.
- Creator calls `withdraw_unsold` — full supply minted back.

---

## Revenue accounting

Set at cleared `close_auction`:

```
protocol_fee    = total_payments * fee_bps / 10000
creator_revenue = total_payments - protocol_fee
referral_budget = protocol_fee * referral_pool_bps / 10000
treasury_credit = protocol_fee - referral_budget - closer_reward
```

Voided auctions: no revenue computed.

---

## Transition reference

| Transition | When | Who |
|---|---|---|
| `create_auction` | before `start_block` | creator |
| `place_bid_private` | during auction | bidder (private credits) |
| `place_bid_public` | during auction | bidder (public credits) |
| `place_bid_private_ref` | during auction | bidder (private credits + referral) |
| `place_bid_public_ref` | during auction | bidder (public credits + referral) |
| `close_auction` | after `end_block` | anyone |
| `push_referral_budget` | after cleared close | anyone |
| `claim` | after cleared close | bidder |
| `claim_vested` | after cleared close | bidder (`vest_enabled` auctions) |
| `withdraw_payments` | after cleared close | creator |
| `withdraw_unsold` | after cleared or voided close | creator |
| `cancel_auction` | any (pre-clear) | creator |
| `claim_voided` | after voided (cancel or target miss) | bidder |

---

## Privacy model

| Data | Visibility |
|---|---|
| Bid payment amount | Public (on-chain escrow; unavoidable for accounting) |
| Contribution weight | Public (`sqrt(payment)`; inferable from payment anyway) |
| Allocation amount | Private — computed from `QuadraticBid` record at claim |
| Bidder identity | Pseudonymous — `BHP256(bidder, auction_id)` only |
| Token recipients | Private (`mint_private`) |
| Vest owner | Private |

Allocation amounts are private at claim — the link between payment and quantity is hidden. The weight itself (public) reveals only `sqrt(payment)`, not the full payment amount (though payment is also public).

---

## Parameters

| Parameter | Type | Description |
|---|---|---|
| `supply` | `u128` | Total tokens to distribute. |
| `raise_target` | `u128` | Minimum total credits for the auction to clear. Must be > 0. |
| `start_block` / `end_block` | `u32` | Auction window. No early close. |
| `min_bid_amount` | `u128` | Minimum payment per bid (microcredits). |
| `max_bid_amount` | `u128` | Maximum cumulative payment per bidder (0 = no cap). |
| `sale_scale` | `u128` | `10^sale_token_decimals` — allocation denominator. |
| `gate_mode` | `u8` | 0 = open, 1 = Merkle allowlist, 2 = credential. Credential gate strongly recommended. |
| `vest_enabled` | `bool` | Whether allocations vest over time. |

---

## Auction ID derivation

```
auction_id = BHP256(AuctionKey { creator, nonce, program_salt: 6field })
```

`PROGRAM_SALT = 6field` (Dutch=1, Ascending=2, Sealed=3, Raise=4, LBP=5).

---

## Comparison with Raise

| Property | Raise | Quadratic |
|---|---|---|
| Allocation | Pro-rata by payment | Pro-rata by `sqrt(payment)` |
| Anti-whale | No — proportional to capital | Yes — diminishing returns |
| Raise target | Required for success | Required for success |
| Early close | Yes (`supply_met`) | No — always runs to `end_block` |
| Sybil resistance | Not applicable | Requires credential gate |
| Ideal use case | Fair fixed-price raise | Community raise favouring broad participation |
