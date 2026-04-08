# LBP auction

**Liquidity Bootstrapping Pool — weight-decay price discovery that resists bot front-running.**

---

## How it works

An LBP auction starts at a high price and decreases continuously over the auction duration.
Unlike a Dutch auction where the price drops in discrete steps at set intervals, the LBP
price curve is designed around decaying token/collateral weights.

The key property: **buying early always means paying a higher price**. Bots that front-run
at open pay the highest possible price and drive the price back down for organic buyers who
wait.

```
High start price ──┐
                   │  (continuous decline over auction duration)
                   ▼
                   │
                   ▼
Low floor price ───┘
```

---

## Price mechanics

| Parameter | What it sets |
|---|---|
| **Start price** | Price at auction open (highest) |
| **Floor price** | Minimum price (reached at or before end block) |

The price curve between start and floor is defined by the weight-decay schedule baked into
the auction duration. The current price at any moment is shown on the auction page.

---

## Settlement

- Each bidder pays the price at the time they bid (pay-your-bid, not uniform clearing).
- No early close — the LBP runs for its full configured duration.
- At close, won tokens are claimable and any overpayment is not applicable (you paid exactly
  the price at bid time).

---

## Bot resistance

Because the price is always highest at open and only decreases over time, a bot buying at
the start immediately makes the price worse for itself if it tries to sell or re-buy. Organic
buyers who wait get a progressively better price. This creates a natural equilibrium without
requiring whitelists or limits.

---

## Who should use this type

- Creators who want a long-running, publicly visible price discovery process.
- Launches where bot front-running has been a problem on other platforms.
- Projects that want price to be set by patient, organic demand rather than speed.

---

## Bidding

See [Bidding — LBP](../bidding/lbp.md) for step-by-step instructions.
