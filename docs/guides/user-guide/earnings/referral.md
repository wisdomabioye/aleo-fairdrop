# Referral commissions

Any Fairdrop user can generate referral links and earn a commission when referred bidders
participate in an auction.

---

## How referrals work

1. You generate a **referral code** (a private record in your wallet) linked to an auction.
2. You share the referral link: `fairdrop.xyz/auctions/<id>?ref=<code>`.
3. When a bidder uses your link and places a bid, the referral is recorded on-chain.
4. After the auction closes, you credit and then claim your commission.

The referral link is generated from the auction detail page. Look for the **Referral** tab
or share button.

---

## Commission amount

The commission is a percentage of the protocol fee for each bid placed through your link:

```
Protocol fee (% of bid payment)
      │
      └── Referral pool (% of protocol fee)
               │
               └── Your commission (up to max referral %)
```

The exact percentages are set by the protocol and shown on the Referral step when creators
configure their auctions.

---

## Collecting your commissions

Claiming commissions is a two-step process:

### Step 1 — Credit

1. Go to **Earnings** (`/earnings`) → **Referral Commissions** tab (or **Referral** page).
2. Connect your wallet. The page loads your referral code records.
3. For each auction with uncredited referrals, click **Credit Commission**.
4. Confirm the transaction. This marks the referred bids as credited.

### Step 2 — Claim

1. After crediting, click **Claim Commission**.
2. Confirm the transaction. Your earned ALEO is transferred to your wallet.

---

## Things to know

- Referral codes are **private records** in your wallet. They are not visible on-chain.
- The referrer address is never linked to the referred bidder on-chain — the referral
  relationship is private.
- You can generate multiple referral codes for different auctions.
- Commissions accumulate per referral code and are claimed in one transaction per code.
