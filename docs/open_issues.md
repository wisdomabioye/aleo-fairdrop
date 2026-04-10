# Open Issues

---

## Issue 1: `Finalization not found` panic when the same external CPI function (returning `Final`) is called from multiple programs in the import tree

**Severity:** Compiler panic (build failure)
**Component:** Leo 4.0 type checker / finalization resolver
**Status:** Open — reported upstream, affected functions commented out
**Upstream issue:** https://github.com/ProvableHQ/leo/issues/29297

### Description

When two or more programs in the import dependency tree each contain a function that calls the **same** external CPI function — one that returns a `Final` (or a tuple containing a `Final`) — the Leo compiler panics with:

```
Finalization not found: <external_program>.aleo::<function_name>
```

The root program (the one being compiled) may itself also call that same CPI function without issue when the conflicting dependency function is absent. The panic occurs only when the compiler processes the full transitive closure of imports and encounters duplicate CPI-to-Final registrations.

### Minimal Reproduction

**Setup:** Three Leo programs — `root.aleo`, `dep.aleo`, and the shared external `credits.aleo`.

```
root.aleo
  imports dep.aleo
  imports credits.aleo
  calls credits.aleo::transfer_public_to_private(...)   // returns (credits, Final)

dep.aleo
  imports credits.aleo
  fn some_fn(...) -> (credits.aleo::credits, Final) {
      let (c, f): (credits.aleo::credits, Final) =
          credits.aleo::transfer_public_to_private(owner, amount);
      return (c, final { f.run(); });
  }
```

**Steps to reproduce:**

1. Create `dep.aleo` with a function that calls `credits.aleo::transfer_public_to_private`.
2. Create `root.aleo` that imports `dep.aleo` and also calls `credits.aleo::transfer_public_to_private` directly.
3. Run `leo build` on `root.aleo`.
4. **Expected:** Build succeeds.
5. **Actual:** Compiler panics with `Finalization not found: credits.aleo::transfer_public_to_private`.

**Confirmed trigger functions:**

| Program in dep tree | CPI call that causes panic |
|---|---|
| `dep.aleo::some_fn` | `credits.aleo::transfer_public_to_private` |
| `dep.aleo::some_fn` | `token_registry.aleo::mint_private` |

Both produce the same panic when the root program independently calls the same CPI.

**Confirmed workaround:** Commenting out the function in `dep.aleo` that calls the conflicting CPI allows `root.aleo` to build successfully. The root program's own call to the same CPI continues to work.

### Root Cause (hypothesis)

The Leo compiler appears to maintain a global map of `CPI function name → finalization descriptor` during compilation of the dependency tree. When the same CPI function is encountered in more than one compilation unit, the entry is overwritten or a collision causes the descriptor to be dropped, so the lookup fails when the root program's own call is resolved.

### Impact

Any architecture where:
- Program A calls external CPI `X::f` (returns `Final`)
- Program B also calls external CPI `X::f` (returns `Final`)
- Program C imports both A and B

...will fail to build, even if C never calls A's or B's functions that use `X::f` itself.

This is a significant constraint on protocol designs that share common external dependencies (e.g. `credits.aleo`, `token_registry.aleo`) across multiple utility programs that are all imported by a single top-level contract.

### Workaround

None viable for this codebase. The affected functions (`vest::release`, `ref::claim_commission`) consume records defined in their own programs and write to their own mappings — they cannot be moved to a separate contract without breaking record and mapping ownership guarantees enforced by Aleo. They remain commented out until the Leo compiler is fixed.

---

## Issue 2: Private paths use `burn_private`/`mint_private` — fails for all external tokens

**Severity:** Critical
**Component:** `fairswap_dex_v3.aleo` — `add_liquidity_private` (L474–477), `remove_liquidity_private` (L752–755), `swap_private` (L973–976)
**Status:** Resolved (superseded by Issue 3 fix)

### Description

`add_liquidity_private`, `remove_liquidity_private`, and `swap_private` originally called `token_registry.aleo::burn_private` and `mint_private`. Both are role-gated: `self.caller` (the DEX) must be the token admin or have `SUPPLY_MANAGER_ROLE` (`3u8`) granted. Without the role, the call reverts inside token_registry with no useful error.

### Resolution Applied

Resolved as part of Issue 3. The private paths were switched from `burn_private`/`mint_private` to `transfer_private_to_public`/`transfer_public_to_private`, which are permissionless — no role grant needed. The role-check code added during the initial Issue 2 fix was removed as dead code. See Issue 3 for full details.

---

## Issue 3: Phantom reserves — private swaps and private adds inflate reserves without funding DEX balance

**Severity:** Critical
**Component:** `fairswap_dex_v3.aleo` — `swap_private` (L978–1017), `add_liquidity_private` (L481–537)
**Status:** Resolved

### Description

`burn_private` destroys tokens and reduces total supply, but does NOT deposit anything to the DEX's public `token_registry` balance. However, the pool's `reserve` is incremented as if a deposit occurred. This creates a divergence between `reserve` (what the AMM thinks the DEX holds) and `balance` (what the DEX actually holds), which causes public LP withdrawals to revert.

Concrete scenario:
1. Alice public `add_liquidity`: 1000A + 1000B → `balance_A=1000, balance_B=1000, reserve_a=1000, reserve_b=1000`
2. Bob `swap_private`: burns 100A record, mints ~90B → `reserve_a=1100, reserve_b=910`; **`balance_A` and `balance_B` unchanged at 1000**
3. Alice's on-chain entitlement from reserves: `999/1000 × 1100 ≈ 1099A`
4. Alice calls `remove_liquidity(min_a=1099)` → `transfer_public(A, alice, 1099)` fails — DEX only holds 1000A → **REVERT, funds stranded**

The gap is permanent unless Bob also removes private liquidity (which un-inflates the reserve). But any public LP who observes inflated reserves and attempts a proportional withdrawal before the private LP exits will be blocked.

### Resolution Applied

Replaced `burn_private`/`mint_private` with `transfer_private_to_public`/`transfer_public_to_private` in all three private transitions:

- **`add_liquidity_private`**: `burn_private(record, amount)` → `transfer_private_to_public(self.address, amount, record)`. Both records are deposited into the DEX's public balance. Reserves and balance move together.
- **`remove_liquidity_private`**: `mint_private(token_id, signer, amount)` → `transfer_public_to_private(token_id, self.signer, amount, false)`. Draws from DEX's public balance — no token creation.
- **`swap_private`**: same substitution for both sides. `f_dep.run()` deposits token_in, `f_out.run()` withdraws token_out as a private record.

Both functions are permissionless (no role required), so Issue 2's role checks were removed as dead code. Every token flow through the DEX — public or private — now passes through the DEX's public `token_registry` balance. Reserves and balance are always in sync.

---

## Issue 4: Stale header comment describes the old `add_liquidity_cpi` two-step design

**Severity:** High (misleads SDK integrators)
**Component:** `fairswap_dex_v3.aleo` — lines 12, 39–43
**Status:** Resolved

### Description

Lines 39–43 still describe the old approach: "Caller first transfers tokens to dex_address via separate token_registry CPI calls, then calls add_liquidity_cpi." Line 12 still references `add_liquidity_cpi`. The actual function is `add_liquidity_cpi_private_in` which accepts private Token records directly — no pre-transfer step needed.

An SDK integrator reading this would implement two separate token transfer transactions before the CPI call, which is both incorrect and unnecessary.

### Resolution

Update line 12: `add_liquidity_cpi` → `add_liquidity_cpi_private_in`.

Replace lines 39–43 with:
```
// add_liquidity_cpi_private_in (auction seeding):
//   Caller passes two private Token records. The DEX atomically deposits them
//   to its public balance via transfer_private_to_public in the same transaction.
//   The in-flight record pattern (transfer_public_to_private → pass record) lets
//   callers with public balances use this path without pre-transferring.
```

---

## Issue 5: Undocumented u128 overflow in `lp_for_add`, `sqrt_u128(a×b)`, and `swap_out`

**Severity:** High (silent revert at moderate liquidity levels)
**Component:** `fairswap_dex_v3.aleo` — `lp_for_add` (L117–118), `sqrt_u128` call sites (L412, L514, L617), `swap_out` (L108–110)
**Status:** Resolved (documentation)

### Description

Three intermediate products can silently overflow u128, reverting the transaction with no useful error:

| Expression | Location | Overflows when |
|---|---|---|
| `amount_a * lp_supply` | `lp_for_add` L117 | either > ~1.84×10^19 |
| `amt_a * amt_b` | sqrt call sites | both > ~1.84×10^19 |
| `reserve_out * amt_in_fee` | `swap_out` L109 | product > ~3.4×10^38 |

For 18-decimal tokens, 1.84×10^19 units ≈ 18 tokens. The TWAP overflow is already documented (L206); these are not.

### Resolution

Add documentation alongside the L206 TWAP note:
```leo
// Known overflow risks (in addition to TWAP above):
//   lp_for_add: amount * lp_supply overflows if either > ~1.84e19 units.
//   Initial LP: amt_a * amt_b overflows at the same threshold per token.
//   swap_out: reserve_out * amt_in_fee can overflow at high reserve * amount combinations.
// SDK must validate deposit/swap amounts before submission.
```

Add SDK-side guards: reject inputs where `a * b > u128::MAX` before submitting (computable in 256-bit JS/Rust without hitting the contract).

---

## Issue 6: `add_liquidity_cpi_private_in` bypasses pause for pool creation

**Severity:** Medium
**Component:** `fairswap_dex_v3.aleo` — `add_liquidity_cpi_private_in` (L565–645)
**Status:** Resolved

### Description

The pause check is intentionally omitted so auction seeding isn't blocked (L562–563). However, the function also creates pools atomically (L592–606). `create_pool` correctly checks pause; this path does not. During a governance-triggered pause (e.g., containing an exploit), new pools can still be created via in-flight auction settlements.

### Resolution

Scope the pause check to only the pool-creation branch — this preserves the intent (don't block existing-pool liquidity adds during a pause) while preventing new pool creation:

```leo
if !pools.contains(pool_key) {
    // Block new pool creation while paused, even from auction CPIs.
    assert(!fairdrop_config_v3.aleo::paused.get_or_use(0field, false) && !paused.get_or_use(0field, false));
    assert(fee_bps <= MAX_FEE_BPS);
    // ... pool initialization ...
}
```

---

## Issue 7: Initial LP mint panics with no pre-check if `sqrt(amt_a × amt_b) < MIN_LIQUIDITY`

**Severity:** Medium (confusing silent revert)
**Component:** `fairswap_dex_v3.aleo` — `add_liquidity` (L412), `add_liquidity_private` (L514), `add_liquidity_cpi_private_in` (L617)
**Status:** Resolved

### Description

`sqrt_u128(amt_a * amt_b) - MIN_LIQUIDITY` underflows u128 and panics when `sqrt < 1000`. This requires `amt_a * amt_b >= 1,000,000 token-units²` for the first liquidity add. The transaction reverts with no informative error; callers have no way to know the minimum deposit requirement.

### Resolution

Add a proof-context assertion before `final {}` in each affected transition:

```leo
// Enforce minimum initial liquidity to avoid sqrt - MIN_LIQUIDITY underflow.
// For initial pool seeding, caller must ensure amt_a * amt_b >= MIN_LIQUIDITY^2.
// This is checked here so the proof fails fast with a clear assertion failure
// rather than a silent VM underflow in final {}.
// Note: only applies to initial mint (lp_supply == 0 pools). Non-initial mints
// use lp_for_add which has no sqrt.
// (This assert can be moved to final {} if pool existence is unknown at proof time.)
assert(amount_a * amount_b >= MIN_LIQUIDITY * MIN_LIQUIDITY);
```

Alternatively, document the requirement clearly in the SDK pre-submission checks.

---

## Issue 8: `swap_private` and `remove_liquidity_private` hardcode output to `self.signer` — no recipient parameter

**Severity:** Medium (limits composability)
**Component:** `fairswap_dex_v3.aleo` — `swap_private` (L976), `remove_liquidity_private` (L753–755)
**Status:** Resolved

### Description

Both transitions mint output tokens to `self.signer` with no `recipient` parameter. For direct user calls this is correct. However, any contract that holds a private `LpToken` (e.g., a yield vault, auto-compounder, or router) cannot programmatically call `remove_liquidity_private` and receive the output tokens — they'd go to the human tx signer instead. Private LP positions owned by smart contracts are permanently locked.

`swap` (L805) and `add_liquidity_cpi_private_in` (L569) both accept a `recipient` parameter; the omission here is inconsistent.

### Resolution

Add `public recipient: address` to both transitions and pass it to the output call. For direct user calls the SDK sets `recipient = self.signer`:

```leo
fn swap_private(
    token_in:            token_registry.aleo::Token,
    public token_out_id: field,
    public amount_out:   u128,
    public min_out:      u128,
    public recipient:    address,   // ← add this
) -> (token_registry.aleo::Token, Final) { ... }

fn remove_liquidity_private(
    lp:                LpToken,
    public token_a_id: field,
    public token_b_id: field,
    public amount_a:   u128,
    public amount_b:   u128,
    public min_a:      u128,
    public min_b:      u128,
    public recipient:  address,     // ← add this
) -> (token_registry.aleo::Token, token_registry.aleo::Token, Final) { ... }
```

---

## Issue 9: `swap_private` should track protocol fee after Issue 2 fix

**Severity:** Low
**Component:** `fairswap_dex_v3.aleo` — `swap_private` (L992–994)
**Status:** Resolved

### Description

Protocol fee tracking is intentionally skipped in `swap_private` with the comment: "withdrawing phantom fees would draw from DEX public balance funded only by public swaps" (L992). This reasoning is valid for the current `burn_private` design but becomes incorrect after the Issue 2 fix: `transfer_private_to_public` funds the DEX's public balance for `token_in`, making protocol fee tracking safe and consistent.

After the fix, private swaps earn zero protocol fee while public swaps of the same size do — an inconsistency that penalises protocols earning fees from mixed-privacy pools.

### Resolution (after Issue 2 is resolved)

Add the same protocol fee logic as `swap` (L834–838) to `swap_private`'s `final {}`:

```leo
let fee_amount: u128 = amount_in * (pool.fee_bps as u128) / 10000u128;
let proto_enabled: bool = protocol_fee_enabled.get_or_use(0field, false);
let proto_cut: u128     = proto_enabled ? fee_amount / 6u128 : 0u128;
let fee_key: field      = BHP256::hash_to_field(ProtocolFeeKey { pool_key: pool_key, token_id: token_in_id });
protocol_fees.set(fee_key, protocol_fees.get_or_use(fee_key, 0u128) + proto_cut);
```

---

## Issue 10: `DEFAULT_FEE_BPS` constant is never enforced — appears to be a validated bound but is not

**Severity:** Low
**Component:** `fairswap_dex_v3.aleo` — L259
**Status:** Resolved

### Description

`const DEFAULT_FEE_BPS: u16 = 30u16;` is defined but never referenced in any transition, assertion, or default assignment. A reader reviewing constants could mistake it for an enforced minimum or default. The only enforced fee constraint is `MAX_FEE_BPS = 100`.

### Resolution

Clarify the comment to make it explicit this is an SDK hint only:

```leo
// SDK hint only — not enforced on-chain. Pre-fill this when the user creates
// a pool without specifying a custom fee. The on-chain bound is MAX_FEE_BPS.
const DEFAULT_FEE_BPS: u16 = 30u16;
```

---

## Issue 12: `withdraw_protocol_fees` reserve decrement underflows after LP drainage

**Severity:** High
**Component:** `fairswap_dex_v3.aleo` — `withdraw_protocol_fees` (L1078–1112)
**Status:** Resolved

### Description

`withdraw_protocol_fees` decrements `pool.reserve_a` or `pool.reserve_b` by `amount` after verifying `available >= amount` (the recorded fee balance). There is no guard that `amount <= pool.reserve_a/b`. The two values can diverge because LP withdrawals draw proportional shares from reserves that already include accumulated protocol fee portions.

**Trigger scenario:**

1. Swaps accumulate: `reserve_a = 10000`, `protocol_fees_a = 100`.
2. A large LP (998/1000 supply) calls `remove_liquidity`. Gets `998 * 10000 / 1000 = 9980` of token_a. `reserve_a = 20`.
3. Governance calls `withdraw_protocol_fees(pool_key, token_a, 100)`.
4. `available = 100 >= 100` — fee check passes.
5. `pool.reserve_a - 100 = 20 - 100` → **underflow panic**.

`protocol_fees` and `pool.reserve` track the same token flows but can diverge because `remove_liquidity` drains reserves without reducing `protocol_fees`. LPs are proportionally entitled to the fee-earmarked tokens; nothing prevents reserves from falling below accumulated protocol fees.

### Resolution

Add a reserve bound check before the update:

```leo
let current_res: u128 = is_token_a ? pool.reserve_a : pool.reserve_b;
assert(amount <= current_res);
```

Insert after `assert(token_id == pool.token_a || token_id == pool.token_b)` (L1096) and before `pools.set(...)`. Governance must compute safe withdrawal amounts by checking `min(protocol_fees[key], current_reserve)` before submitting the op.

---

## Issue 13: `add_liquidity_private` always mints LP record to `self.signer` — no `recipient` parameter

**Severity:** Medium (limits composability)
**Component:** `fairswap_dex_v3.aleo` — `add_liquidity_private` (L483, L492)
**Status:** Resolved

### Description

`add_liquidity_private` uses `let caller: address = self.signer` (L483) and `LpToken { owner: caller, ... }` (L492). There is no `public recipient: address` parameter.

This is the same gap that Issue 8 fixed for `swap_private` and `remove_liquidity_private`. `add_liquidity` (L374) and `add_liquidity_cpi_private_in` (L584) both accept a `recipient`. The omission is inconsistent.

Any contract (vault, auto-compounder, router) calling `add_liquidity_private` via CPI will have the LP record minted to the human tx signer (`self.signer`), not to the calling contract. The contract's private LP position is permanently unrecoverable from the contract's perspective.

### Resolution

Add `public recipient: address` and replace `caller` with `recipient` on the `LpToken` struct:

```leo
fn add_liquidity_private(
    record_a:          token_registry.aleo::Token,
    record_b:          token_registry.aleo::Token,
    public lp_to_mint: u128,
    public min_lp:     u128,
    public fee_bps:    u16,
    public recipient:  address,   // ← add this
) -> (LpToken, Final) {
    // ...
    let lp_record: LpToken = LpToken { owner: recipient, pool_key: pool_key, amount: lp_to_mint };
```

For direct wallet calls the SDK sets `recipient = self.signer`.

---

## Issue 14: `make_pool_key` is dead code after Issue 11

**Severity:** Low
**Component:** `fairswap_dex_v3.aleo` — L100–104
**Status:** Resolved

### Description

After Issue 11 replaced all `make_pool_key(...)` call sites with `canonical_pair(...)` + `BHP256::hash_to_field(PoolKey { ... })`, the helper at L100–104 is no longer called anywhere. Only a stale mapping comment on L286 still references it.

The dead function adds ZK constraint weight in compilation, misleads readers into treating it as the canonical pool-key derivation API, and diverges from the pattern used everywhere in the contract.

### Resolution

Delete L100–104:
```leo
// DELETE:
fn make_pool_key(tx: field, ty: field) -> field {
    let a: field = tx < ty ? tx : ty;
    let b: field = tx < ty ? ty : tx;
    return BHP256::hash_to_field(PoolKey { token_a: a, token_b: b });
}
```

Update the L286 mapping comment:
```leo
// Pool state per token pair.
// key = BHP256::hash_to_field(PoolKey { token_a: ca, token_b: cb }) where ca < cb.
mapping pools: field => PoolState;
```

---

## Issue 15: Stale "Burns" comment in `add_liquidity_private` header

**Severity:** Low (misleads SDK integrators)
**Component:** `fairswap_dex_v3.aleo` — L458
**Status:** Resolved

### Description

L458: `// Burns two private token records and returns a private LpToken record.`

After Issue 3, the records are deposited via `transfer_private_to_public`, not burned. "Burns" implies supply destruction (which is what `burn_private` did). An integrator reading this would incorrectly assume total token supply decreases and that the tokens are gone rather than sitting in the DEX's public balance.

### Resolution

```leo
// Deposits two private token records to the DEX's public balance and returns
// a private LpToken record. Records are fully consumed (entire .amount of each).
```

---

## Issue 11: `canonical_pair` computed twice per transition — minor constraint waste

**Severity:** Low
**Component:** `fairswap_dex_v3.aleo` — multiple transitions
**Status:** Resolved

### Description

In `add_liquidity`, `add_liquidity_private`, `add_liquidity_cpi_private_in`, `remove_liquidity`, `remove_liquidity_private`, `swap`, and `swap_cpi_private_in`, `canonical_pair(token_x, token_y)` is called once at the transition level (to derive `pool_key`) and again inside `final {}` (to re-orient amounts into canonical order). The function is deterministic; the second call duplicates ZK constraints.

### Resolution

Compute `canonical_pair` once in the transition, store `ca` and `cb`, and reference them in `final {}` without re-computing:

```leo
let (ca, cb): (field, field) = canonical_pair(token_a_id, token_b_id);
let pool_key: field = BHP256::hash_to_field(PoolKey { token_a: ca, token_b: cb });
// ... pass ca into final {} directly, no second call needed
```

---

## Issue 16: No LP position conversion between public and private — farming blocked, auction LP locked

**Severity:** Medium
**Component:** `fairswap_dex_v3.aleo` — missing transitions
**Status:** Resolved

### Description

The contract has two fully siloed LP tracking systems with no path between them:

- **Public**: `lp_balances[BHP256(LpBalKey{holder, pool_key})]` — from `add_liquidity`, `add_liquidity_cpi_private_in`
- **Private**: `LpToken` record — from `add_liquidity_private`

This causes three concrete problems:

1. **Farming gap** (L37: *"Phase 5 farming contract reads lp_balances directly"*). Private LP holders cannot participate in farming without removing their private position and re-adding as public. No `lp_to_public` path exists.

2. **Privacy gap**. A user who called `add_liquidity` has a permanently visible public balance. No `lp_to_private` path exists to shield the position retroactively.

3. **Auction LP locked**. `add_liquidity_cpi_private_in` credits public LP to `recipient` (typically an auction contract). `remove_liquidity` burns LP from `self.signer` (the human tx signer), not from the calling contract. A contract holding public LP via this CPI cannot programmatically redeem it.

### Resolution

Add two atomic conversion transitions:

```leo
// Convert public LP balance to a private LpToken record.
fn lp_to_private(
    public pool_key: field,
    public amount:   u128,
) -> (LpToken, Final) {
    assert(amount > 0u128);
    let lp: LpToken = LpToken { owner: self.signer, pool_key: pool_key, amount: amount };
    return (lp, final {
        let key: field = BHP256::hash_to_field(LpBalKey { holder: self.signer, pool_key: pool_key });
        let bal: u128  = lp_balances.get_or_use(key, 0u128);
        assert(bal >= amount);
        lp_balances.set(key, bal - amount);
    });
}

// Convert a private LpToken record to a public lp_balances entry.
fn lp_to_public(
    lp:               LpToken,
    public recipient: address,
) -> Final {
    let amount:   u128  = lp.amount;
    let pool_key: field = lp.pool_key;
    return final {
        let key: field = BHP256::hash_to_field(LpBalKey { holder: recipient, pool_key: pool_key });
        lp_balances.set(key, lp_balances.get_or_use(key, 0u128) + amount);
    };
}
```

---

## Issue 17: `remove_liquidity` uses `.get()` for LP balance — opaque panic on missing key

**Severity:** Low
**Component:** `fairswap_dex_v3.aleo` — `remove_liquidity` (L716)
**Status:** Resolved

### Description

`let cbal: u128 = lp_balances.get(ckey);` panics with an opaque VM key-not-found error if the caller has no LP entry for this pool, rather than a clear assertion failure. The `assert(cbal >= lp_amount)` on the next line would surface a cleaner revert message if the missing key simply returned a zero default.

### Resolution

```leo
let cbal: u128 = lp_balances.get_or_use(ckey, 0u128);
```

---

## Issue 18: Stale comment in `create_pool` — "enforced in final {}"

**Severity:** Low
**Component:** `fairswap_dex_v3.aleo` — `create_pool` (L310)
**Status:** Resolved

### Description

L310: `// Canonical ordering (token_a < token_b) enforced in final {}.`

After Issue 11, canonical ordering is enforced in the transition body (proof context) via `canonical_pair`. The `final {}` block only consumes the pre-computed `ca`/`cb`. An SDK integrator reading this would incorrectly expect the ordering to be applied on-chain rather than in the ZK proof.

### Resolution

```
// Canonical ordering (token_a < token_b) enforced in transition body via canonical_pair.
```

---

## Issue 19: `lp_to_private` and `lp_to_public` — missing pause checks

**Severity:** Low (no reserve corruption; consistency gap)
**Component:** `fairswap_dex_v3.aleo` — `lp_to_private` (final block), `lp_to_public` (final block)
**Status:** Resolved

### Description

Every user-facing, state-modifying transition checks:
```leo
assert(!fairdrop_config_v3.aleo::paused.get_or_use(0field, false) && !paused.get_or_use(0field, false));
```
`lp_to_private` and `lp_to_public` both lack this. During a governance pause (e.g., incident response), LP positions can still be converted between public and private representations. Neither function touches pool reserves, but the inconsistency means the pause invariant ("no user-visible DEX state changes during pause") is violated for LP accounting.

Note: `add_liquidity_cpi_private_in` intentionally omits the pause check for existing pools (by design — auction settlement must not be blocked). The omission in `lp_to_private`/`lp_to_public` is unintentional.

### Resolution

Add the standard pause assert as the first line of each `final {}` block:

```leo
fn lp_to_private(...) -> (LpToken, Final) {
    ...
    return (lp, final {
        assert(!fairdrop_config_v3.aleo::paused.get_or_use(0field, false) && !paused.get_or_use(0field, false));
        ...
    });
}

fn lp_to_public(...) -> Final {
    ...
    return final {
        assert(!fairdrop_config_v3.aleo::paused.get_or_use(0field, false) && !paused.get_or_use(0field, false));
        ...
    };
}
```

---

## Issue 20: `lp_for_add` divide-by-zero when pool reserves are drained to zero by rounding

**Severity:** Low (accepted Uniswap V2 edge case; pool permanently bricked if triggered)
**Component:** `fairswap_dex_v3.aleo` — `add_liquidity` (non-initial path), `add_liquidity_private` (non-initial path), `add_liquidity_cpi_private_in` (non-initial path)
**Status:** Resolved

### Description

`lp_for_add(reserve_a, reserve_b, lp_supply, amt_a, amt_b)` divides by `reserve_a` and `reserve_b`. The non-initial path is selected when `pool.lp_supply != 0`, not when reserves are non-zero. These can diverge:

After the initial mint, `MIN_LIQUIDITY = 1000` LP units are permanently locked to `ZERO_ADDRESS`. If all other LPs remove their positions through iterative burns, integer-floor rounding can drive `reserve_a` or `reserve_b` to zero while `lp_supply = MIN_LIQUIDITY > 0`. Concretely: `MIN_LIQUIDITY * reserve_a / lp_supply = 0` when `reserve_a < lp_supply / MIN_LIQUIDITY`.

**Consequence:** Any subsequent `add_liquidity` call enters the non-initial branch, calls `lp_for_add(0, ..., ...)`, and panics at the VM level with an opaque divide-by-zero. The pool is permanently bricked — no liquidity can be added, and swaps fail too (no token_out balance to send). The `assert(amt_a * amt_b >= MIN_LIQUIDITY^2)` only guards the initial mint and does not prevent this degenerate state.

This is a known Uniswap V2 edge case. The fix does not recover the bricked pool but replaces an opaque VM panic with a clear, diagnosable revert.

### Resolution

Add explicit reserve-nonzero guards immediately before the `lp_for_add` call in all three transitions:

```leo
if !is_initial {
    // Guard: if reserves were drained to 0 by rounding (Uniswap V2 known edge case),
    // fail with a clear error rather than a divide-by-zero inside lp_for_add.
    assert(pool.reserve_a > 0u128 && pool.reserve_b > 0u128);
}
let lp_out: u128 = is_initial
    ? sqrt_u128(amt_a * amt_b) - MIN_LIQUIDITY
    : lp_for_add(pool.reserve_a, pool.reserve_b, pool.lp_supply, amt_a, amt_b);
```

---

## Issue 21: `assert_eq(pool.token_a, ca)` missing in all three swap transitions

**Severity:** Low (technically safe; defensive consistency gap)
**Component:** `fairswap_dex_v3.aleo` — `swap`, `swap_cpi_private_in`, `swap_private` (each `final {}` block)
**Status:** Resolved

### Description

All five liquidity transitions (`add_liquidity`, `add_liquidity_private`, `add_liquidity_cpi_private_in`, `remove_liquidity`, `remove_liquidity_private`) assert `assert_eq(pool.token_a, ca)` immediately after reading the pool. All three swap transitions do not.

The check is technically redundant: `pool_key = BHP256(PoolKey{ca, cb})` binds the pool to exactly the `(ca, cb)` pair via collision resistance, so any pool read at that key must have `token_a == ca`. However, the consistent absence in swaps breaks the defensive pattern. If pool_key derivation ever diverged from canonical ordering in a refactor, swap transitions would silently misroute `reserve_a` / `reserve_b` (and therefore compute wrong amounts for the wrong side of the pair).

### Resolution

Add `assert_eq(pool.token_a, ca);` immediately after `pools.get(pool_key)` in `swap`, `swap_cpi_private_in`, and `swap_private`:

```leo
let pool: PoolState = pools.get(pool_key);
assert_eq(pool.token_a, ca);   // ← add this
```

---

## Issue 22: TWAP not updated on liquidity operations — oracle accuracy gap vs Uniswap V2

**Severity:** Low (no fund risk; oracle reliability gap for future integrators)
**Component:** `fairswap_dex_v3.aleo` — `add_liquidity`, `add_liquidity_private`, `add_liquidity_cpi_private_in`, `remove_liquidity`, `remove_liquidity_private`
**Status:** Open — acceptable for launch; must be addressed before price-sensitive oracle consumers (lending, options) are built on top

### Description

`twap_update` is called only in the three swap transitions. All five liquidity transitions update pool reserves without updating the TWAP accumulator or `last_block`.

In Uniswap V2, `_update()` is called in `mint`, `burn`, and `swap` — it records the cumulative price at the end of the previous block before reserves change. This contract omits the update for liquidity operations.

**Consequence:** An imbalanced liquidity add changes the `reserve_b/reserve_a` price ratio without recording the OLD price in `price_a_cum`/`price_b_cum`. The elapsed time from the last swap grows unboundedly across liquidity-only blocks. On the next swap, `twap_update` accumulates `elapsed * NEW_price`, skipping the intermediate period where the price was set by the liquidity operation. This makes the TWAP oracle:
- Inaccurate: it underrepresents time spent at prices set by liquidity ops
- Manipulable: an attacker can shift the pool price via a large imbalanced liquidity add and hold it for multiple blocks with no swaps, forcing TWAP to later accumulate the manipulated price over the full elapsed window

For the current scope (no price-sensitive downstream consumers), this is an acceptable known gap. Phase 5 farming reads `lp_balances` directly, not the TWAP. No resolution required before launch.

### Future Resolution

When price-sensitive integrations are planned, update all five liquidity transitions to call `twap_update(pool, block.height)` before modifying reserves, and persist `last_block` in the same write:

```leo
let updated: PoolState = twap_update(pool, block.height);
pools.set(pool_key, PoolState {
    ...
    reserve_a:   updated.reserve_a + amt_a,
    reserve_b:   updated.reserve_b + amt_b,
    price_a_cum: updated.price_a_cum,
    price_b_cum: updated.price_b_cum,
    last_block:  updated.last_block,
});
```

---
