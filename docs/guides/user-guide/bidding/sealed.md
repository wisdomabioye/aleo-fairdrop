# Bidding — Sealed auction

A Sealed auction has two phases. You interact with the bid panel differently in each.

---

## Phase 1 — Commit (before `commit_end_block`)

### What committing does

You lock a **payment amount** (ALEO credits) on-chain. Your bid quantity is not visible
on-chain during this phase — the ZK proof ensures the contract validates your quantity
without revealing it publicly.

A random **nonce** is generated automatically and embedded in your commitment record.
You will need the nonce to reveal later — it is stored in the commitment record in your
wallet.

### Step by step

1. Connect your wallet and pass gate verification if required.
2. Select **Private** or **Public** bid mode.
3. Enter the **quantity** of tokens you want.
4. The form auto-calculates the recommended payment amount based on the estimated clearing
   price. You can also set the payment manually.
5. For private bids: select a credit record with enough balance.
6. Optionally enter a referral code.
7. Click **Commit Bid** and confirm in your wallet.

### Payment amount and collateral

The minimum collateral is: `min_bid_amount × floor_price / sale_scale`.
You must commit at least this amount. If you commit more than needed, the excess is refunded
when you reveal and claim.

The clearing price is fixed at the Dutch price at `commit_end_block` — it is deterministic
and shown in the form before you commit.

---

## Phase 2 — Reveal (after `commit_end_block`, before `end_block`)

### What revealing does

You publish your bid quantity and nonce, proving they match your original commitment.
This registers your bid at the clearing price.

### Step by step

1. After `commit_end_block`, the bid panel switches to reveal mode automatically.
2. Connect your wallet.
3. Select your **commitment record** from the dropdown. The form loads it from your wallet.
   Quantity and nonce are read directly from the record — you do not need to enter them.
4. Click **Reveal Bid** and confirm in your wallet.

### Critical warning

> **Failure to reveal before `end_block` results in complete and permanent forfeiture of
> your locked payment. There is no recovery path. Unrevealed commitments cannot be
> refunded and can be slashed by anyone after the slash window opens.**

Plan ahead: ensure you will be available to reveal before the auction ends.

---

## After revealing

Your bid is settled at the clearing price. Go to the **Claim** page to claim your tokens
and any excess payment refund.

See [Sealed — reveal then claim](../claiming/sealed-reveal.md).
