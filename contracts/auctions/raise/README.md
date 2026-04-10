# fairdrop_raise_v3.aleo

Privacy-preserving fixed-price community raise with pro-rata token allocation.

Creator sets `raise_target` (total credits to collect) and `supply` (tokens to distribute). Bidders commit any payment ≥ `min_bid_amount`. There is no price discovery — implied price = `raise_target / supply`. Allocation is pro-rata by payment against the effective supply at close.

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

`supply_met` triggers when `total_payments >= raise_target`, enabling immediate close. The per-address cap (`max_bid_amount`) is enforced on cumulative payment.

### Settlement

At `close_auction`, the outcome depends on `fill_min_bps`:

| Condition | `fill_min_bps` | Outcome |
|---|---|---|
| `total_payments >= raise_target` | any | **CLEARED (full)** — full supply distributed |
| `total_payments >= raise_target × fill_min_bps / 10000` | > 0 | **CLEARED (partial)** — scaled supply distributed |
| otherwise | any | **VOIDED** — bidders reclaim credits, creator reclaims supply |

When `fill_min_bps = 0` (default), the auction clears only on full `raise_target`.

#### Effective supply

For partial fills, only a proportional share of the supply is distributed:

```
effective_supply = supply × total_payments / raise_target   (partial fill)
effective_supply = supply                                    (full / over-subscribed)
```

`effective_supply` is written to `AuctionState` at close and used in all claim computations.

### Pro-rata allocation at claim

```
actual_quantity = bid.payment_amount × effective_supply / total_payments
```

The bidder's full `payment_amount` is kept by the creator — there are **no refunds**. Integer rounding dust stays in the escrow; it is claimed by the creator via `withdraw_payments`.

`actual_quantity` and the D11 params are validated in finalize. The bidder's identity and allocation amount are never revealed on-chain.

**Important:** if `bid.payment_amount × effective_supply < total_payments`, integer division rounds `actual_quantity` to 0 and the claim reverts. Frontend should enforce `payment_amount >= total_payments / effective_supply` as the minimum meaningful bid.

---

## Void path (target not met)

If the raise fails (`close_auction` finds `total_payments < min_payments`):

1. `state.voided = true`
2. Bidders call `claim_voided` — full `payment_amount` returned privately
3. Creator calls `withdraw_unsold` — full `supply` minted back to creator

`withdraw_unsold` is allowed in **both cleared and voided** states. In the voided case it returns the entire supply budget.

---

## Voiding vs. cancellation

| Path | When | Who |
|---|---|---|
| `close_auction` marks voided | target not met at close | anyone |
| `cancel_auction` marks voided | any time before cleared | creator only |

Both paths leave bidder credits in `escrow_payments`. Bidders always recover via `claim_voided`.

---

## Revenue accounting

Set at cleared `close_auction`:

```
total_cost      = total_payments    (= raise_target for full raise; ≤ raise_target for partial)
protocol_fee    = total_cost × fee_bps / 10000
creator_revenue = total_cost - protocol_fee
referral_budget = protocol_fee × referral_pool_bps / 10000
treasury_credit = protocol_fee - referral_budget - closer_reward
```

**Escrow invariant** (no refunds):

```
escrow_payments = creator_revenue + protocol_fee
               = total_payments  ✓
```

Creator withdraws up to `creator_revenue` via `withdraw_payments(auction_id, amount, recipient)`. Protocol fee accrues in the contract balance; governance withdraws via `withdraw_treasury_fees`.

---

## Transition reference

| Transition | When | Who |
|---|---|---|
| `create_auction` | before `start_block` | creator |
| `place_bid_private` | during auction | bidder (private credits) |
| `place_bid_public` | during auction | bidder (public credits) |
| `place_bid_private_ref` | during auction | bidder (private credits + referral) |
| `place_bid_public_ref` | during auction | bidder (public credits + referral) |
| `close_auction` | after `supply_met`, `end_block`, or fill_min_bps threshold | anyone |
| `push_referral_budget` | after cleared close | anyone |
| `claim` | after cleared close | bidder |
| `claim_vested` | after cleared close | bidder (`vest_enabled` auctions) |
| `withdraw_payments` | after cleared close | creator |
| `withdraw_unsold` | after cleared or voided close | creator |
| `withdraw_treasury_fees` | after cleared close + multisig approval | governance |
| `cancel_auction` | any (pre-clear) | creator |
| `claim_voided` | after voided (cancel or target miss) | bidder |

`withdraw_payments` and `withdraw_unsold` both accept a `recipient: address` parameter — the creator can direct funds to any address (treasury, DEX, partner).

---

## Privacy model

| Data | Visibility |
|---|---|
| Bid payment amount | Public (on-chain escrow; unavoidable for accounting) |
| Bid quantity | N/A — not specified at bid time |
| Bidder identity | Pseudonymous — `BHP256(bidder, auction_id)` only |
| Allocation amount | Private — computed from `RaiseBid` record at claim |
| Token recipients | Private (`mint_private`) |
| Vest owner | Private |

**Privacy caveat:** allocation ratios are inferable post-close. Since `total_payments` is public and each bidder's `payment_amount` is public, `actual_quantity ≈ payment / total_payments × effective_supply` is computable by anyone. Use Dutch or Sealed if quantity privacy is required.

---

## Parameters

| Parameter | Type | Description |
|---|---|---|
| `supply` | `u128` | Total token units to distribute. |
| `raise_target` | `u128` | Total credits required for a full raise. Must be > 0. |
| `fill_min_bps` | `u16` | Minimum fill threshold in basis points (0 = disabled; 7000 = 70%). When > 0, the auction clears with partial supply if `total_payments ≥ raise_target × fill_min_bps / 10000`. |
| `start_block` / `end_block` | `u32` | Auction window. |
| `min_bid_amount` | `u128` | Minimum payment per bid (microcredits). |
| `max_bid_amount` | `u128` | Maximum cumulative payment per bidder (0 = no cap). |
| `sale_scale` | `u128` | `10^sale_token_decimals` — pro-rata denominator. |
| `gate_mode` | `u8` | 0 = open, 1 = Merkle allowlist, 2 = credential. |
| `vest_enabled` | `bool` | Whether allocations vest over time. |

---

## Auction ID derivation

```
auction_id = BHP256(AuctionKey { creator, nonce, program_salt: 4field })
```

`PROGRAM_SALT = 4field` prevents cross-type ID collisions (Dutch=1, Ascending=2, Sealed=3).
