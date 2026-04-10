# Plan: Post-Auction AMM Seeding

## Summary

After `close_auction`, the creator seeds a DEX liquidity pool using their revenue and unsold
supply in **a single transaction**. The auction contract calls `fairswap_dex_v3.aleo` directly
via CPI — no record scanning, no multi-step sequence, no intermediate withdrawals.

**Status: CONTRACT LAYER COMPLETE** — `seed_liquidity` is implemented and tested in all 6
auction contracts. SDK and frontend integration remain.

Contract work completed:
1. `fairswap_dex_v3.aleo` written, tested, and DEX `token_registry` arg order corrected.
2. `add_liquidity_cpi` supports atomic pool creation (`pools.contains()` check).
3. Upgrade key `12field` reserved in `fairdrop_multisig_v2.aleo`.
4. `seed_liquidity` added to all 6 auction contracts (raise, dutch, ascending, sealed, lbp, quadratic).
5. `withdraw_unsold` upper-bound bug fixed in `fairdrop_raise_v3.aleo` and verified correct in all 6.
6. `ZERO_ADDRESS` constant defined in all 6 auction contracts; `assert_neq(lp_recipient, ZERO_ADDRESS)` guards added.
7. Unit tests updated across all 6 auction test files (Group 5: `test_seed_liq_*`).
8. DEX unit tests fixed (missing `fee_bps: u16` param in `add_liquidity*` calls).

Remaining before deployment:
1. SDK: `buildSeedLiquidity` + `validateSeedLiquidity` pre-flight (see SDK section below).
2. Frontend: update `useSeedLiquidity` + `SeedLiquidityPanel` to single-step.
3. `fairswap_dex_v3.aleo` deployed and verified on Aleo testnet/mainnet.
4. Integration test on devnet: cleared auction → seed_liquidity → pool seeded → LP received.

---

## Why the previous plan was wrong

The previous version of this plan modelled auction proceeds as **private records** that must be
withdrawn before they can be added to a pool. That forced a 3-transaction sequence:

```
withdraw_payments → (wait for finalization, scan record)
withdraw_unsold   → (wait for finalization, scan record)
add_liquidity     → (submit with both records)
```

Uniswap's seamlessness exists because balances live in **public mappings** — one contract can
authorize another to spend them atomically. Auction contracts already track revenue and unsold
supply as public mappings (`escrow_payments`, `creator_withdrawn`, `escrow_sales`,
`unsold_withdrawn`). A single atomic transaction can consume from those mappings and CPI to the
DEX in the same `final {}` block.

---

## Credits bridge — resolved design decision

Auction contracts hold bidder payments as `credits.aleo` public balance. The DEX only accepts
`token_registry.aleo` tokens (using `CREDITS_RESERVED_TOKEN_ID` for ALEO). There is no
program-callable bridge between the two: `wrapped_credits.aleo` only exposes signer-based
deposit paths (`deposit_credits_public_signer`), which require a human wallet — not a calling
contract.

**Resolution**: `seed_liquidity` performs two simultaneous credit movements atomically within
the same `final {}` block:

1. The auction sends `amount_credits` native `credits.aleo` **to the creator** — same path as
   `withdraw_payments`. The auction's `credits.aleo` public balance decreases.
2. The creator sends `amount_credits` of `CREDITS_RESERVED_TOKEN_ID` (the token_registry
   representation of ALEO credits) **to the DEX** — via
   `token_registry.aleo::transfer_public_as_signer`.

Net effect: auction escrow drains correctly; DEX receives the credits token it understands; LP
is minted to `lp_recipient`. The implementation does **not** call `wrapped_credits.aleo` or any
other wrapping contract.

**Pre-condition**: the creator must hold at least `amount_credits` of `CREDITS_RESERVED_TOKEN_ID`
in their `token_registry` public balance before calling `seed_liquidity`. They can acquire this
from any standard source: a prior DEX swap that paid out credits, a `remove_liquidity` operation,
or a direct `token_registry` transfer from another holder. The SDK `buildSeedLiquidity` pre-flight
check will surface an error if the creator's balance is insufficient.

---

## Prerequisite: `fairswap_dex_v3.aleo` revamp

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
    token_a:     field,   // canonical lesser token ID (token_a < token_b)
    token_b:     field,   // canonical greater token ID
    reserve_a:   u128,    // DEX-held units of token_a
    reserve_b:   u128,    // DEX-held units of token_b
    lp_supply:   u128,    // total LP outstanding (includes MIN_LIQUIDITY burned)
    fee_bps:     u16,     // swap fee; default 30 (= 0.3%); max 100
    price_a_cum: u128,    // TWAP: Σ (reserve_b/reserve_a)*1e6 * blocks_elapsed
    price_b_cum: u128,    // TWAP: Σ (reserve_a/reserve_b)*1e6 * blocks_elapsed
    last_block:  u32,     // block.height at last swap (for TWAP delta)
}

// key = BHP256::hash_to_field(PoolKey { token_a: ca, token_b: cb }) where ca < cb.
mapping pools: field => PoolState;
```

**No `lp_token_id` field.** LP is not registered in `token_registry.aleo` — see LP tokens section below.

---

### LP tokens

LP positions are managed **internally** — NOT through `token_registry.aleo`. No LP token is registered on-chain.

- **Public LP balance** — default: `lp_balances[BHP256(LpBalKey { holder, pool_key })] : u128`.
  Composable with CPI; read directly by Phase 5 farming contract.
- **Private LP record** — `LpToken { owner, pool_key, amount }` record returned by `add_liquidity_private`.
  Hides LP position size and holder.
- `lp_to_private` / `lp_to_public` transitions convert between the two forms.

**Minimum liquidity lock**: 1000 LP burned to `ZERO_ADDRESS` on initial mint to prevent full pool drain.
`lp_balances[BHP256(LpBalKey { holder: ZERO_ADDRESS, pool_key })] = 1000` is set once and never decremented.

---

### Protocol fee

Protocol fee is **off by default**. Enabled/disabled via the `toggle_protocol_fee` transition
(requires a multisig `ProtocolFeeToggleOp` approved op). The enabled state is stored in the
DEX's own `protocol_fee_enabled` mapping — NOT in `fairdrop_config.aleo`.

Fee accumulation per (pool, token), not per pool:

```leo
// key = BHP256::hash_to_field(ProtocolFeeKey { pool_key, token_id })
// token_id is the token that was swapped IN (fee accrues in the input token)
mapping protocol_fees: field => u128;
```

- Fee split: 1/6 of the 0.3% swap fee (= 0.05%) goes to `protocol_fees`; the remaining 5/6
  stays in reserves for LPs. Same ratio as Uniswap V2.
- Governance withdraws via `withdraw_protocol_fees(pool_key, token_id, amount, recipient, op_nonce)` — requires a multisig `WithdrawalOp`. Also decrements the pool reserve to keep DEX balance in sync.
- The `recipient` can be any address — directs fees to treasury, multisig, or another contract.

---

### Transitions

#### Public paths (identity visible, amounts visible)

| Transition | Key parameters | Notes |
|---|---|---|
| `create_pool(token_x, token_y, fee_bps)` | token IDs, fee | Permissionless; fails if pool exists; atomic creation also available inside add_liquidity |
| `add_liquidity(token_a_id, token_b_id, amount_a, amount_b, fee_bps, min_lp, recipient)` | amounts + fee_bps | Atomically creates pool if it doesn't exist; fee_bps ignored if pool already exists |
| `remove_liquidity(token_a_id, token_b_id, lp_amount, min_a, min_b, recipient)` | LP amount | Burns public LP balance; returns tokens to recipient |
| `swap(token_in_id, token_out_id, amount_in, min_out, recipient)` | amounts | 0.3% fee; TWAP updated; protocol fee split if enabled |
| `withdraw_protocol_fees(pool_key, token_id, amount, recipient, op_nonce)` | per-pool-per-token | Multisig `WithdrawalOp`; also decrements pool reserve to keep DEX balance in sync |
| `update_fee(pool_key, fee_bps, op_nonce)` | — | Multisig `FeeUpdateOp`; bounded 0–100 bps |
| `toggle_protocol_fee(enabled, op_nonce)` | — | Multisig `ProtocolFeeToggleOp`; sets `protocol_fee_enabled[0field]` |
| `toggle_paused(paused, op_nonce)` | — | Multisig `PauseToggleOp`; sets `paused[0field]` |

#### Private / CPI paths

| Transition | Inputs | Outputs | Notes |
|---|---|---|---|
| `add_liquidity_private(record_a, record_b, lp_to_mint, min_lp, fee_bps, recipient)` | private Token records | private `LpToken` record | Snapshot pattern: caller computes `lp_to_mint` off-chain; `final {}` verifies ≤ max |
| `add_liquidity_cpi_private_in(record_a, record_b, fee_bps, min_lp, recipient)` | private Token records | public LP balance | CPI entry for auction `seed_liquidity`; **pause-exempt** for existing pools (new pool creation branch still pause-gated) |
| `remove_liquidity_private(lp_record, min_a, min_b)` | private `LpToken` record | private Token records | Burns LP record; returns private token records |
| `lp_to_private(pool_key, amount)` | public LP balance | private `LpToken` record | Converts public LP → private record |
| `lp_to_public(lp_record)` | private `LpToken` record | public LP balance | Converts private LP record → public balance |
| `swap_private(token_in_record, token_out_id, min_out)` | private Token record | private Token record | Trader identity + wallet balance hidden |
| `swap_cpi_private_in(record_in, token_out_id, min_out, recipient)` | private Token record | public token balance | CPI swap entry for callers with private records |

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

Declares `@checksum` pointing at `fairdrop_multisig_v2.aleo::approved_upgrades` with upgrade
key `12field`. First deployment (edition = 0) bypasses the check; all subsequent upgrades
require 3-of-5 multisig approval.

---

## Auction contract changes: `seed_liquidity`

Each of the 6 auction contracts gains a single new transition. One atomic transaction —
no intermediate withdrawals, no record scanning.

### Parameters

| Parameter | Type | Description |
|---|---|---|
| `auction_id` | `field` | Which auction to seed from |
| `sale_token_id` | `field` | D11: `config.sale_token_id` — verified in `final {}` |
| `amount_sale_token` | `u128` | Sale tokens to seed; bounded by unsold quota |
| `amount_credits` | `u128` | Credits to seed; bounded by `creator_revenue` |
| `fee_bps` | `u16` | DEX pool fee; used only if pool doesn't exist yet |
| `min_lp` | `u128` | Minimum LP tokens to receive (slippage guard) |
| `lp_recipient` | `address` | Receives LP tokens; must not be `ZERO_ADDRESS` |

Transition-body guards (before any CPI):
- `assert(amount_sale_token > 0u128 && amount_credits > 0u128)`
- `assert_neq(lp_recipient, ZERO_ADDRESS)` — prevents LP tokens being permanently burned

### CPI calls built in proof context (before `final {}`)

Uses the **in-flight record pattern** — `transfer_public_to_private` produces a Token record
in the same tx proof, passed directly to `add_liquidity_cpi_private_in`. The record never
lands on-chain as an unspent output; it is atomically consumed in the same proof.

```leo
// 1. Auction's native credits → creator (mirrors withdraw_payments)
let f_refund: Final =
    credits.aleo::transfer_public(creator, amount_credits as u64);

// 2. Creator's public CREDITS_RESERVED_TOKEN_ID → in-flight Token record owned by DEX
//    (creator must hold >= amount_credits CREDITS_RESERVED_TOKEN_ID in token_registry)
let (record_cred, f_cred): (token_registry.aleo::Token, Final) =
    token_registry.aleo::transfer_public_to_private(self.address, amount_credits as u64, false);

// 3. Auction mints unsold sale tokens as an in-flight Token record owned by DEX
//    (auction contract holds SUPPLY_MANAGER_ROLE for sale_token_id)
let (record_sale, f_sale): (token_registry.aleo::Token, Final) =
    token_registry.aleo::mint_private(sale_token_id, self.address, amount_sale_token, 4294967295u32);

// 4. DEX: atomically create pool (if new) + update reserves + mint LP to lp_recipient
//    Both records are consumed here — same proof, never on-chain as UTXOs.
let f_cpi: Final = fairswap_dex_v3.aleo::add_liquidity_cpi_private_in(
    record_sale,
    record_cred,
    fee_bps,
    min_lp,
    lp_recipient,
);
```

### `final {}` logic

```
// Pause: seed_liquidity is treated like withdraw_payments — pause-gated.
// (The DEX's add_liquidity_cpi_private_in is pause-exempt for existing pools,
// but the auction-side final {} applies the global pause before running CPIs.)
assert(!fairdrop_config_v3.aleo::paused.get_or_use(0field, false) && !paused.get_or_use(0field, false))

// State and identity guards
config = auction_configs.get(auction_id)
state  = auction_states.get(auction_id)
assert(state.cleared && !state.voided)
assert(creator == config.creator)              // only auction creator
assert(sale_token_id == config.sale_token_id)  // D11 cross-check

// Credits accounting — identical to withdraw_payments
withdrawn = creator_withdrawn.get_or_use(auction_id, 0u128)
assert(withdrawn + amount_credits <= state.creator_revenue)
creator_withdrawn.set(auction_id, withdrawn + amount_credits)
escrow = escrow_payments.get(auction_id)
assert(amount_credits <= escrow)
escrow_payments.set(auction_id, escrow - amount_credits)

// Sale token accounting — Dutch-style upper bound (correct pattern)
unsold       = config.supply - state.total_committed
unsold_drawn = unsold_withdrawn.get_or_use(auction_id, 0u128)
assert(unsold_drawn + amount_sale_token <= unsold)
unsold_withdrawn.set(auction_id, unsold_drawn + amount_sale_token)
escrow_s = escrow_sales.get(auction_id)
assert(amount_sale_token <= escrow_s)
escrow_sales.set(auction_id, escrow_s - amount_sale_token)

// Execute all CPIs
f_refund.run()   // native credits: auction → creator
f_cred.run()     // wrapped credits: creator → DEX
f_sale.run()     // mint unsold sale tokens: auction → DEX
f_cpi.run()      // DEX: pool create (if new) + reserve update + LP mint to lp_recipient
```

### New contract-level additions (implemented)

Each auction contract received:

1. **Import**: `import fairswap_dex_v3.aleo;`
2. **`ZERO_ADDRESS` constant**: `const ZERO_ADDRESS: address = aleo1qqq...3ljyzc;` — defined after `PROGRAM_SALT` in each contract.
3. **`seed_liquidity` transition** — per the design above.

No `DEX_ADDRESS` constant needed. Leo resolves program addresses from the import — `fairswap_dex_v3.aleo`
is used directly as an `address` value throughout, matching the existing pattern used for `fairdrop_vest_v2.aleo`.

---

## Bug fix: `fairdrop_raise_v3.aleo::withdraw_unsold` — ✓ FIXED

**Problem found during `seed_liquidity` design review — now resolved.**

The original code only checked `amount <= escrow_sales` (which starts at `config.supply`),
allowing a creator to withdraw the full supply immediately after close — including tokens owed
to bidders.

**Fix applied** — all 6 auction contracts now use the correct upper-bound pattern:

```leo
// Correct upper bound: creator only entitled to supply not committed to bidders.
let unsold: u128        = config.supply - state.total_committed;
let withdrawn: u128     = unsold_withdrawn.get_or_use(auction_id, 0u128);
let new_withdrawn: u128 = withdrawn + amount;
assert(new_withdrawn <= unsold);
unsold_withdrawn.set(auction_id, new_withdrawn);
let escrow: u128 = escrow_sales.get(auction_id);
assert(amount <= escrow);
escrow_sales.set(auction_id, escrow - amount);
```

Note: all 6 contracts use `state.total_committed` in `withdraw_unsold` and `seed_liquidity`.
The earlier plan incorrectly described raise as using `state.effective_supply` — that field
exists only in quadratic for its internal sqrt-weight accounting; it is not used in the
unsold ceiling calculation.

---

## SDK changes

### `@fairdrop/sdk/transactions`

Remove `buildSeedFromAuction` (old 3-TxSpec composite helper).

Add:
```ts
// Single transaction — replaces the old 3-step sequence entirely.
export function buildSeedLiquidity(input: SeedLiquidityInput): TransactionOptions;

export interface SeedLiquidityInput {
  auctionType:      AuctionType;
  auctionId:        string;
  saleTokenId:      string;   // config.sale_token_id — read from chain before calling
  amountSaleToken:  bigint;   // bounded by: config.supply - state.totalCommitted - unsoldWithdrawn
  amountCredits:    bigint;   // bounded by: state.creatorRevenue - creatorWithdrawn
  feeBps:           number;   // ignored if pool already exists
  minLp:            bigint;   // slippage guard
  lpRecipient:      string;   // typically creator address
}

// Pre-flight check (call before buildSeedLiquidity to surface problems early):
// - Fetches auction state from chain to compute max unsold / max credits
// - Checks creator holds >= amountCredits CREDITS_RESERVED_TOKEN_ID in token_registry
// - Returns a structured error if any check fails
export function validateSeedLiquidity(
  input: SeedLiquidityInput,
  creatorAddress: string,
): Promise<{ valid: boolean; error?: string; maxSaleToken: bigint; maxCredits: bigint }>;
```

### `@fairdrop/sdk/dex` (new entry point)

```ts
// Transaction builders — public paths
export function buildCreatePool(input: CreatePoolInput): TransactionOptions;
export function buildAddLiquidity(input: AddLiquidityInput): TransactionOptions;
export function buildRemoveLiquidity(input: RemoveLiquidityInput): TransactionOptions;
export function buildSwap(input: SwapInput): TransactionOptions;
export function buildWithdrawProtocolFees(input: WithdrawProtocolFeesInput): TransactionOptions;

// Transaction builders — private / CPI paths
export function buildSwapPrivate(input: SwapPrivateInput): TransactionOptions;
export function buildAddLiquidityPrivate(input: AddLiquidityPrivateInput): TransactionOptions;
export function buildRemoveLiquidityPrivate(input: RemoveLiquidityPrivateInput): TransactionOptions;
export function buildLpToPrivate(input: LpToPrivateInput): TransactionOptions;
export function buildLpToPublic(input: LpToPublicInput): TransactionOptions;

// Chain reads
export function fetchPool(tokenA: string, tokenB: string): Promise<PoolState | null>;
export function fetchLpBalance(holder: string, poolKey: string): Promise<bigint>;
export function fetchProtocolFees(poolKey: string, tokenId: string): Promise<bigint>;
export function computePoolKey(tokenA: string, tokenB: string): string;  // enforces canonical ordering
export function computeLpBalKey(holder: string, poolKey: string): string;

// AMM math helpers (client-side, for UI previews)
export function computeSwapOutput(reserveIn: bigint, reserveOut: bigint, amountIn: bigint, feeBps: number): bigint;
export function computeAddLiquidityAmounts(reserveA: bigint, reserveB: bigint, lpSupply: bigint, amountA: bigint): { amountB: bigint; lpMinted: bigint };
export function computeRemoveLiquidityAmounts(reserveA: bigint, reserveB: bigint, lpSupply: bigint, lpAmount: bigint): { amountA: bigint; amountB: bigint };

export interface PoolState {
  tokenA:    string;
  tokenB:    string;
  reserveA:  bigint;
  reserveB:  bigint;
  lpSupply:  bigint;
  feeBps:    number;
  priceACum: bigint;
  priceBCum: bigint;
  lastBlock: number;
}
// Note: no lpTokenId — LP is tracked internally in lp_balances, not in token_registry.
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

~~1. **`create_pool` gating**~~ — **Closed**: permissionless. `fee_bps` bounded 0–100 bps; atomic pool creation available in `add_liquidity` and `add_liquidity_cpi_private_in`.

~~2. **Canonical token ordering**~~ — **Closed**: `token_a < token_b` by field integer value; enforced in transition body via `canonical_pair()`, asserted in `final {}` via `assert_eq(pool.token_a, ca)`.

~~3. **Protocol fee config key**~~ — **Closed**: fee-enabled flag lives in the DEX's own `protocol_fee_enabled[0field]` mapping, not in `fairdrop_config.aleo`. Toggled via `toggle_protocol_fee` (multisig `ProtocolFeeToggleOp`).

~~4. **Private path and protocol fee**~~ — **Closed**: `swap_private` final {} runs the same fee split logic as `swap`. No special casing.

~~5. **Minimum liquidity lock constant**~~ — **Closed**: 1000 LP (hardcoded `MIN_LIQUIDITY = 1_000u128`). Not scaled by decimals — acceptable for MVP; revisit if pools with sub-unit tokens are created.

---

## Checklist

### Contract layer — complete
- [x] `fairswap_dex_v3.aleo` written and unit-tested
- [x] `add_liquidity_cpi_private_in` supports atomic pool creation (no prior `create_pool` required); pause-exempt for existing pools
- [x] Upgrade key `12field` reserved in `fairdrop_multisig_v2.aleo`
- [x] Two-level pause added to all 6 auction contracts and DEX
- [x] `withdraw_unsold` upper-bound verified and fixed in all 6 auction contracts
- [x] `seed_liquidity` added to all 6 auction contracts
- [x] `ZERO_ADDRESS` constant added to all 6 auction contracts; `assert_neq(lp_recipient, ZERO_ADDRESS)` guards in place
- [x] DEX `token_registry` call arg order corrected (8 call sites)
- [x] Unit tests: Group 5 added to all 6 auction test files (`test_seed_liq_zero_sale/cred/lp`)
- [x] DEX unit tests fixed (`add_liquidity*` calls now include `fee_bps: u16`)

### SDK + frontend — pending
- [ ] `buildSeedLiquidity` in `@fairdrop/sdk/transactions` (single `TxSpec`)
- [ ] `validateSeedLiquidity` pre-flight: verify caller holds ≥ `amount_credits` CREDITS_RESERVED_TOKEN_ID
- [ ] `useSeedLiquidity` updated to single-step execution + pool preview via `fetchPool`
- [ ] `SeedLiquidityPanel` updated to single-step status UI

### Deployment — pending
- [ ] `fairswap_dex_v3.aleo` deployed and verified on testnet
- [ ] Integration test on devnet: cleared auction → `seed_liquidity` → pool seeded → LP received

---

## Implementation steps

1. ~~Write `fairswap_dex_v3.aleo`~~ ✓ done
2. ~~Write unit tests for `fairswap_dex_v3.aleo`~~ ✓ done
3. ~~Audit `withdraw_unsold` in all 6 auction contracts; fix raise's missing upper-bound check~~ ✓ done
4. ~~Add `seed_liquidity` to all 6 auction contracts~~ ✓ done
   - ~~`import fairswap_dex_v3.aleo;`~~
   - ~~`ZERO_ADDRESS` constant, `assert_neq(lp_recipient, ZERO_ADDRESS)` guard~~
   - ~~`seed_liquidity` transition (per design above)~~
   - ~~Unit tests (Group 5) added to all 6 test files~~
5. Add `@fairdrop/sdk/dex` entry point (all builders + chain reads + AMM math helpers)
6. Add `buildSeedLiquidity` to `@fairdrop/sdk/transactions`; remove `buildSeedFromAuction`
   - Pre-flight: check creator holds `amount_credits` CREDITS_RESERVED_TOKEN_ID; surface error if not
7. Update `useSeedLiquidity` — single-step execution, pool preview via `fetchPool`
8. Update `SeedLiquidityPanel` — remove multi-step status UI
9. Deploy `fairswap_dex_v3.aleo` to testnet; run devnet integration test

---

---

# DEX Extension Phases

These phases build on top of `fairswap_dex_v3.aleo` once it is deployed and stable.
Each phase is independently shippable.

---

## Phase 1 — Router (`fairswap_router_v1.aleo`)

**Goal:** Multi-hop swaps and single-asset liquidity entry/exit (zap). Unlocks trading between
any two tokens without requiring a direct pool, and lets users add liquidity without manually
splitting their balance.

### Contracts

`fairswap_router_v1.aleo` — a thin routing layer that CPI-calls `fairswap_dex_v3.aleo`.
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

**Goal:** Make `fairswap_dex_v3.aleo` usable as an on-chain price oracle for other Aleo
contracts (e.g. a future lending or derivatives protocol).

No new contracts. The TWAP values (`price_a_cum`, `price_b_cum`, `last_block`) are already in
`PoolState`. This phase documents the usage pattern and adds SDK + indexer support.

### On-chain usage (for other contracts)

A contract that needs a price reads the pool mapping directly via CPI:

```leo
let pool: PoolState = fairswap_dex_v3.aleo/pools.get(pool_key);
// Snapshot price_a_cum at two block heights (stored in own mapping)
// TWAP = (price_a_cum_now - price_a_cum_then) / (block_now - block_then)
```

The consuming contract must store its own snapshots — `fairswap_dex_v3.aleo` does not push
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
