# Sealed auction

**Bids are hidden during the auction. A commit-reveal mechanism settles a uniform clearing price.**

---

## How it works

A Sealed auction runs in two phases:

1. **Commit phase** — bidders submit a payment amount. The quantity they want is not visible
   on-chain during this phase. The auction accumulates the total committed payment without
   revealing individual bids.

2. **Reveal phase** — after `commit_end_block`, bidders reveal their bid details. The
   clearing price — the Dutch price at `commit_end_block` — is deterministic from the
   auction configuration, not from aggregate bid data.

```
Auction opens
   │
   ├── Commit phase ──────────────────────────────────── commit_end_block
   │   Bidders pay: quantity hidden on-chain
   │
   ├── Reveal phase ──────────────────────────────────── end_block
   │   Bidders reveal: clearing price locked at commit_end_block price
   │
   └── Slash window (unrevealed bids can be slashed by anyone)
```

---

## Price mechanics

The clearing price is the Dutch descending price at the moment the commit window closes
(`commit_end_block`). It is fully deterministic from the auction parameters — you can
calculate it before bidding.

| Parameter | What it sets |
|---|---|
| **Start price** | Price at auction open |
| **Floor price** | Minimum clearing price |
| **Decay amount** | Price drop per step |
| **Decay blocks** | Blocks between each price drop |
| **Commit end offset** | Blocks before end at which the commit phase closes |

---

## Per-bidder maximum

The creator can optionally set a per-bidder maximum allocation. If your commit amount would
buy more tokens than the maximum, you receive the maximum and the excess payment is refunded
at claim time.

---

## Settlement

- All bidders who revealed before the end block and committed enough to cover the clearing
  price win.
- All winners pay the same clearing price.
- Excess payment (commit amount above what the clearing price requires) is refunded at claim.

---

## Unrevealed bids and slashing

Bidders who committed but did not reveal by the end of the reveal phase have their committed
payment held on-chain. Anyone can **slash** an unrevealed commitment after the slash window
opens, earning a reward. The slashed payment is not returned to the bidder.

This mechanism ensures that commitments cannot be used to inflate the apparent demand without
intent to buy.

See [Slash an unrevealed bid](../earnings/slash.md) for how to earn from this.

---

## Who should use this type

- Creators who want maximum fairness — no bidder can see others' quantities and react.
- Launches where front-running and sniping are concerns.

---

## Bidding

See [Bidding — Sealed](../bidding/sealed.md) for step-by-step instructions including the
commit and reveal flow.
