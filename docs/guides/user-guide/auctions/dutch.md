# Dutch auction

**Price steps down over time until supply is met. All winners pay the same final price.**

---

## How it works

A Dutch auction starts at a high price and decreases in fixed steps at regular block
intervals. Bidders wait for a price they are comfortable with, then place their bid.

Once the total quantity bid meets the available supply, the auction can close. Every winning
bidder pays the **clearing price** — the lowest price at which supply was fully covered —
regardless of when they placed their bid.

```
Start price  ──┐
               │  (step down every N blocks)
               ▼
             ──┤
               ▼
             ──┤
               ▼  ← clearing price (where demand met supply)
             ──┤
               ▼
Floor price  ──┘  (auction stays here if never fully subscribed)
```

---

## Price mechanics

| Parameter | What it sets |
|---|---|
| **Start price** | Highest price bidders see at auction open |
| **Floor price** | Minimum price — auction holds here if supply is not met |
| **Decay amount** | How much the price drops per step (in ALEO) |
| **Decay blocks** | How many blocks between each price drop (~10 s per block) |

The clearing price is the Dutch price at the block when supply was met and the auction closed.

---

## Settlement

- All bids at or above the clearing price win.
- All winners pay the clearing price, not the price at which they individually bid.
- If you bid earlier at a higher price, you still pay the clearing price — the excess is
  refunded when you claim.
- Bids placed below the clearing price are not filled and the full payment is refunded.

---

## Early close

If total supply is filled before the end block, the creator (or anyone) can close the auction
early. This locks in the clearing price immediately.

---

## Who should use this type

- Creators who want transparent price discovery.
- Situations where fairness to all participants matters — no one pays more than the minimum
  price that cleared supply.

---

## Bidding

See [Bidding — Dutch](../bidding/dutch.md) for step-by-step instructions.
