# Step 3 — Pricing

Configure the price curve or raise target for your auction type. The fields differ by type.

---

## Dutch

| Field | Description |
|---|---|
| **Start price** | Highest price at auction open (ALEO per token) |
| **Floor price** | Minimum price — auction holds here if not fully filled |
| **Decay blocks** | Blocks between each price drop (~10 s per block) |
| **Decay amount** | ALEO amount the price drops per step |

The wizard shows a preview: total steps to floor, blocks to floor, and clearing price range.

---

## Sealed

Same price curve fields as Dutch, plus:

| Field | Description |
|---|---|
| **Commit end offset** | Blocks before auction end when the commit phase closes |

The clearing price is the Dutch price at `commit_end_block`. The wizard calculates and
displays it so you know the exact settlement price before launching.

> If the floor price is reached before `commit_end_block`, the wizard warns you to shorten
> the commit window or reduce the decay rate.

---

## Raise

| Field | Description |
|---|---|
| **Raise target** | Total ALEO you intend to raise |
| **Fill threshold** (optional) | Minimum % of raise target required to settle (basis points) |

If fill threshold is enabled and contributions fall short, all contributors are refunded.

---

## Ascending

| Field | Description |
|---|---|
| **Floor price** | Starting price at auction open |
| **Ceiling price** | Maximum price — auction holds here once reached |
| **Rise blocks** | Blocks between each price increase |
| **Rise amount** | ALEO amount the price rises per step |
| **Extension window** | Blocks before end that trigger anti-snipe extension |
| **Extension blocks** | Blocks added when an extension is triggered |
| **Max end block** | Hard cap on total auction end block (limits extensions) |

---

## LBP

| Field | Description |
|---|---|
| **Start price** | Price at auction open (highest) |
| **Floor price** | Minimum price — reached at or before auction end |

The weight-decay curve between start and floor is defined by the auction duration.

---

## Quadratic

Same fields as Raise:

| Field | Description |
|---|---|
| **Raise target** | Total ALEO you intend to raise |
| **Fill threshold** (optional) | Minimum % of raise target required to settle |

Distribution uses square-root weighting rather than linear pro-rata.
