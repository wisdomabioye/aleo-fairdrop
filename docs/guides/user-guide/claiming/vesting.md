# Vesting — releasing locked tokens

If the auction creator enabled vesting, your tokens are not transferred immediately at
claim. Instead, you hold a **vest record** that releases tokens linearly over a defined
block range.

---

## How vesting works

| Parameter | Meaning |
|---|---|
| **Cliff** | No tokens are available before this block offset (relative to auction end) |
| **Vest end** | 100% of your allocation is available by this block offset |

Between the cliff and the vest end, tokens unlock linearly. You can release any available
amount at any time — you do not need to wait for full vesting.

**Example:** cliff = 1,000 blocks, vest end = 10,000 blocks after auction end.
- At block offset 0–999: no tokens available.
- At block offset 1,000: a small fraction is available.
- At block offset 5,500 (~midpoint): ~50% available.
- At block offset 10,000+: 100% available.

---

## Releasing vested tokens

1. Go to the **Vesting** page (`/vesting`) and connect your wallet.
2. The page loads your vest records from your wallet.
3. Each card shows:
   - Total allocation
   - Already released percentage
   - Currently releasable amount (tokens you can claim right now)
4. Click **Release** on the card and confirm in your wallet.
5. The releasable tokens are transferred to your wallet. Your vest record is updated.

You can release partial amounts — you do not need to wait until fully vested before
releasing what is currently available.

---

## No vest records showing?

Vest records are private UTXO records stored in your wallet. If the page shows no positions:
- Make sure your wallet is connected and synced.
- Click **Reload** to refresh.
- Check that you have already claimed from a vesting-enabled auction on the Claim page.
  Vest records are created at claim time, not at bid time.
