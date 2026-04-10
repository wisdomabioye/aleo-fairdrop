# fairdrop_lbp_v3.aleo

Privacy-preserving Liquidity Bootstrapping Pool auction. Price is a joint function of **remaining supply** and **remaining time** — high demand slows the descent; low demand accelerates it. Self-correcting price discovery without an oracle or liquidity pool.

## Status

Implementation complete (`src/main.leo`). Deployment and integration testing pending.

---

## Mechanism overview

### Price formula

```
remaining       = supply - total_committed    (before this bid)
time_remaining  = end_block - block.height
total_duration  = end_block - start_block
supply_fraction = remaining      / supply          (× PRECISION = 1_000_000)
time_fraction   = time_remaining / total_duration  (× PRECISION)
price_spread    = start_price - floor_price

current_price   = floor_price
                + price_spread × supply_fraction / PRECISION
                               × time_fraction   / PRECISION
```

- **`start_price`** — maximum price per token (when supply is full and t = 0).
- **`floor_price`** — minimum price per token regardless of supply or time.
- Both supply and time fractions must drop to push the price toward `floor_price`.

When demand is **high** (supply depletes quickly), `supply_fraction` stays elevated, slowing the price descent.
When demand is **low**, `supply_fraction` falls fast, accelerating the drop to attract buyers.

### Slippage guard

Bidders supply `max_bid_price` — the maximum price they will accept. The finalize block re-derives `current_price` from on-chain state and asserts:

```
current_price <= max_bid_price
```

Because LBP price is strictly non-increasing (both fractions can only decrease over time), concurrent bids never cause false rejections — price can only fall between tx construction and finalization. Exact equality would fail whenever any other bid lands first; a ceiling check is robust to this.

### Payment model

Pay-what-you-bid. There is no uniform clearing price. Each bidder pays the price that was current when their bid finalized. `creator_revenue = total_payments`.

### Anti-front-running

All Aleo transaction inputs are encrypted until a block is finalized. Front-running bots cannot observe pending bids and react before they land. Combined with the non-increasing price model (concurrent bids can only help, never hurt), LBP on Aleo is structurally manipulation-resistant.

---

## Bidding

Bidders call `place_bid_private` (private credits UTXO) or `place_bid_public` (public credits balance). Referral variants are available.

The finalize block checks:
```
current_price <= max_bid_price
payment_amount >= quantity * current_price / sale_scale
total_committed + quantity <= supply
block.height >= start_block && block.height < end_block
```

Multiple bids are allowed per bidder up to `max_bid_amount` (0 = no cap).

### Early close

`supply_met = true` is set when `total_committed >= supply`. The auction can be closed immediately once supply is exhausted, before `end_block`.

---

## Settlement

At `claim`:
- Bidder mints exactly the `quantity` from their `LBPBid` record.
- No refund — they paid the price at bid time.
- If `vest_enabled`, use `claim_vested` instead.

At `close_auction`:
```
protocol_fee    = total_payments * fee_bps / 10000
creator_revenue = total_payments - protocol_fee
referral_budget = protocol_fee * referral_pool_bps / 10000
treasury_credit = protocol_fee - referral_budget - closer_reward
```

---

## Transition reference

| Transition | When | Who |
|---|---|---|
| `create_auction` | before `start_block` | creator |
| `place_bid_private` | during auction | bidder (private credits) |
| `place_bid_public` | during auction | bidder (public credits) |
| `place_bid_private_ref` | during auction | bidder (private credits + referral) |
| `place_bid_public_ref` | during auction | bidder (public credits + referral) |
| `close_auction` | after `supply_met` or `end_block` | anyone |
| `push_referral_budget` | after close | anyone |
| `claim` | after close | bidder |
| `claim_vested` | after close | bidder (`vest_enabled` auctions) |
| `withdraw_payments` | after close | creator |
| `withdraw_unsold` | after close | creator |
| `cancel_auction` | any (pre-clear) | creator |
| `claim_voided` | after cancel | bidder |

---

## Privacy model

| Data | Visibility |
|---|---|
| Bid payment amount | Public (on-chain escrow; unavoidable for accounting) |
| Bid quantity | Public (used in supply tracking and price formula) |
| `max_bid_price` | Public (in `LBPBid` record for analytics) |
| Bidder identity | Pseudonymous — `BHP256(bidder, auction_id)` only |
| Token recipients | Private (`mint_private`) |
| Vest owner | Private |

Bid amounts and quantities are public, but bidder identity is pseudonymous — the link between quantity and identity is hidden.

---

## Parameters

| Parameter | Type | Description |
|---|---|---|
| `start_price` | `u128` | Maximum price per token (supply full, t = 0). Microcredits per `sale_scale` units. |
| `floor_price` | `u128` | Minimum price per token. Must be < `start_price`. |
| `supply` | `u128` | Total tokens available for sale. |
| `start_block` / `end_block` | `u32` | Auction window. |
| `min_bid_amount` | `u128` | Minimum payment per bid (microcredits). |
| `max_bid_amount` | `u128` | Maximum cumulative payment per bidder (0 = no cap). |
| `sale_scale` | `u128` | `10^sale_token_decimals` — fixed-point denominator. |
| `gate_mode` | `u8` | 0 = open, 1 = Merkle allowlist, 2 = credential. |
| `vest_enabled` | `bool` | Whether allocations vest over time. |

---

## Auction ID derivation

```
auction_id = BHP256(AuctionKey { creator, nonce, program_salt: 5field })
```

`PROGRAM_SALT = 5field` prevents cross-type ID collisions (Dutch=1, Ascending=2, Sealed=3, Raise=4).

---

## Comparison with Dutch

| Property | Dutch | LBP |
|---|---|---|
| Price direction | Linear decay (time only) | Joint decay (supply × time) |
| Demand feedback | None | High demand slows price drop |
| Payment model | Uniform clearing price | Pay-what-you-bid |
| Refund at claim | Yes — overpayment returned | No — payment is final |
| Oracle needed | No | No |
| Ideal use case | Fixed-schedule price discovery | Self-correcting community sale |
