# Step 1 — Choose a type

Select the auction format that fits your launch goal. Each type has a different price
mechanism and settlement rule.

---

## Options

| Type | One-line description |
|---|---|
| **Dutch** | Price steps down — uniform clearing price |
| **Sealed** | Bids hidden on-chain until a reveal window |
| **Raise** | Fixed-price round — pro-rata by contribution |
| **Ascending** | Price rises over time — early bidders pay less |
| **LBP** | Weight-decay — bots can't front-run |
| **Quadratic** | Square-root weighting — smaller voices count more |

---

## How to decide

- **Want price discovery?** → Dutch or LBP
- **Want maximum bid privacy?** → Sealed
- **Running a community round at a known price?** → Raise
- **Rewarding early supporters?** → Ascending
- **Preventing whale dominance?** → Quadratic (best paired with credential gate)

See the [auction types overview](../auctions/README.md) for full detail on each format.

---

## After selecting

Click **Next** to proceed to the Token step. You can change the type by going back — but
note that pricing configuration is type-specific and will reset if you change types.
