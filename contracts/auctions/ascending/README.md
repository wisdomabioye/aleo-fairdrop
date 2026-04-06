# fairdrop_ascending_v2.aleo

Privacy-preserving ascending-price auction (pay-what-you-bid).

Price rises from `floor_price` toward `ceiling_price` in discrete steps over the auction window. Early bidders pay less than late bidders. There is no uniform clearing price — each bidder pays the price that was current at the moment they bid.

This is the directional inverse of `fairdrop_dutch_v2.aleo`.

## Status

Implementation complete (`src/main.leo`). Deployment and integration testing pending.

---

## Mechanism overview

### Price model

```
blocks_elapsed = block.height - start_block
steps          = blocks_elapsed / price_rise_blocks
rise           = steps * price_rise_amount
current_price  = min(floor_price + rise, ceiling_price)
```

Price increases in discrete steps — it stays flat within each `price_rise_blocks` interval, then jumps. A bidder who transacts at block B locks in the price for that block, regardless of how the price moves afterward.

### Bidding

Bidders call `place_bid_private` (private credits UTXO) or `place_bid_public` (public credits balance). Both variants are available with and without referral attribution.

The finalize block checks:
```
payment_amount * sale_scale >= quantity * current_price
```

Bidders may place multiple bids and accumulate quantity up to `max_bid_amount` (0 = no cap).

### Settlement

There is **no clearing price** and **no refund at claim**. Each bidder mints exactly the quantity they bid for. Whatever they paid at bid time is their final cost.

At `close_auction`:
- `creator_revenue = total_payments - protocol_fee`
- `protocol_fee    = total_payments * fee_bps / 10000`

The entire `total_payments` balance is accounted for — no clearing-price delta to return.

### Why no refund

In Dutch auctions, all bidders commit at various prices but the final clearing price is lower — the difference is refunded. That model only works because a single clearing price applies to everyone retroactively.

In ascending auctions, early bidders paid less and late bidders paid more. There is no single price that is "fair" to retroactively apply. Refunding late bidders would undercharge them; charging early bidders more would be retroactive price manipulation. Pay-what-you-bid is the only coherent model for an ascending auction.

The tradeoff: bidders cannot reclaim overpayment from integer rounding (at most 1 microunit). The frontend should compute `quantity * current_price / sale_scale` and send exactly that.

---

## Comparison with Dutch

| Property | Dutch (fairdrop_dutch_v2.aleo) | Ascending (fairdrop_ascending_v2.aleo) |
|---|---|---|
| Price direction | Descends start → floor | Rises floor → ceiling |
| Payment model | Uniform clearing price | Pay-what-you-bid |
| Refund at claim | Yes — overpayment returned | No — payment is final |
| Early bidder incentive | Wait for lower price | Commit early for lower price |
| Late bidder behaviour | Best price at the end | Pays most |
| Supply fills | First come, first served at clearing | First come, cheapest price |
| Creator revenue base | `total_committed * clearing_price` | `total_payments` |
| Ideal use case | Price discovery, fair allocation | Rewarding early community supporters |

---

## Revenue accounting

Set at `close_auction`:

```
total_cost      = state.total_payments  (no clearing price adjustment)
protocol_fee    = total_cost * fee_bps / 10000
creator_revenue = total_cost - protocol_fee
referral_budget = protocol_fee * referral_pool_bps / 10000
treasury_credit = protocol_fee - referral_budget - closer_reward
```

**Escrow invariant:** `escrow_payments = creator_revenue + protocol_fee` after close (no claim refunds reduce it). Creator withdraws up to `creator_revenue`; protocol fee remainder stays in escrow.

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
| `push_referral_budget` | after close | anyone |
| `claim` | after close | bidder |
| `claim_vested` | after close | bidder (vest_enabled auctions) |
| `withdraw_payments` | after close | creator |
| `withdraw_unsold` | after close | creator |
| `cancel_auction` | any (pre-clear) | creator |
| `claim_voided` | after cancel | bidder |

---

## Privacy model

| Data | Visibility |
|---|---|
| Bid payment amount | Public (on-chain escrow) |
| Bid quantity | Public (payment approximates quantity at known price) |
| Bidder identity | Pseudonymous — `BHP256(bidder, auction_id)` only |
| Token recipients | Private (`mint_private`) |
| Vest owner | Private |

Ascending auctions have weaker quantity privacy than Dutch. Because the price at each block is public, `quantity ≈ payment_amount * sale_scale / current_price` is inferable. This is an inherent property of the pay-what-you-bid model, not an implementation gap.

---

## Auction ID derivation

```
auction_id = BHP256(AuctionKey { creator, nonce, program_salt: 2field })
```

`PROGRAM_SALT = 2field` prevents cross-type ID collisions (Dutch = 1field, Sealed = 3field).

---

## Anti-sniping extension

When `extension_window > 0`, any bid that lands within the final `extension_window` blocks of
the current deadline extends it:

```
window_start    = effective_end_block - extension_window
in_window       = extension_window > 0 && block.height >= window_start
new_eff_end     = in_window ? min(effective_end_block + extension_blocks, max_end_block)
                            : effective_end_block
```

`effective_end_block` is mutable state (in `AuctionState`) and is the authoritative deadline
for all bid guards and `close_auction`. `config.end_block` is the original immutable deadline.

Setting `extension_window = 0` disables the feature entirely — the auction behaves identically
to the original design and `effective_end_block` stays equal to `end_block`.

**Supply-met interaction**: if the bid that fills supply also lands in the extension window, the
extension does **not** fire. Once `supply_met = true`, `close_auction` uses `ended_at_block`
(the block when supply was met) rather than `effective_end_block`, so extending the deadline on
a fully-filled auction would be meaningless. The guard `&& !is_supply_met` enforces this.

### Constraints validated at `create_auction`

- `extension_window > 0 → extension_blocks > 0` (a zero-block extension is a no-op).
- `extension_window > 0 → max_end_block >= end_block` (cap must be at or beyond the original end).

### Underflow guard

`window_start` could underflow if `effective_end_block < extension_window`. The contract uses:
```
window_start = effective_end_block > extension_window
    ? effective_end_block - extension_window : 0u32;
```

---

## Parameters

| Parameter | Description |
|---|---|
| `floor_price` | Starting price (microcredits per `sale_scale` units) |
| `ceiling_price` | Maximum price cap |
| `price_rise_blocks` | Blocks per price step |
| `price_rise_amount` | Microcredits increase per step |
| `extension_window` | Blocks before deadline that trigger an extension. `0` = disabled. |
| `extension_blocks` | Blocks added to `effective_end_block` per qualifying bid. |
| `max_end_block` | Hard cap on `effective_end_block`. Must be `>= end_block` when enabled. |
| `supply` | Total token units available |
| `start_block` / `end_block` | Auction window (`end_block` is the original, immutable deadline) |
| `min_bid_amount` | Minimum quantity per bid |
| `max_bid_amount` | Maximum cumulative quantity per bidder (0 = no cap) |
| `sale_scale` | `10^sale_token_decimals` — fixed-point denominator |
| `gate_mode` | 0 = open, 1 = merkle allowlist, 2 = credential |
| `vest_enabled` | Whether allocations vest over time |
