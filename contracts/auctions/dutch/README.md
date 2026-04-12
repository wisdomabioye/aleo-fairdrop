# fairdrop_dutch_v4.aleo

Descending-price Dutch auction with **uniform clearing price**. Price decays linearly from `start_price` to `floor_price` over `price_decay_blocks`. All winning bids pay the same clearing price regardless of when they bid.

## Mechanism

1. Creator deposits exact token supply via `burn_private` → `create_auction`.
2. Bidders lock credits privately (`place_bid_private`) or publicly (`place_bid_public`). Payment is held in escrow; no UTXO remainder is returned (avoids on-chain UTXO dust and prevents UTXO-size leakage).
3. Anyone calls `close_auction` after `end_block` and receives `closer_reward`.
4. Bidders call `claim` to receive tokens at the clearing price; excess payment is refunded. If `vest_enabled`, use `claim_vested` + `fairdrop_vest_v3.aleo/release`.

## Key transitions

| Transition | Who calls it |
|---|---|
| `create_auction` | Creator |
| `place_bid_private` / `place_bid_public` | Bidder |
| `place_bid_private_ref` / `place_bid_public_ref` | Bidder with referral code |
| `close_auction` | Anyone (permissionless) |
| `push_referral_budget` | Anyone (after close) |
| `claim` / `claim_vested` | Bidder |
| `withdraw_payments` / `withdraw_unsold` | Creator |
| `cancel_auction` | Creator (before any bids) |
| `claim_voided` | Bidder (voided auction) |

## Design notes

- `assert_eq(token.amount, supply)` enforces exact supply deposit — zero-remainder dust is deterministic and wallets filter it.
- `payment_token_id` is hardcoded to `CREDITS_RESERVED_TOKEN_ID` — credits are the only payment token for privacy reasons.
- The 16-param limit is worked around by grouping `DutchParams`, `GateParams`, `VestParams`, and `ConfigSnapshot` as structs.
