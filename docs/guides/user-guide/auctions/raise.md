# Raise auction

**A fixed-price community round. Everyone contributes ALEO and receives tokens pro-rata.**

---

## How it works

A Raise auction sets a target amount of ALEO to raise and a fixed token supply to distribute.
Bidders contribute any amount of ALEO credits during the auction window. At close, each
bidder receives tokens proportional to their share of the total contributions.

```
Total supply: 1,000,000 tokens
Total raised: 50,000 ALEO

Alice contributed 5,000 ALEO  →  5,000 / 50,000 = 10%  →  100,000 tokens
Bob contributed   2,500 ALEO  →  2,500 / 50,000 =  5%  →   50,000 tokens
```

---

## Price mechanics

There is no price curve. The effective token price is determined after close:

```
effective_price = raise_target × scale / supply
```

The creator sets a **raise target** — the intended total ALEO to raise. If contributions
exceed the target, the effective price per token increases proportionally to the actual total
raised.

---

## Fill threshold (optional)

The creator can set a **minimum fill threshold** (`fill_min_bps`, in basis points). If total
contributions do not reach this percentage of the raise target by the end block, the auction
is considered unsuccessful and all contributions are refunded.

Example: a 5000 bps threshold means at least 50% of the raise target must be raised for the
auction to settle.

---

## Settlement

- Tokens are distributed pro-rata: `your_contribution / total_contributions × supply`.
- If the raise target is exceeded, all bidders receive proportionally fewer tokens (the price
  per token rises with total raised).
- Bidders whose contribution results in zero tokens (due to rounding) receive a full refund.

---

## Early close

The creator can close early once contributions meet the raise target.

---

## Who should use this type

- Creators running a community round at a known price range.
- Launches where equal access is more important than price discovery.

---

## Bidding

See [Bidding — Raise](../bidding/raise.md) for step-by-step instructions.
