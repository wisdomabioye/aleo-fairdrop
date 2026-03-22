# fairdrop_sealed.aleo

Privacy-preserving sealed-bid commit-reveal auction with uniform Dutch clearing price.

Bidders commit to a quantity hash before the reveal window opens, hiding their intended allocation from all other participants. All revealed winners pay the same clearing price, computed deterministically from the Dutch price formula at `commit_end_block`.

## Status

Implementation complete (`src/main.leo`). Deployment and integration testing pending.

---

## Mechanism overview

### Three phases

```
start_block          commit_end_block         end_block
    |                      |                      |
    |── COMMIT WINDOW ────>|── REVEAL WINDOW ────>|── SLASH + CLOSE
```

**COMMIT** `[start_block → commit_end_block)`
- Bidder calls `commit_bid_private` or `commit_bid_public`
- Payment locked as collateral in escrow
- Only `BHP256(quantity, nonce, bidder)` stored on-chain — quantity is completely hidden
- One commit per bidder enforced via `bid_committed` mapping
- `Commitment` record issued to bidder (UTXO, consumed at reveal)
- `ParticipationReceipt` issued (proof of participation)

**REVEAL** `[commit_end_block → end_block)`
- Bidder calls `reveal_bid`, consuming the `Commitment` record
- Provides `(quantity, nonce)` privately — contract recomputes hash and verifies
- `max_bid_amount` cap applied at this point (not at commit)
- Collateral check: `payment_amount * sale_scale >= capped_quantity * clearing_price`
- `Bid` record issued (uniform clearing price applies at claim)
- `total_committed` updated on-chain

**SLASH + CLOSE** `[end_block →)`
- Any unrevealed commitment may be slashed by anyone (`slash_unrevealed`)
- Creator or anyone calls `close_auction` to finalise

### Clearing price

Fixed at `commit_end_block` using the Dutch price formula:

```
blocks_elapsed = commit_end_block - start_block
steps          = blocks_elapsed / price_decay_blocks
decay          = steps * price_decay_amount
clearing_price = max(start_price - decay, floor_price)
```

Price is deterministic and known before the reveal window opens. Bidders can verify their collateral is sufficient before revealing. Reveal order cannot influence the price.

### At claim

Same as Dutch: `cost = quantity * clearing_price / sale_scale`. Overpayment refunded privately. All winners pay the same clearing price regardless of when they committed.

---

## Slashing — complete reference

### What slashing is

After `end_block`, any bidder who committed but did not reveal has their collateral **permanently forfeited** via `slash_unrevealed`. This is the anti-griefing mechanism (S5).

### Why slashing is irreversible by design

Without a punitive slash, a griefing attack is costless:

1. Attacker commits with a large `payment_amount`, locking supply allocation
2. Never reveals → their quota sits on-chain blocking other bidders
3. Claims full refund via `claim_commit_voided` after cancellation

The slashing penalty makes this economically irrational — the attacker loses 100% of their collateral.

### What happens when a commitment is slashed

```
slash_unrevealed(commitment_key, auction_id, payment_amount, slash_reward_bps)
```

- `pending_commits[bidder_key].slashed = true`
- `escrow_payments[auction_id] -= payment_amount`
- Caller receives: `payment_amount * slash_reward_bps / 10000`
- Protocol treasury receives: remainder

The bidder's `Commitment` UTXO record remains in their wallet, but it is permanently worthless — every transition that consumes it will fail in finalize.

### Can a slashed bidder recover?

**No.** Every recovery path is explicitly blocked:

| Recovery attempt | Why it fails |
|---|---|
| `claim_commit_voided` | `finalize` asserts `!commit.slashed` |
| `reveal_bid` | `finalize` asserts `!commit.revealed && !commit.slashed` |
| `claim_voided` | Requires a `Bid` record — never issued without a successful reveal |

The `Commitment` UTXO is a dead record. It is cryptographically valid but no transition will accept it.

### Slashing vs. voided auction

If the **creator cancels** the auction (`cancel_auction`) before `end_block`:
- `state.voided = true`
- `finalize_slash_unrevealed` asserts `!state.voided` → **slashing is blocked**
- Bidders with `Commitment` records call `claim_commit_voided` and receive a full refund

Cancellation before `end_block` is the only scenario where unrevealed bidders are made whole.

### Who runs the slasher?

Slashing is permissionless — anyone can call `slash_unrevealed`. In practice, Fairdrop runs an off-chain slasher bot (S5) that:

1. Watches `commit_bid_*` finalize events and records all `bidder_key` values
2. After `end_block`, checks `pending_commits[bidder_key].revealed` for each
3. Calls `slash_unrevealed` for any unrevealed commitment

The 20% slash reward compensates external callers who run their own slasher.

---

## Collateral rules

At **commit time**, the minimum collateral check is:
```
payment_amount * sale_scale >= min_bid_amount * floor_price
```
This ensures the commitment covers at least the smallest valid bid at the cheapest possible price.

At **reveal time**, the effective collateral check is:
```
payment_amount * sale_scale >= capped_quantity * clearing_price
```
Where `clearing_price` is recomputed from the deterministic formula. A bidder whose revealed quantity exceeds their collateral at clearing price will have their reveal rejected — and face slashing.

### Practical advice for bidders

- Store `(quantity, nonce)` locally; losing them means losing collateral to a slasher
- The frontend should auto-submit `reveal_bid` at `commit_end_block`
- Deposit enough collateral to cover `quantity * clearing_price / sale_scale`
- If a `Commitment` record shows as past the reveal window, treat it as slashed

---

## Transition reference

| Transition | Window | Who |
|---|---|---|
| `commit_bid_private` | commit | bidder (private credits) |
| `commit_bid_public` | commit | bidder (public credits) |
| `commit_bid_private_ref` | commit | bidder (private credits + referral) |
| `commit_bid_public_ref` | commit | commit (public credits + referral) |
| `reveal_bid` | reveal | bidder |
| `slash_unrevealed` | after end_block | anyone |
| `close_auction` | after end_block | anyone |
| `push_referral_budget` | after close | anyone |
| `claim` | after close | bidder |
| `claim_vested` | after close | bidder |
| `withdraw_payments` | after close | creator |
| `withdraw_unsold` | after close | creator |
| `cancel_auction` | any (pre-clear) | creator |
| `claim_voided` | after cancel | bidder (revealed Bid record) |
| `claim_commit_voided` | after cancel | bidder (unrevealed Commitment record) |

---

## Privacy model

| Data | Visibility |
|---|---|
| Committed quantity | Hidden (only hash on-chain) |
| Payment amount | Public (on-chain escrow) |
| Bidder identity | Pseudonymous — `BHP256(bidder, auction_id)` only |
| Revealed quantity | Public after reveal |
| Token recipients | Private (`mint_private`, `transfer_public_to_private`) |
| Vest owner | Private |
| Cleared allocation | Private (Bid record UTXO) |

---

## Auction ID derivation

```
auction_id = BHP256(AuctionKey { creator, nonce, program_salt: 3field })
```

`PROGRAM_SALT = 3field` prevents cross-type ID collisions (Dutch = 1field, Ascending = 2field).
