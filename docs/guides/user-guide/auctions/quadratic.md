# Quadratic auction

**Square-root weighting — smaller contributions carry more proportional weight.**

---

## How it works

A Quadratic auction distributes tokens proportional to the **square root** of each bidder's
contribution rather than the contribution amount itself. This compresses the advantage large
contributors have over small ones.

```
Alice contributes 10,000 ALEO  →  weight = √10,000 = 100
Bob contributes      100 ALEO  →  weight =   √100  =  10

Alice's share: 100 / (100 + 10) ≈ 91%  (not 99% as in a pro-rata raise)
Bob's share:    10 / (100 + 10) ≈  9%  (not  1%)
```

---

## Price mechanics

There is no price curve. The creator sets a **raise target** — the intended total ALEO to
raise. Distribution is determined at close by each bidder's sqrt weight relative to the total
sqrt weight of all bidders.

| Parameter | What it sets |
|---|---|
| **Raise target** | Total ALEO the creator intends to raise |
| **Fill threshold** | Minimum % of raise target required for the auction to settle |

---

## Fill threshold (optional)

Same as Raise: the creator can require a minimum percentage of the raise target to be met
before the auction settles. If not met, all contributions are refunded.

---

## Settlement

- Each bidder receives: `supply × sqrt(contribution) / total_sqrt_weight` tokens.
- The effective token price per bidder varies — larger contributors pay a higher effective
  price per token than smaller ones.
- No early close — Quadratic auctions run for the full duration.

---

## Important: Sybil splitting

Because allocation is by square root, splitting one large wallet into many smaller ones
_increases_ total weight: `N × sqrt(P/N) = sqrt(N) × sqrt(P)`. This means a single entity
splitting across N wallets gets `sqrt(N)` times more weight.

To prevent this, Quadratic auctions are best combined with **Credential gating** — one
verified credential per unique person. See [Gate & Vest](../creating/05-gate-vest.md).

---

## Who should use this type

- Creators who want to actively prevent whale dominance.
- Community rounds where equitable distribution matters more than dollar-weighted fairness.
- Projects using credential gating to enforce one-person-one-bid rules.

---

## Bidding

See [Bidding — Quadratic](../bidding/quadratic.md) for step-by-step instructions.
