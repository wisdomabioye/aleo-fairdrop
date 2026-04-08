# Step 8 — Review & submit

The final step shows a summary of every setting you have configured. Read it carefully
before submitting — auction parameters are immutable once on-chain.

---

## What is shown

- Auction type and token
- Full pricing configuration
- Start and end blocks with estimated wall-clock times
- Gate mode and vesting schedule (if enabled)
- Referral economics
- Metadata preview

---

## Submitting

Clicking **Submit** triggers a wallet transaction. Depending on your configuration, the
wizard may submit multiple sequential transactions:

1. **Create auction** — the main on-chain auction record.
2. **Authorize vest program** — only if vesting is enabled and authorization was not
   already performed in Step 5.

Each transaction must be confirmed in your wallet before the next one is sent. The wizard
tracks progress and shows status for each step.

---

## After submission

Once confirmed on-chain, your auction appears on the [Browse page](/auctions) and is
visible to bidders. The auction opens at the start block you configured.

You can manage your auction — monitor bids, close early, and view earnings — from
[My Auctions](/creator).

---

## Draft recovery

If you close the browser before submitting, your progress is saved as a draft in your
browser's local storage. When you return to **Create Auction**, you will be offered the
option to restore it.

> Token records (private token UTXOs) are session-only and cannot be saved in the draft.
> You must re-select them on Step 2 when restoring.
