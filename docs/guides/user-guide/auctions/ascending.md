# Ascending auction

**Price rises over time — early bidders pay less. Anti-sniping extension protects late buyers.**

---

## How it works

An Ascending auction opens at a floor price and increases in fixed steps at regular block
intervals. The earlier you bid, the lower the price you lock in. Each bidder pays the price
that was active at the moment they placed their bid.

```
Floor price  ──┐
               │  (step up every N blocks)
               ▼
             ──┤
               ▼
             ──┤
               ▼
Ceiling price ─┘  (auction holds at ceiling if end block not reached)
```

---

## Price mechanics

| Parameter | What it sets |
|---|---|
| **Floor price** | Starting price at auction open |
| **Ceiling price** | Maximum price — auction holds here if not yet closed |
| **Rise amount** | How much the price increases per step (in ALEO) |
| **Rise blocks** | How many blocks between each price rise |

---

## Anti-sniping extension

To prevent last-second bids from gaming a low price, a bid placed within the
**extension window** (blocks) of the scheduled end triggers an automatic extension of the
auction by a fixed number of blocks. A hard cap (`maxEndBlock`) limits total extensions.

| Parameter | What it sets |
|---|---|
| **Extension window** | Blocks before end that trigger an extension |
| **Extension blocks** | How many blocks are added per triggered extension |
| **Max end block** | Hard limit on how far the auction can extend |

---

## Settlement

- Each bidder pays the price at which they bid — not a uniform clearing price.
- No refund for the price difference (unlike Dutch/Sealed).
- If supply is exhausted before the end block, the creator can close early.

---

## Who should use this type

- Creators who want to reward early community members with a lower price.
- Launches where the anti-sniping mechanism helps ensure fair price steps.

---

## Bidding

See [Bidding — Ascending](../bidding/ascending.md) for step-by-step instructions.
