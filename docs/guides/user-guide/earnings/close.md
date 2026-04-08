# Close an auction — closer reward

When an auction reaches its end block (or has been fully filled and is eligible for early
close), it enters **Ended** or **Clearing** status. Anyone can send the close transaction —
and the wallet that does earns the **closer reward**.

---

## Why this exists

Closing an auction requires a transaction, which has a network fee. The protocol compensates
the closer with a fixed ALEO reward to incentivize timely settlement.

---

## How to close an auction

1. Go to **Earnings** (`/earnings`) → **Close Auctions** tab.
2. The tab lists all auctions in `Ended` or `Clearing` status, ordered by end block.
3. Each row shows the auction name, type, and the closer reward amount.
4. Click **Close** on any row and confirm the transaction in your wallet.
5. The reward is transferred to your wallet when the transaction is confirmed.

---

## Things to know

- You can close any auction — you do not need to have participated in it.
- Each auction can only be closed once.
- The closer reward amount is set by the protocol and is the same for all auctions.
- Clearing the auction is a prerequisite for bidders to claim their tokens — closing
  promptly helps other participants.
- **Sealed auctions** have additional close preconditions: the reveal window must have
  ended and the slash window must have passed before the auction can be closed.
