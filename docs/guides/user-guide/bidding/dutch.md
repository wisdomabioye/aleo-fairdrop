# Bidding — Dutch auction

---

## Step by step

1. Navigate to the auction detail page and connect your wallet.
2. Pass gate verification if required (see [How bidding works](./README.md)).
3. Select **Private** or **Public** bid mode.
4. Enter the **quantity** of tokens you want to buy.
5. The form shows:
   - Current price (updates in real time as blocks pass)
   - Total payment required at the current price
   - Protocol fee
   - Your selected credit record balance (private mode)
6. For private bids: select a credit record with enough balance to cover the total payment.
7. Optionally enter or confirm a referral code.
8. Click **Place Bid** and confirm in your wallet.

---

## Things to know

- You bid at the **current price**. If the price drops before your transaction is confirmed,
  you pay the price at the moment your transaction finalizes on-chain.
- All winners pay the **clearing price** — the price at which supply was fully met. If you
  bid at a higher price, the difference is refunded when you claim.
- If supply is met and the auction closes before your transaction confirms, your bid is
  rejected and no payment is taken.
- Min and max bid amounts are enforced. The form shows these limits next to the quantity field.

---

## After bidding

Your bid appears in **My Bids**. When the auction closes you can claim your tokens (and any
payment refund) from the **Claim** page.

See [Claiming tokens](../claiming/claim.md).
