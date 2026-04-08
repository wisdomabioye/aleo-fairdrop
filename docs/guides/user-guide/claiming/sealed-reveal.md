# Sealed — reveal then claim

Sealed auctions require an extra step between bidding and claiming: the **reveal**.

---

## Full flow

```
1. Commit bid (before commit_end_block)
       ↓
2. Wait for commit phase to close
       ↓
3. Reveal bid (before end_block)         ← critical — see warning below
       ↓
4. Wait for auction to close (end_block)
       ↓
5. Claim tokens (from Claim page)
```

---

## Step 3 — Reveal

After `commit_end_block`, the bid panel on the auction page switches to reveal mode.

1. Connect your wallet.
2. Select your **commitment record** from the dropdown.
3. Click **Reveal Bid** and confirm in your wallet.

> **If you miss the reveal window (before `end_block`), your locked payment is permanently
> forfeited. There is no grace period and no recovery path.**

For full reveal instructions see [Bidding — Sealed](../bidding/sealed.md#phase-2--reveal).

---

## Step 5 — Claim

After the auction closes:

1. Go to the **Claim** page.
2. Find the auction — it shows **Cleared**.
3. Click **Claim Tokens** (or **Claim (Vested)** if the auction has vesting enabled).
4. Confirm in your wallet.

Any excess payment (commit amount above what the clearing price required) is automatically
refunded as part of the claim transaction.
