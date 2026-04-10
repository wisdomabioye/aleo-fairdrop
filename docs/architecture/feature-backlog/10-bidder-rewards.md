# Plan: Bidder Rewards (`fairdrop_rewards_v1.aleo`)

## Summary

A new contract that rewards bidders privately for participation. Bidders present their
`ParticipationReceipt` records (private) as proof. The contract verifies participation
on-chain without revealing the bidder's address or which auction they came from. Rewards
are issued as private records — credits, tokens, or a dedicated reward token.

Two funding models:
- **Creator pool** — creator funds a reward pool for their own auction at create time.
  Any bidder who participated can claim after close.
- **Protocol pool** — Fairdrop funds a rolling pool from protocol fees. Any bidder can
  claim once per valid receipt from any registered auction.

Both models are independent. A single auction can have both active simultaneously.

---

## Privacy model

`ParticipationReceipt` is passed as a **private record input** to the claim transition.
The `auction_id` inside the receipt never appears on-chain. The contract computes
`bidder_key = BHP256(self.signer, receipt.auction_id)` entirely in the proof context
and passes only the hash to `final {}` for verification against the `participated`
mapping in `fairdrop_proof_v3.aleo`.

What is visible on-chain per claim:
- A `bidder_key` hash (already public in `participated` from the original bid)
- A pool mapping decrement
- A reward record (encrypted to the bidder — contents private)

Raw bidder address: never revealed.
Which auction the receipt is from: never revealed.

**Opt-in linkability note**: presenting multiple receipts in one transaction allows an
observer to link those `bidder_key` hashes to the same signer. Bidders choose whether
the reward is worth this. Single-receipt claims have no linkability beyond what the
original bid already revealed.

---

## New contract: `fairdrop_rewards_v1.aleo`

### Records

```leo
// Issued to bidder on successful claim. Private to owner.
record RewardVoucher {
    owner:   address,
    pool_id: field,
    amount:  u128,
}
```

For credits rewards, `credits.aleo::transfer_private` is used instead of a voucher.
For token rewards, `token_registry.aleo::mint_private` is used.
`RewardVoucher` is used when the pool holds a dedicated reward token balance.

---

### Structs

```leo
struct PoolConfig {
    funder:           address,   // creator or protocol address
    auction_id:       field,     // specific auction; 0field = any registered auction
    reward_per_claim: u128,      // amount issued per valid receipt
    reward_type:      u8,        // 0 = credits, 1 = token
    reward_token_id:  field,     // used when reward_type == 1; ignored otherwise
    expires_at_block: u32,       // 0 = no expiry
}
```

---

### Mappings

```leo
// Pool configurations. pool_id = BHP256(funder, auction_id, nonce).
mapping pool_configs: field => PoolConfig;

// Remaining budget per pool (in reward units).
mapping pool_budget: field => u128;

// Claimed flag. Key = BHP256(pool_id, bidder_key) — prevents double-claim.
mapping claimed: field => bool;

// Registered auction program addresses (set by protocol governance).
// Required for protocol pools to validate any-auction receipt claims.
mapping registered_auctions: address => bool;

// Consumed op hashes for governance.
mapping consumed_ops: field => bool;
```

---

### Transitions

#### `create_pool` — creator or protocol

```leo
fn create_pool(
    public pool_id:    field,
    public config:     PoolConfig,
    public budget:     u128,
) -> Final
```

Creator deposits budget (credits or tokens) at pool creation.
Protocol calls this when funding from fee reserves.
`final {}` validates config (budget > 0, reward_per_claim > 0, funder == self.signer).

---

#### `claim` — bidder, single receipt

```leo
fn claim(
    public pool_id:  field,
    receipt: fairdrop_proof_v3.aleo::ParticipationReceipt,
) -> (RewardVoucher, Final)
```

Core claim transition. Both `self.signer` and `receipt.auction_id` remain private.

Proof context:
```leo
let bidder_key: field = BHP256::hash_to_field(BidderKey {
    bidder:     self.signer,
    auction_id: receipt.auction_id,
});
let claim_key: field = BHP256::hash_to_field(ClaimKey {
    pool_id:    pool_id,
    bidder_key: bidder_key,
});
```

`final {}` validates:
- Pool exists and has budget
- Not expired (`config.expires_at_block == 0 || block.height <= config.expires_at_block`)
- `fairdrop_proof_v3.aleo::participated[bidder_key] == true`
- If `config.auction_id != 0field`: verifies receipt is from that specific auction
  (private comparison — `receipt.auction_id == config.auction_id` checked in proof context,
  result passed as bool to `final {}`)
- If `config.auction_id == 0field` (protocol pool): verifies calling program is registered
- `claimed[claim_key] == false` — no double-claim
- Decrements `pool_budget`
- Sets `claimed[claim_key] = true`
- Issues reward (credits transfer or token mint or voucher)

---

#### `claim_tiered` — bidder, up to 3 receipts

```leo
fn claim_tiered(
    public pool_id: field,
    r0: fairdrop_proof_v3.aleo::ParticipationReceipt,
    r1: fairdrop_proof_v3.aleo::ParticipationReceipt,
    r2: fairdrop_proof_v3.aleo::ParticipationReceipt,
) -> (RewardVoucher, Final)
```

Computes 3 `bidder_key` hashes and 3 `claim_key` hashes in proof context.
`final {}` counts how many are valid (participated + unclaimed) and scales reward:
- 1 valid → `reward_per_claim * 1`
- 2 valid → `reward_per_claim * 2` (or a multiplier, creator-configured)
- 3 valid → `reward_per_claim * 3`

All three receipts must have distinct `auction_id`s (enforced by distinct `bidder_key` hashes
mapping to distinct `claimed` entries). Double-presenting the same receipt is blocked by
`claimed[claim_key]`.

**Trade-off**: bidder links 3 `bidder_key` hashes to the same signer. Opt-in — they choose
whether the higher reward justifies the linkage.

---

#### `top_up_pool` — funder only

```leo
fn top_up_pool(public pool_id: field, public amount: u128) -> Final
```

Adds budget to an existing pool. Validates `self.signer == config.funder`.

---

#### `close_pool` — funder only, after expiry

```leo
fn close_pool(public pool_id: field) -> Final
```

Returns unspent budget to funder after expiry block. Validates expired.

---

#### `set_registered_auction` — governance only

```leo
fn set_registered_auction(
    public program_addr: address,
    public registered:   bool,
    public op_nonce:     u64,
) -> Final
```

Governed by `fairdrop_multisig_v2.aleo` (same two-phase `approve_op` pattern as other
utility contracts). Required for protocol pools to accept cross-auction receipts.

---

## SDK changes

New entry point `@fairdrop/sdk/rewards`:

```ts
export function buildCreatePool(input: CreatePoolInput): TxSpec
export function buildClaim(pool: PoolView, receipt: Record<string, unknown>): TxSpec
export function buildClaimTiered(pool: PoolView, receipts: Record<string, unknown>[]): TxSpec
export function buildTopUpPool(pool: PoolView, amount: bigint): TxSpec
export function buildClosePool(pool: PoolView): TxSpec
```

`PoolView` is a new domain type fetched from the API (pool_configs + pool_budget mappings).

---

## Indexer + API changes

- Index `pool_configs` and `pool_budget` mappings from `fairdrop_rewards_v1.aleo`
- New API route `GET /rewards/pools` — list active pools (filterable by auction_id)
- New API route `GET /rewards/pools/:poolId` — pool detail + remaining budget

---

## Frontend changes

### Creator flow (`AuctionManagePage`)

Optional "Create Reward Pool" section after auction creation:
- Reward type selector (credits / token)
- Amount per claim + total budget
- Optional expiry block
- "Create Pool" button → `buildCreatePool`

### Bidder flow (`AuctionDetailPage` or dedicated `/rewards` page)

After auction clears, bidders who hold a receipt see:
- Active pools for this auction (if any)
- "Claim Reward" button → `buildClaim` (receipt passed from wallet record scan)
- For protocol pool: separate `/rewards` page listing all claimable pools

---

## Deferred

- **Max-5 receipt variant** (`claim_5`) — straightforward extension of `claim_tiered`
- **Fully private threshold proof** — N receipts without linkage; requires ZK circuit
  support not available in Leo today. The long-term goal.
- **On-chain reward tiers** (configurable multipliers per tier count) — keep flat rate
  for now, add tier config to `PoolConfig` in v2.

---

## Steps

1. Define `PoolConfig`, `RewardVoucher`, `ClaimKey` structs; mappings in new contract.
2. Implement `create_pool`, `claim`, `claim_tiered`, `top_up_pool`, `close_pool`,
   `set_registered_auction` transitions.
3. Register contract as an `allowed_caller` in `fairdrop_proof_v3.aleo`? — No:
   `fairdrop_rewards_v1.aleo` reads `participated` as a cross-program mapping read
   in `final {}`, not via CPI. No `allowed_callers` change needed.
4. Add `@checksum` constructor; register upgrade key in multisig.
5. Build `@fairdrop/sdk/rewards` entry point.
6. Extend indexer and API for pool mappings.
7. Build `CreateRewardPool` section in `AuctionManagePage`.
8. Build claim UI in `AuctionDetailPage` + `/rewards` page.
9. Run type-check.
