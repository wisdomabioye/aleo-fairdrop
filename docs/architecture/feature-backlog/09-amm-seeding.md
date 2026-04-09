# Plan: Post-Auction AMM Seeding

## Summary

After `close_auction`, the creator seeds a DEX liquidity pool using their revenue and unsold
supply in **a single transaction**. The auction contract calls `fairswap_dex_v2.aleo` directly
via CPI — no record scanning, no multi-step sequence, no intermediate withdrawals.

**Status: DEFERRED** — requires `fairswap_dex_v2.aleo` (see below) to be built and deployed,
and auction contracts to be updated with a `seed_liquidity` transition. Implement after:
1. All items in `docs/architecture/TODO.md` are completed.
2. `fairswap_dex_v2.aleo` is deployed and verified on Aleo mainnet.

---

## Why the current plan was wrong

The previous version of this plan modelled auction proceeds as **private records** that must be
withdrawn before they can be added to a pool. That forced a 3-transaction sequence:

```
withdraw_payments → (wait for finalization, scan record)
withdraw_unsold   → (wait for finalization, scan record)
add_liquidity     → (submit with both records)
```

Uniswap's seamlessness exists because balances live in **public mappings** — one contract can
authorize another to spend them atomically. Aleo has the same primitive: `token_registry.aleo`
tracks public balances alongside private records. If post-close revenue and unsold supply are
held as public mapping balances in the auction contract, a single CPI call to the DEX handles
the entire seeding in one transaction.

The fix is a model change, not a missing feature.

---

## Prerequisite: `fairswap_dex_v2.aleo` revamp

The existing `fairswap_dex_v1.aleo` (renamed from `private_dex.aleo`) is not suitable for
long-term use. It lacks a factory pattern, uses LP token records (which break CPI composability),
has no fee mechanism, and has no upgrade governance. A full revamp is required before this
seeding flow can be implemented.

### Target: Uniswap V2 minimal + Aleo privacy variants

V3 (concentrated liquidity, tick ranges) is not a realistic target for Leo circuits today.
V2 constant product with dual public/private paths is the right design.

**Privacy model:** Pool reserves are always public — `final {}` blocks can only read/write
public mappings, so the AMM invariant check (`x * y = k`) is inherently visible. Trade
*amounts* are therefore always inferable from reserve deltas. What Aleo hides is *identity*
and *balance* — who is trading and what they hold. Both public and private variants are
implemented from the start; users choose based on their needs.

---

### Pool state

```leo
struct PoolState {
    token_a:      field,   // token_registry token ID
    token_b:      field,
    reserve_a:    u128,
    reserve_b:    u128,
    lp_supply:    u128,
    lp_token_id:  field,   // token_registry ID for this pool's LP token
    fee_bps:      u16,     // default 30 (= 0.3%)
    price_a_cum:  u128,    // cumulative price for TWAP (token_a per token_b)
    price_b_cum:  u128,    // cumulative price for TWAP (token_b per token_a)
    last_block:   u32,
}

// key = BHP256::hash_to_field(PoolKey { token_a, token_b })
// canonical ordering enforced: token_a < token_b by field value
mapping pools: field => PoolState;
```

---

### LP tokens

LP tokens are registered in `token_registry.aleo` as a standard fungible token at `create_pool`.
LP positions exist in two forms — public balances (default) and private records — mirroring
how `token_registry.aleo` handles all other tokens on Aleo.

- **Public LP balance** — default; composable with CPI; required for the auction seeding path
- **Private LP record** — output of `add_liquidity_private`; hides LP position size and holder

LP token ID: `BHP256::hash_to_field(LpTokenKey { pool_key, edition: 1field })`

---

### Protocol fee (Option B)

Protocol fee is **off by default**. When enabled via `fairdrop_config.aleo` (multisig-governed),
a portion of each swap fee is diverted from LP reserves into a per-pool accumulator mapping:

```leo
// protocol_fees[pool_key] accumulates in token_b units per pool
mapping protocol_fees: field => u128;
```

- Fee split: 1/6 of the 0.3% swap fee (= 0.05%) goes to `protocol_fees`; the remaining 5/6
  stays in reserves for LPs. Same ratio as Uniswap V2.
- Governance withdraws via `withdraw_protocol_fees(pool_key, recipient)` — requires a multisig
  `WithdrawalOp` approved op, matching the same pattern used by all 6 auction contracts.
- The `recipient` can be any address — directs fees to treasury, multisig, or another contract.

---

### Transitions

#### Public paths (identity visible, amounts visible)

| Transition | Inputs | Outputs | Notes |
|---|---|---|---|
| `create_pool(token_a, token_b, fee_bps)` | token IDs, fee | — | Permissionless; registers LP token in token_registry; fails if pool exists |
| `add_liquidity(token_a_id, token_b_id, amount_a, amount_b, min_lp, recipient)` | public balances | public LP balance | Caller must hold token_registry public balances |
| `add_liquidity_cpi(token_a_id, token_b_id, amount_a, amount_b, min_lp, recipient)` | public balances | public LP balance | CPI-callable only; called by auction `seed_liquidity` |
| `remove_liquidity(token_a_id, token_b_id, lp_amount, min_a, min_b, recipient)` | public LP balance | public balances | Burns LP; returns tokens to recipient |
| `swap(token_in_id, token_out_id, amount_in, min_out, recipient)` | public balance | public balance | 0.3% fee; TWAP updated; protocol fee split if enabled |
| `withdraw_protocol_fees(pool_key, recipient)` | — | public balance | Multisig-governed; drains `protocol_fees[pool_key]` |
| `update_fee(token_a_id, token_b_id, fee_bps)` | — | — | Multisig approved op; bounded 0–100 bps |

#### Private paths (identity hidden, balance hidden; amounts still inferable from reserve delta)

| Transition | Inputs | Outputs | What's hidden |
|---|---|---|---|
| `swap_private(token_in_record, token_out_id, min_out)` | private token record | private token record | Trader identity + wallet balance |
| `add_liquidity_private(record_a, record_b, min_lp)` | private token records | private LP record | Contributor identity + amounts held |
| `remove_liquidity_private(lp_record, min_a, min_b)` | private LP record | private token records | LP holder identity + position size |

Private transitions share the same `final {}` logic as their public counterparts — reserves
update identically. The ZK proof proves input record validity and correct AMM math without
revealing the caller's address or balance.

---

### Fee and AMM math

**Swap output (public and private):**
```
amount_in_with_fee = amount_in * (10000 - fee_bps)
amount_out = reserve_b * amount_in_with_fee / (reserve_a * 10000 + amount_in_with_fee)
```

**Protocol fee split (when enabled):**
```
protocol_cut = fee_amount / 6    // 1/6 of swap fee
lp_cut       = fee_amount - protocol_cut
```
`protocol_fees[pool_key] += protocol_cut`; only `lp_cut` stays in reserves.

**Initial LP mint:** `lp_minted = sqrt(amount_a * amount_b)` — 64-iteration Newton-Raphson,
same implementation as `fairdrop_quadratic_v1.aleo`. Minimum liquidity lock: 1000 LP tokens
burned to `aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc` (zero address)
on first mint, preventing the pool from being fully drained.

**Subsequent LP mints:** `lp_minted = min(amount_a * lp_supply / reserve_a, amount_b * lp_supply / reserve_b)`

**TWAP:** `price_a_cum` and `price_b_cum` accumulate `(reserve_b / reserve_a) * blocks_elapsed`
each swap. External contracts snapshot two values to compute a time-weighted average price.

---

### Upgrade governance

Declares `@checksum` pointing at `fairdrop_multisig_v1.aleo::approved_upgrades` with upgrade
key `12field`. First deployment (edition = 0) bypasses the check; all subsequent upgrades
require 3-of-5 multisig approval.

---

## Auction contract changes: `seed_liquidity`

Each of the 6 auction contracts gains a single new transition:

```leo
async transition seed_liquidity(
    auction_id: field,
    min_lp:     u128,
) -> Future {
    return finalize_seed_liquidity(auction_id, min_lp, self.caller);
}

final finalize_seed_liquidity(auction_id: field, min_lp: u128, caller: address) {
    let config: AuctionConfig = auction_config.get(auction_id);
    assert_eq(caller, config.creator);

    let state: AuctionState = auction_state.get(auction_id);
    assert(state.cleared);

    let revenue: u128 = unclaimed_revenue.get(auction_id);
    let unsold:  u128 = unsold_supply.get(auction_id);
    assert(revenue > 0u128 && unsold > 0u128);

    // Single CPI call — no intermediate withdrawals
    fairswap_dex_v2.aleo/add_liquidity_cpi(
        config.token_id,
        credits_token_id,   // ALEO credits ID in token_registry
        unsold,
        revenue,
        min_lp,
        caller              // LP tokens minted directly to creator
    );

    unclaimed_revenue.set(auction_id, 0u128);
    unsold_supply.set(auction_id, 0u128);
}
```

No intermediate withdrawals. No record scanning. One finalized transaction.

---

## SDK changes

### `@fairdrop/sdk/transactions`

Remove `buildSeedFromAuction` (old 3-TxSpec composite helper).

Add:
```ts
// Single transaction — replaces the old 3-step sequence entirely.
export function buildSeedLiquidity(input: SeedLiquidityInput): TxSpec;

export interface SeedLiquidityInput {
  auctionType: AuctionType;
  auctionId:   string;
  minLp:       bigint;
}
```

### `@fairdrop/sdk/dex` (new entry point)

```ts
// Transaction builders — public paths
export function buildCreatePool(input: CreatePoolInput): TxSpec;
export function buildAddLiquidity(input: AddLiquidityInput): TxSpec;
export function buildRemoveLiquidity(input: RemoveLiquidityInput): TxSpec;
export function buildSwap(input: SwapInput): TxSpec;
export function buildWithdrawProtocolFees(input: WithdrawProtocolFeesInput): TxSpec;

// Transaction builders — private paths
export function buildSwapPrivate(input: SwapPrivateInput): TxSpec;
export function buildAddLiquidityPrivate(input: AddLiquidityPrivateInput): TxSpec;
export function buildRemoveLiquidityPrivate(input: RemoveLiquidityPrivateInput): TxSpec;

// Chain reads
export function fetchPool(tokenA: string, tokenB: string): Promise<PoolState | null>;
export function fetchProtocolFees(poolKey: string): Promise<bigint>;
export function computePoolKey(tokenA: string, tokenB: string): string;  // enforces canonical ordering
export function computeLpTokenId(poolKey: string): string;

// AMM math helpers (client-side, for UI previews)
export function computeSwapOutput(reserveIn: bigint, reserveOut: bigint, amountIn: bigint, feeBps: number): bigint;
export function computeAddLiquidityAmounts(reserveA: bigint, reserveB: bigint, lpSupply: bigint, amountA: bigint): { amountB: bigint; lpMinted: bigint };
export function computeRemoveLiquidityAmounts(reserveA: bigint, reserveB: bigint, lpSupply: bigint, lpAmount: bigint): { amountA: bigint; amountB: bigint };

export interface PoolState {
  tokenA:      string;
  tokenB:      string;
  reserveA:    bigint;
  reserveB:    bigint;
  lpSupply:    bigint;
  lpTokenId:   string;
  feeBps:      number;
  priceACum:   bigint;
  priceBCum:   bigint;
  lastBlock:   number;
}
```

---

## Frontend changes

`SeedLiquidityPanel` and `useSeedLiquidity` already exist on `AuctionManagePage`. Update:

- **Remove** multi-step status machine (`withdrawing` → `withdrawing_unsold` → `adding_liquidity`)
- **Replace** with single-step: `idle → pending → done | error`
- **Remove** record scanning logic
- **Update** `execute()` to call `buildSeedLiquidity` — one `executeTransaction` call
- **Add** pool preview via `fetchPool`: show current reserves + implied price before seeding;
  if pool doesn't exist, show "This will create a new pool at X price"

```ts
function useSeedLiquidity(auctionId: string, auctionType: AuctionType): {
  canSeed: boolean;        // cleared, unsold > 0, revenue > 0, caller is creator
  pool:    PoolState | null;
  execute: (minLp: bigint) => Promise<void>;
  status:  'idle' | 'pending' | 'done' | 'error';
  txId:    string | undefined;
}
```

---

## Open decisions

1. **`create_pool` gating**: permissionless (Uniswap V2 model) recommended. `fee_bps` is
   bounded at 0–100 bps at creation; governance can update fee but cannot destroy pools.

2. **Canonical token ordering**: `token_a < token_b` by field integer value. `computePoolKey`
   in the SDK enforces this; `add_liquidity_cpi` asserts it in `final {}` to reject misordered
   calls.

3. **Protocol fee config key**: confirm which `fairdrop_config.aleo` key stores the
   fee-enabled flag and treasury address. Suggest reserving two new keys for this.

4. **Private path and protocol fee**: `swap_private` reserve update still runs through
   `final {}` — protocol fee split applies identically. No special casing needed.

5. **Minimum liquidity lock**: 1000 LP tokens burned to zero address on first mint. Confirm
   this constant is appropriate across pools with different token decimals. May need to scale
   by `10^decimals` for tokens with very small units.

---

## Pre-implementation checklist

- [ ] All `TODO.md` items completed
- [ ] `fairswap_dex_v2.aleo` fully written and audited
- [ ] LP token registered in `token_registry.aleo` at `create_pool` confirmed working on devnet
- [ ] Private path CPI interactions (`add_liquidity_private` record outputs) tested
- [ ] `add_liquidity_cpi` from auction contract tested on devnet
- [ ] Protocol fee config keys reserved in `fairdrop_config.aleo`
- [ ] Upgrade key `12field` reserved in multisig
- [ ] `seed_liquidity` added to all 6 auction contracts and tested

---

## Implementation steps

1. Write `fairswap_dex_v2.aleo`:
   - Pool state mapping + canonical key ordering
   - `create_pool` — LP token registration via `token_registry.aleo` CPI
   - `add_liquidity` + `add_liquidity_cpi` — Newton-Raphson sqrt, min liquidity lock
   - `add_liquidity_private` — private record inputs, same `final {}` as public variant
   - `remove_liquidity` + `remove_liquidity_private`
   - `swap` — 0.3% fee, TWAP update, protocol fee split when enabled
   - `swap_private` — private record input/output, same `final {}` reserve logic
   - `withdraw_protocol_fees` — multisig approved op pattern
   - `update_fee` — multisig approved op, bounded 0–100 bps
   - `@checksum` constructor at upgrade key `12field`
2. Write unit tests for `fairswap_dex_v2.aleo`
3. Add `seed_liquidity` transition to all 6 auction contracts
4. Add `@fairdrop/sdk/dex` entry point (all builders + chain reads + AMM math helpers)
5. Add `buildSeedLiquidity` to `@fairdrop/sdk/transactions`; remove `buildSeedFromAuction`
6. Update `useSeedLiquidity` — single-step execution, pool preview
7. Update `SeedLiquidityPanel` — remove multi-step status UI
8. Run type-check and devnet integration test

---

---

# DEX Extension Phases

These phases build on top of `fairswap_dex_v2.aleo` once it is deployed and stable.
Each phase is independently shippable.

---

## Phase 1 — Router (`fairswap_router_v1.aleo`)

**Goal:** Multi-hop swaps and single-asset liquidity entry/exit (zap). Unlocks trading between
any two tokens without requiring a direct pool, and lets users add liquidity without manually
splitting their balance.

### Contracts

`fairswap_router_v1.aleo` — a thin routing layer that CPI-calls `fairswap_dex_v2.aleo`.
It holds no funds and owns no state. Upgrade key: `13field`.

### Transitions

| Transition | Description |
|---|---|
| `swap_multihop(path: [field; 3], amount_in, min_out, recipient)` | Two sequential CPI swaps: A→B→C. `path` is `[token_a, token_b, token_c]`. Max 3 tokens (2 hops) — bounded by Leo's fixed array constraint. |
| `swap_multihop_private(path: [field; 3], token_in_record, min_out)` | Same, private record input/output. |
| `zap_in(token_id, amount_aleo, min_lp, recipient)` | CPI swap (half ALEO → TOKEN) then CPI `add_liquidity`. One transaction. |
| `zap_in_private(token_id, credits_record, min_lp)` | Same, private credits record input; LP record output. |
| `zap_out(token_id, lp_amount, min_aleo, recipient)` | CPI `remove_liquidity` then CPI swap (TOKEN → ALEO). |
| `zap_out_private(token_id, lp_record, min_aleo)` | Same, private LP record input; credits record output. |

### Multi-hop math

The router computes `amount_out_step_1` client-side (using `computeSwapOutput`) and passes it
as `min_out` for the first hop and `amount_in` for the second. If the first hop produces less
than expected (due to front-running), the second hop's slippage guard catches it.

### Zap split

`zap_in` must decide how much ALEO to swap for TOKEN to end up with the correct ratio.
Client-side formula (iterative approximation):
```
swap_amount ≈ (sqrt(reserve_a * (4 * amount_in * reserve_a + amount_in²)) - reserve_a * (2 + amount_in)) / 2
```
SDK exposes `computeZapSplit(reserveA, reserveB, amountIn, feeBps): { swapAmount, addAmountA, addAmountB }`.

### SDK additions (`@fairdrop/sdk/dex`)

```ts
export function buildSwapMultihop(input: SwapMultihopInput): TxSpec;
export function buildSwapMultihopPrivate(input: SwapMultihopPrivateInput): TxSpec;
export function buildZapIn(input: ZapInInput): TxSpec;
export function buildZapInPrivate(input: ZapInPrivateInput): TxSpec;
export function buildZapOut(input: ZapOutInput): TxSpec;
export function buildZapOutPrivate(input: ZapOutPrivateInput): TxSpec;
export function computeZapSplit(reserveA: bigint, reserveB: bigint, amountIn: bigint, feeBps: number): ZapSplit;
export function findBestPath(pools: PoolState[], tokenIn: string, tokenOut: string): string[] | null;
```

`findBestPath` is client-side path-finding across known pools — returns the token path with the
best output for a given input amount. Used by the swap UI to auto-route.

### Frontend

- **Swap page** — token-in / token-out selector; auto-routes via `findBestPath`; shows route
  path (e.g. TOKEN_A → ALEO → TOKEN_B), price impact, min received
- **Zap tab on add-liquidity modal** — single asset input; shows split preview; one transaction
- **Privacy toggle** — public / private selector on swap and zap; uses private variant if selected

### Implementation steps

1. Write and test `fairswap_router_v1.aleo`
2. Add router builders + `findBestPath` + `computeZapSplit` to `@fairdrop/sdk/dex`
3. Build swap page with auto-routing and privacy toggle
4. Build zap tab on add-liquidity modal

---

## Phase 2 — Portfolio & Position Tracking

**Goal:** Let users see all their LP positions, impermanent loss, and unrealised fee earnings
in one place — for both public balances and private LP records.

No new contracts. Pure frontend + SDK additions.

### Features

**LP position list**
- Enumerate all pools via indexer API
- For each pool, fetch LP balance from `token_registry.aleo` public mapping (address → balance)
- For private LP positions: scan wallet records via `scanLpRecords(viewKey, pools?)` —
  same pattern as `scanBidRecords` in the auction SDK

**Impermanent loss calculator**
Client-side. Given entry reserves (stored in indexer at time of `add_liquidity`) and current
reserves, compute IL:

```
il = 2 * sqrt(price_ratio) / (1 + price_ratio) - 1
// price_ratio = current_price / entry_price
```

Show: "If you had held instead, you'd have X more ALEO."

**Unrealised fee earnings**
Derived from reserve growth since LP entry. Requires indexer to store reserve snapshot at each
`add_liquidity` event per address. Fee estimate:

```
value_now    = lp_share * (reserve_a * price_a + reserve_b * price_b)
value_at_entry = entry_amount_a * price_a + entry_amount_b * price_b
fee_earnings = value_now - value_at_entry - il_loss
```

**Position entry/exit**
Remove liquidity and zap-out buttons inline on each position row.

### SDK additions (`@fairdrop/sdk/dex`)

```ts
export function scanLpRecords(viewKey: string, pools?: string[]): Promise<LpRecord[]>;
export function computeImpermanentLoss(entryPriceRatio: bigint, currentPriceRatio: bigint): number;
export function computeLpShare(lpAmount: bigint, lpSupply: bigint, reserveA: bigint, reserveB: bigint): { shareA: bigint; shareB: bigint };
```

### Frontend

- **Portfolio page** — `PoolPositionsPage`: lists all positions (public + private), IL badge,
  fee earnings estimate, entry/exit actions
- `usePoolPositions(address, viewKey?)` hook — merges public balance query + private record scan

### Implementation steps

1. Add `scanLpRecords`, `computeImpermanentLoss`, `computeLpShare` to `@fairdrop/sdk/dex`
2. Add indexer: store reserve snapshot per address per `add_liquidity` event
3. Build `PoolPositionsPage` + `usePoolPositions` hook

---

## Phase 3 — Price Oracle Exposure

**Goal:** Make `fairswap_dex_v2.aleo` usable as an on-chain price oracle for other Aleo
contracts (e.g. a future lending or derivatives protocol).

No new contracts. The TWAP values (`price_a_cum`, `price_b_cum`, `last_block`) are already in
`PoolState`. This phase documents the usage pattern and adds SDK + indexer support.

### On-chain usage (for other contracts)

A contract that needs a price reads the pool mapping directly via CPI:

```leo
let pool: PoolState = fairswap_dex_v2.aleo/pools.get(pool_key);
// Snapshot price_a_cum at two block heights (stored in own mapping)
// TWAP = (price_a_cum_now - price_a_cum_then) / (block_now - block_then)
```

The consuming contract must store its own snapshots — `fairswap_dex_v2.aleo` does not push
prices anywhere. This is identical to the Uniswap V2 oracle pattern.

### Indexer additions

- Store `(pool_key, block, price_a_cum, price_b_cum)` at each swap
- Expose `GET /dex/pools/:key/twap?from=<block>&to=<block>` — returns TWAP for a window

### SDK additions (`@fairdrop/sdk/dex`)

```ts
export function computeTwap(
  cumStart: bigint, cumEnd: bigint,
  blockStart: number, blockEnd: number
): bigint;  // price as fixed-point u128

export function fetchTwap(
  tokenA: string, tokenB: string,
  windowBlocks: number
): Promise<bigint>;  // reads two snapshots from indexer API
```

### Documentation

- `docs/guides/dex/price-oracle.md` — usage guide for contracts that want to consume the
  Fairswap TWAP; includes snapshot pattern, manipulation resistance notes (wider windows = safer),
  and worked example

### Implementation steps

1. Add TWAP snapshot storage to indexer
2. Add `GET /dex/pools/:key/twap` endpoint to API
3. Add `computeTwap` + `fetchTwap` to `@fairdrop/sdk/dex`
4. Write oracle usage guide

---

## Phase 4 — Limit Orders (`fairswap_orders_v1.aleo`)

**Goal:** Users place conditional swaps that execute when the pool price hits their target.
Execution is triggered by an off-chain keeper; the ZK proof enforces correctness on-chain.

### Design

**Order storage:**
```leo
struct LimitOrder {
    owner:       address,
    token_in:    field,
    token_out:   field,
    amount_in:   u128,
    min_out:     u128,    // encodes the limit price: must receive at least this much
    expiry:      u32,     // block height after which order is void
    filled:      bool,
}
mapping orders: field => LimitOrder;
// key = BHP256::hash_to_field(OrderKey { owner, nonce })
```

**Transitions:**

| Transition | Description |
|---|---|
| `place_order(token_in, token_out, amount_in, min_out, expiry)` | Escrows `amount_in` from caller's public balance; stores order |
| `place_order_private(token_in_record, token_out, min_out, expiry)` | Private record escrowed; order amount hidden |
| `execute_order(order_key)` | Keeper-callable; CPI-swaps via DEX; asserts `min_out` satisfied; marks filled |
| `cancel_order(order_key)` | Owner-only; returns escrowed amount; asserts not filled |

The keeper is **untrusted** — if price condition isn't met when `execute_order` is called, the
`assert(amount_out >= order.min_out)` in `final {}` reverts the transaction. The keeper gains
nothing from a failed attempt. Multiple keepers can compete; first to land the execution wins
(no double-fill: `filled` flag is set atomically).

**Keeper service** (`services/order-keeper`):
- Polls `GET /dex/orders?status=open` from the indexer at each block
- For each open order: calls `computeSwapOutput` against current reserves
- If `expected_out >= order.min_out`, submits `execute_order` transaction
- Simple Node.js process; no special permissions required

### SDK additions (`@fairdrop/sdk/dex`)

```ts
export function buildPlaceOrder(input: PlaceOrderInput): TxSpec;
export function buildPlaceOrderPrivate(input: PlaceOrderPrivateInput): TxSpec;
export function buildCancelOrder(input: CancelOrderInput): TxSpec;
export function buildExecuteOrder(input: ExecuteOrderInput): TxSpec;  // keeper use
```

### Frontend

- **Orders tab on swap page** — place, view, and cancel open orders; shows fill status
- `useOrders(address)` hook — polls `GET /dex/orders?owner=<address>`

### Implementation steps

1. Write and test `fairswap_orders_v1.aleo` (upgrade key: `14field`)
2. Write `services/order-keeper` — polling loop + execute logic
3. Add order indexing to indexer
4. Add `GET /dex/orders` endpoint
5. Add order builders to `@fairdrop/sdk/dex`
6. Build orders tab on swap page

---

## Phase 5 — Farming / Liquidity Mining (`fairswap_farm_v1.aleo`)

**Goal:** Reward LP providers with a protocol-defined reward token to incentivise liquidity
depth on strategic pools.

### Design

Standard `reward_per_share` accumulator pattern (MasterChef). Since LP balances in
`token_registry.aleo` are public, the farm contract reads them directly — no wrapped tokens,
no separate staking receipt.

**State:**
```leo
struct FarmPool {
    lp_token_id:       field,
    reward_token_id:   field,
    reward_per_block:  u128,
    reward_per_share:  u128,   // accumulated; scaled by 1e12
    last_reward_block: u32,
    total_staked:      u128,
}
mapping farm_pools: field => FarmPool;             // key = lp_token_id
mapping staked:     field => u128;                 // key = hash(lp_token_id, staker)
mapping reward_debt: field => u128;                // key = hash(lp_token_id, staker)
```

**Transitions:**

| Transition | Description |
|---|---|
| `create_farm(lp_token_id, reward_token_id, reward_per_block)` | Governance-only; multisig approved op |
| `stake(lp_token_id, amount)` | Transfers LP from caller's public balance to farm; claims pending rewards |
| `unstake(lp_token_id, amount)` | Returns LP; claims pending rewards |
| `claim_rewards(lp_token_id)` | Claims without unstaking |
| `update_reward_rate(lp_token_id, reward_per_block)` | Governance-only; multisig approved op |
| `fund_farm(lp_token_id, amount)` | Deposits reward tokens into farm treasury; anyone can call |

**Reward calculation (per staker in `final {}`):**
```
pending = staked[key] * farm.reward_per_share / 1e12 - reward_debt[key]
```

`reward_per_share` is updated at each interaction:
```
reward_per_share += reward_per_block * blocks_elapsed * 1e12 / total_staked
```

Private LP records cannot be staked directly — staker must first `remove_liquidity_private`
to get public balances, then `add_liquidity` to get a public LP balance, then stake. This is
the trade-off of private positions: farming requires public LP.

**Upgrade key:** `15field`

### SDK additions (`@fairdrop/sdk/dex`)

```ts
export function buildStake(input: StakeInput): TxSpec;
export function buildUnstake(input: UnstakeInput): TxSpec;
export function buildClaimFarmRewards(input: ClaimFarmRewardsInput): TxSpec;
export function fetchFarmPool(lpTokenId: string): Promise<FarmPool | null>;
export function fetchFarmPosition(lpTokenId: string, staker: string): Promise<FarmPosition | null>;
export function computePendingRewards(farm: FarmPool, position: FarmPosition, currentBlock: number): bigint;
```

### Frontend

- **Farms page** — list of active farms with APR, TVL, reward token; stake/unstake/claim actions
- **APR calculation** — `(reward_per_block * blocks_per_year * reward_price) / (total_staked * lp_price)`
- `useFarm(lpTokenId, address)` hook — position + pending rewards + farm stats

### Implementation steps

1. Write and test `fairswap_farm_v1.aleo`
2. Add farm indexing (staked events, reward claims)
3. Add `GET /dex/farms` + `GET /dex/farms/:lp` endpoints
4. Add farm builders + helpers to `@fairdrop/sdk/dex`
5. Build farms page + `useFarm` hook

---

## Phase 6 — Swap / LP History & Charts

**Goal:** Full analytics dashboard for the DEX — historical price, volume, TVL, fee earnings,
and per-pool breakdowns. All sourced from indexer data; no new contracts.

### Indexer additions

All events to index (extending the existing auction indexer patterns):

| Event | Data captured |
|---|---|
| `swap` | pool_key, token_in, token_out, amount_in, amount_out, fee, reserve_a_after, reserve_b_after, caller (null for private), block, timestamp |
| `swap_private` | Same, caller = null |
| `add_liquidity` | pool_key, amount_a, amount_b, lp_minted, reserve_a_after, reserve_b_after, provider (null if private), block |
| `remove_liquidity` | pool_key, amount_a, amount_b, lp_burned, reserve_a_after, reserve_b_after, provider (null if private), block |
| `create_pool` | pool_key, token_a, token_b, fee_bps, block |

Note: private variant events record reserve deltas but not caller/provider — this is correct.

### API endpoints

```
GET /dex/pools                              — all pools with current state
GET /dex/pools/:key                         — single pool stats
GET /dex/pools/:key/swaps?limit&offset      — swap history (caller null for private)
GET /dex/pools/:key/liquidity-events        — add/remove history
GET /dex/pools/:key/candles?bucket=5m|1h|1d — OHLCV candles from reserve snapshots
GET /dex/pools/:key/tvl?bucket=daily        — TVL history
GET /dex/pools/:key/volume?bucket=daily     — volume history (public + private, private unattributed)
GET /dex/pools/:key/twap?from=<block>&to=<block>
GET /dex/analytics/overview                 — total TVL, 24h volume, total fees
GET /dex/orders?owner=&status=              — limit orders (Phase 4)
```

### Charts

| Chart | Source | Notes |
|---|---|---|
| Price (line / candle) | `candles` endpoint | OHLCV from reserve snapshots; private swap candles are included (amounts visible, identity not) |
| Volume (bar) | `volume` endpoint | Split bar: attributed (public) vs anonymous (private) |
| TVL (area) | `tvl` endpoint | Always accurate; reserves always public |
| Depth chart | Client math from current reserves | `x * y = k` curve rendered from `reserve_a`, `reserve_b`; no historical data needed |
| Fee APR (line) | Derived: `fees_7d / tvl * 52` | Rolling; updates each swap |
| LP events timeline | `liquidity-events` endpoint | Shows adds/removes; anonymous events shown without address |

### Frontend pages

**Pool explorer** (`/dex/pools`)
- Pool list sorted by TVL; search by token symbol
- Each row: TVL, 24h volume, 24h fees, fee APR, fee tier

**Pool detail** (`/dex/pools/:key`)
- Price chart (candle/line toggle), volume chart, TVL chart, depth chart on one page
- Swap history table — private swaps shown as "Anonymous" with amounts; public swaps show address
- LP events tab
- Your position panel (if connected)

**Swap history page** (`/dex/swaps`)
- Global swap feed across all pools
- Filter by token pair, amount range, public/private

### SDK additions (`@fairdrop/sdk/dex`)

```ts
// Client-side depth chart math — no API call needed
export function computeDepthCurve(
  reserveA: bigint, reserveB: bigint, feeBps: number, steps?: number
): DepthPoint[];  // array of { price, liquidityA, liquidityB }
```

### Implementation steps

1. Extend indexer: add DEX event tables and parsers for all swap/LP/pool events
2. Add all `GET /dex/...` API endpoints
3. Add `computeDepthCurve` to `@fairdrop/sdk/dex`
4. Build pool explorer + pool detail page (charts, swap history, LP events)
5. Build global swap history feed
6. Wire analytics overview into existing `AnalyticsPage` as a new "DEX" section
