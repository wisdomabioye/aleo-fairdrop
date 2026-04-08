# Bidding — Quadratic auction

---

## Step by step

1. Navigate to the auction detail page and connect your wallet.
2. Pass gate verification if required (Quadratic auctions are often credential-gated).
3. Select **Private** or **Public** bid mode.
4. Enter your **contribution amount in ALEO**.
5. The form shows your contribution and protocol fee.
6. For private bids: select a credit record.
7. Optionally enter a referral code.
8. Click **Contribute** and confirm in your wallet.

---

## Things to know

- Like a Raise auction, you contribute ALEO — you are not specifying a token quantity.
- Your allocation is proportional to the **square root** of your contribution relative to
  the total sqrt weight of all contributors.
- Larger contributions get proportionally fewer tokens per ALEO than smaller ones.
- Quadratic auctions do not support early close — they run for the full duration.
- If a fill threshold is set and not met, all contributions are refunded.

### Sybil warning

Splitting your contribution across multiple wallets **increases** your total weight:
`N wallets × sqrt(P/N) = sqrt(N) × sqrt(P)`. This is why Quadratic auctions are best
run with credential gating — one credential per verified person.

---

## After contributing

Your contribution appears in **My Bids**. Claim your tokens after the auction closes.

See [Claiming tokens](../claiming/claim.md).
