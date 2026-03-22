# fairdrop_raise.aleo

Privacy-preserving fixed-price community raise with pro-rata token allocation.

Creator sets `raise_target` (total credits to collect) and `supply` (tokens to distribute). Bidders commit any payment ≥ `min_bid_amount`. There is no price discovery — implied price = `raise_target / supply`. Allocation is pro-rata by payment.

## Status

Implementation complete (`src/main.leo`). Deployment and integration testing pending.

---

## Mechanism overview

### Price model

No price curve. The raise has a single fixed target:

```
implied_price = raise_target / supply  (per sale_scale units)
```

### Bidding

Bidders call `place_bid_private` (private credits UTXO) or `place_bid_public` (public credits balance). Both variants are available with and without referral attribution.

Bids are **capped at raise_target**:

```
assert(new_total_payments <= raise_target)
```

The last bidder must send exactly the remaining gap (`raise_target - state.total_payments`). The frontend computes this before submitting. Over-bids are rejected at finalize.

`supply_met` triggers when `total_payments >= raise_target`, enabling immediate close. The per-address cap (`max_bid_amount`) is enforced on cumulative payment (not quantity).

### Settlement

At `close_auction`, two outcomes:

| Condition | Outcome |
|---|---|
| `total_payments >= raise_target` | **CLEARED** — pro-rata allocation proceeds |
| `total_payments < raise_target` | **VOIDED** — all bidders refunded, creator reclaims supply |

### Pro-rata allocation at claim

Since bids are capped at `raise_target`, `total_payments == raise_target` when cleared. The formula:

```
actual_quantity = bid.payment_amount * supply / total_payments
               = bid.payment_amount * supply / raise_target
```

**Refund** = rounding dust from integer floor division:

```
cost   = actual_quantity * raise_target / supply  (≤ bid.payment_amount)
refund = bid.payment_amount - cost                (≤ 1 microunit per bidder)
```

Both `actual_quantity` and `refund` are computed privately in the transition body from D11 params, then validated in finalize. The bidder's identity and allocation amount are never revealed on-chain.

**Important:** if `bid.payment_amount < raise_target / supply`, integer division rounds `actual_quantity` to 0 and the claim reverts. Frontend should enforce `payment_amount >= raise_target / supply` as the minimum meaningful bid.

---

## Void path (target not met)

If the raise fails (`close_auction` finds `total_payments < raise_target`):

1. `state.voided = true`
2. Bidders call `claim_voided` — full `payment_amount` returned privately
3. Creator calls `withdraw_unsold` — full `supply` minted back to creator

`withdraw_unsold` is allowed in **both cleared and voided** states (unlike Dutch which only allows cleared). In the voided case it returns the entire supply budget.

---

## Voiding vs. cancellation

| Path | When | Who |
|---|---|---|
| `close_auction` marks voided | `block.height >= end_block` and target not met | anyone |
| `cancel_auction` marks voided | any time before cleared | creator only |

Both paths leave bidder credits in `escrow_payments`. Bidders always recover via `claim_voided`.

---

## Revenue accounting

Set at cleared `close_auction`:

```
total_cost      = raise_target     (fixed; bids cap at this amount)
protocol_fee    = total_cost * fee_bps / 10000
creator_revenue = total_cost - protocol_fee
referral_budget = protocol_fee * referral_pool_bps / 10000
treasury_credit = protocol_fee - referral_budget - closer_reward
```

**Escrow invariant:**

```
escrow_payments = creator_revenue + sum(rounding_refunds) + protocol_fee
               ≈ raise_target  ✓
```

Creator withdraws up to `creator_revenue` via `withdraw_payments`. Rounding refunds (≤ 1 microunit × n_bidders) are paid atomically at each `claim`. Protocol fee sits in the contract balance.

---

## Transition reference

| Transition | When | Who |
|---|---|---|
| `create_auction` | before start_block | creator |
| `place_bid_private` | during auction | bidder (private credits) |
| `place_bid_public` | during auction | bidder (public credits) |
| `place_bid_private_ref` | during auction | bidder (private credits + referral) |
| `place_bid_public_ref` | during auction | bidder (public credits + referral) |
| `close_auction` | after supply_met or end_block | anyone |
| `push_referral_budget` | after cleared close | anyone |
| `claim` | after cleared close | bidder |
| `claim_vested` | after cleared close | bidder (vest_enabled auctions) |
| `withdraw_payments` | after cleared close | creator |
| `withdraw_unsold` | after cleared or voided close | creator |
| `cancel_auction` | any (pre-clear) | creator |
| `claim_voided` | after voided (cancel or target miss) | bidder |

---

## Privacy model

| Data | Visibility |
|---|---|
| Bid payment amount | Public (on-chain escrow; unavoidable for accounting) |
| Bid quantity | N/A — not specified at bid time |
| Bidder identity | Pseudonymous — `BHP256(bidder, auction_id)` only |
| Allocation amount | Private — computed from RaiseBid record at claim |
| Token recipients | Private (`mint_private`) |
| Vest owner | Private |

**Privacy caveat:** allocation ratios are inferable post-close. Since `total_payments = raise_target` is public and each bidder's `payment_amount` is public, `actual_quantity ≈ payment / raise_target * supply` is computable by anyone. The raise is the **least private** allocation mechanism — use Dutch or Sealed if quantity privacy is required.

---

## Auction ID derivation

```
auction_id = BHP256(AuctionKey { creator, nonce, program_salt: 4field })
```

`PROGRAM_SALT = 4field` prevents cross-type ID collisions (Dutch=1, Ascending=2, Sealed=3).

---

## Parameters

| Parameter | Description |
|---|---|
| `supply` | Total token units to distribute |
| `raise_target` | Total credits required for the raise to succeed |
| `start_block` / `end_block` | Auction window |
| `min_bid_amount` | Minimum payment per bid (microcredits) |
| `max_bid_amount` | Maximum cumulative payment per bidder (0 = no cap) |
| `sale_scale` | `10^sale_token_decimals` — pro-rata denominator |
| `gate_mode` | 0 = open, 1 = merkle allowlist, 2 = credential |
| `vest_enabled` | Whether allocations vest over time |
