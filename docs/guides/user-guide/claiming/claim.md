# Claiming tokens or a refund

---

## Step by step

1. Go to the **Claim** page (`/claim`) and connect your wallet.
2. The page loads your bid records from your wallet and lists auctions that are ready.
3. For each claimable auction, click the action button:

| Button label | What happens |
|---|---|
| **Claim Tokens** | Transfers your won tokens to your wallet. Settlement is final. |
| **Claim (Vested)** | Creates a vesting record in your wallet. Tokens release over time — see [Vesting](./vesting.md). |
| **Claim Refund** | Returns your payment in full (auction was voided or bid was not filled). |

4. Confirm the transaction in your wallet.
5. Once confirmed, the row updates to show **Claimed**.

---

## Vesting at claim time

If the auction creator enabled vesting, your claim transaction does not transfer tokens
directly to you. Instead it creates a **vest record** — a private record in your wallet
that holds the locked token allocation on the vesting schedule.

Tokens from the vest record release linearly after the cliff and are accessible from the
**Vesting** page. See [Vesting — releasing locked tokens](./vesting.md).

---

## Voided auctions

If an auction was voided (failed fill threshold, creator cancelled, or protocol intervention),
your payment is refunded in full. Sealed auction commit records are also refundable in this
case via **Claim Refund**.

---

## Reload

If your wallet has been updated since the page loaded, click **Reload** to refresh the list
of bid records.
