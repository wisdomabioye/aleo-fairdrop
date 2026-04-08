# Step 2 — Token

Select the token you want to sell and set the total supply available for this auction.

---

## What you configure

**Sale token** — the token you are distributing. You must be the admin (or have supply
manager permission) for this token on `token_registry.aleo`. Paste the token ID or select
from tokens associated with your connected wallet.

**Supply** — the total number of tokens you are making available in this auction. This
amount will be locked when the auction is submitted.

---

## Token records

Some auction types require you to provide a private token record (a UTXO from your wallet)
rather than a public balance. The wizard will prompt you to select the correct record if
your token uses private balances.

> Token records are session-only. If you restore a draft, you must re-select the record
> on this step.

---

## After confirming

The wizard validates that you hold sufficient supply and that the token is registered.
Click **Next** to proceed to Pricing.
