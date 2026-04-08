# Slash an unrevealed bid

In a **Sealed** auction, bidders must reveal their commitment before the auction's end
block. If a bidder commits but does not reveal in time, their locked payment can be
**slashed** by anyone after the slash window opens.

---

## Why this exists

Unrevealed commitments inflate apparent demand without the bidder intending to buy. The
slash mechanism removes this without requiring the creator to intervene, and rewards
participants who help clean up the auction state.

---

## What you earn

The slash reward is a percentage of the slashed payment amount. The exact percentage
(`slash_reward_bps`) is configured per Sealed auction by the creator. The remainder goes
to the protocol.

**Example:** commitment of 100 ALEO with 2000 bps (20%) slash reward → slasher earns 20 ALEO.

---

## How to slash

1. Go to **Earnings** (`/earnings`) → **Slash Bids** tab.
2. Connect your wallet. The tab loads commitment records from your wallet that are
   associated with Sealed auctions.

> The slash tab shows **commitment records your wallet holds**. These are commitments
> made by other bidders where the bidder's commitment record ended up in your wallet
> (typically via a transfer or through the slash mechanism itself — the exact flow
> depends on protocol implementation).

3. Each eligible row shows the commitment amount and the reward you would earn.
4. Click **Slash & Earn** and confirm the transaction.
5. The reward is transferred to your wallet when confirmed.

---

## Things to know

- Slashing is only available after the slash window opens (after `end_block`).
- A commitment that has already been revealed or slashed cannot be slashed again.
- The forfeited payment goes to the protocol, not to the slasher (only the reward percentage
  goes to the slasher).
- Bidders who do not reveal lose their entire committed payment. There is no recovery.
