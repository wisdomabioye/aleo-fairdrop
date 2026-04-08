# Step 4 — Timing

Set the block schedule for your auction. All times are in Aleo block numbers.
Each block is approximately 10 seconds.

---

## Fields

| Field | Description |
|---|---|
| **Start block** | Block at which bidding opens |
| **End block** | Block at which the auction closes (unless closed early) |
| **Min bid amount** | Minimum bid size per transaction (required) |
| **Max bid amount** | Per-bidder maximum allocation — set to 0 for no cap |

---

## Block timing tips

- The wizard shows the current block height and an estimated wall-clock time for each
  block you enter.
- A shortcut button sets the start block to current + 100 (~17 minutes from now).
- The minimum auction duration is enforced by the protocol. If you set a duration below
  the minimum, the wizard will display an error.

---

## Sealed auction — commit window

For Sealed auctions, the commit end offset (set in the Pricing step) is subtracted from
the end block to calculate `commit_end_block`. The wizard displays both phases:

```
Commit phase:  start_block → commit_end_block
Reveal phase:  commit_end_block → end_block
```

Make sure the reveal window (end − commit_end) gives bidders enough time to reveal.

---

## Min and max bid

- **Min bid**: the smallest amount a single bid transaction can specify. Prevents spam bids.
- **Max bid**: the most any one bidder can win. Set to 0 to impose no cap.
  - For Sealed auctions, the max bid is the maximum token allocation per bidder — excess
    committed payment is refunded at claim.
  - For contribution-type auctions (Raise, Quadratic), max bid is the maximum contribution
    in ALEO.
