# Leo 3.5 → 4.0 Migration Guide
## fairdrop-contracts

---

## Quick Reference

| 3.5 | 4.0 |
|-----|-----|
| `async transition foo() -> Future` | `fn foo() -> Final` |
| `async function finalize_foo()` | deleted; body moves into `final { }` inline |
| `function helper()` (inside program) | `fn helper()` outside `program {}` |
| `async constructor()` | `constructor()` |
| `Future` | `Final` |
| `f.await()` | `f.run()` |
| `return finalize_foo(args)` | `return final { /* body */ };` |
| `prog.aleo/fn()` | `prog.aleo::fn()` |
| `prog.aleo/Type` | `prog.aleo::Type` |
| `@test script foo()` | `@test fn foo() -> Final` |
| `f.await()` in script body | `return final { f.run(); }` |
| `transition test_never_passes()` | deleted — no longer needed |
| structs inside `program {}` | structs outside `program {}` (convention) |

---

## Step-by-Step Process

Apply these steps to every `.leo` file. Steps 1–4 are mechanical; Step 5 is the architectural win.

---

### Step 1 — Mechanical keyword replacements

Pure find-and-replace across all files. Order matters for steps 1c and 1d.

**1a. CPI separator**
```
.aleo/  →  .aleo::
```
This covers function calls, type annotations, record constructors, and mapping access.
Scope: ~74 occurrences in dutch alone; apply to all 11 source + 11 test files.

**1b. Future → Final**
```
Future  →  Final
```
Covers return types, local variable type annotations, and finalize function signatures.

**1c. f.await() → f.run()**
```
f.await()         →  f.run()
f_burn.await()    →  f_burn.run()
f_credits.await() →  f_credits.run()
f_gate.await()    →  f_gate.run()
f_proof.await()   →  f_proof.run()
f_ref.await()     →  f_ref.run()
f_cfg.await()     →  f_cfg.run()
```

**1d. Keyword changes**
```
async transition  →  transition   (temporary; Step 2 finishes it)
async function    →  function     (temporary; Step 3 deletes these)
async constructor →  constructor
```

**1e. Test files only**
```
@should_fail\n    script  →  @should_fail\n    fn
@test\n    script          →  @test\n    fn
```

---

### Step 2 — `transition` → `fn` and return type

Change every `transition` to `fn`. The return type `-> Future` becomes `-> Final`.

```leo
// before
async transition place_bid_public(...) -> (Bid, ParticipationReceipt, Future) {

// after
fn place_bid_public(...) -> (Bid, fairdrop_proof_v2.aleo::ParticipationReceipt, Final) {
```

Non-async (pure) transitions that returned no Future simply become:
```leo
// before
transition cancel_auction(...) -> (token_registry.aleo/Token, Future)

// after
fn cancel_auction(...) -> (token_registry.aleo::Token, Final)
```

---

### Step 3 — Inline finalize blocks (the big structural change)

This replaces `return finalize_foo(args)` with an inline `final { }` block that
directly closes over all transition-body variables. The separate `async function
finalize_foo(...)` definition is **deleted**.

**Before (3.5):**
```leo
async transition set_allowed_caller(
    public program_addr: address,
    public allowed: bool,
) -> Future {
    return finalize_set_allowed_caller(self.signer, program_addr, allowed);
}

async function finalize_set_allowed_caller(
    caller:       address,
    program_addr: address,
    allowed:      bool,
) {
    assert_eq(caller, INITIAL_ADMIN);
    allowed_callers.set(program_addr, allowed);
}
```

**After (4.0):**
```leo
fn set_allowed_caller(
    public program_addr: address,
    public allowed: bool,
) -> Final {
    let caller: address = self.signer;
    return final {
        assert_eq(caller, INITIAL_ADMIN);
        allowed_callers.set(program_addr, allowed);
    };
}
```

Key points:
- Variables from the transition body (`self.signer`, local lets, parameters) are
  directly in scope inside `final { }` — no need to thread them through a function
  signature. This eliminates the long argument lists on finalize functions.
- CPI-returned `Final` values are awaited with `.run()` inside the `final { }` block.
- The multi-CPI pattern becomes:

```leo
fn place_bid_public(...) -> (..., Final) {
    let f_credits: Final = credits.aleo::transfer_public_as_signer(...);
    let f_gate: Final    = fairdrop_gate_v2.aleo::check_admission(...);
    let (receipt, f_proof): (..., Final) = fairdrop_proof_v2.aleo::issue_receipt(...);
    // ...build Bid record...
    return (bid, receipt, final {
        assert(!fairdrop_config_v2.aleo::paused.get_or_use(0field, false));
        f_credits.run();
        f_gate.run();
        f_proof.run();
        // ...state validation and updates...
    });
}
```

---

### Step 4 — Move structs and helpers outside `program {}`

The `program {}` block now defines only the on-chain interface: `fn` entry points,
`record` definitions, `mapping` declarations.

Move outside `program {}`:
- All `struct` definitions (except `record`)
- All helper `function` / `inline` definitions → become `fn` at module level
- All `final fn` definitions (Step 5 below)

```leo
// 4.0 file layout
import credits.aleo;
// ... other imports ...

// ── Module-level (outside program block) ─────────────────────────
struct AuctionConfig { ... }
struct AuctionState  { ... }
struct DutchParams   { ... }
// ... all other structs ...

final fn record_bid(...) { ... }        // Step 5
final fn close_auction_core(...) { ... } // Step 5

// ── Program interface ─────────────────────────────────────────────
program fairdrop_dutch_v3.aleo {
    constructor() {}

    record Bid { ... }

    mapping auction_configs: field => AuctionConfig;
    // ... mappings ...

    fn create_auction(...) -> Final { ... }
    fn place_bid_private(...) -> Final { ... }
    // ...
}
```

---

### Step 5 — Extract `final fn` for shared finalize logic

This is the main architectural improvement 4.0 enables. `final fn` bodies are
**inlined by the compiler** into each caller's `final {}` block — they are a
zero-cost code-reuse mechanism, not standalone on-chain functions.

#### The `place_bid_*` family (highest value target)

Every auction contract has 4 bid variants:
`place_bid_private`, `place_bid_public`, `place_bid_private_ref`, `place_bid_public_ref`

**The 4 entry point `fn` declarations stay as 4 separate functions** — their return
types differ (private variants return a change `credits` record; public don't) and
the credits CPI fundamentally differs (`transfer_private_to_public` vs
`transfer_public_as_signer`). These cannot be unified.

**However, both the transition body AND the finalize body can be deduplicated.**

##### Transition body: extract `fn bid_setup`

**Leo 4.0 constraint**: module-level `fn` (outside `program {}`) cannot have
records as inputs or outputs — only entry-point `fn` inside `program {}` can.
`Bid` and `ParticipationReceipt` are records, so they cannot be returned by
a module-level helper.

What CAN be extracted: input validation (`assert`) and `bidder_key` derivation
(a pure hash). CPIs that return `Final` values stay in the entry point (they
need `self.address` via `self.signer` capture, or they produce `Final` which
requires the entry-point scope). The `Bid` record construction also stays in
each entry point.

```leo
// outside program {} — runs in proof context; inlined by compiler
// Returns: bidder_key only. Records cannot be returned from module-level fn.
fn bid_setup(
    owner:          address,   // pass self.signer from the entry point
    auction_id:     field,
    quantity:       u128,
    payment_amount: u64,
) -> field {
    assert(quantity > 0u128);
    assert(payment_amount > 0u64);
    return BHP256::hash_to_field(BidderKey { bidder: owner, auction_id: auction_id });
}
```

Each entry point calls `bid_setup` then constructs `Bid` inline:

```leo
fn place_bid_public(
    public auction_id: field,
    public quantity: u128,
    public payment_amount: u64,
) -> (Bid, fairdrop_proof_v2.aleo::ParticipationReceipt, Final) {
    let bidder_key: field =
        bid_setup(self.signer, auction_id, quantity, payment_amount);
    let bid: Bid = Bid {
        owner: self.signer, auction_id, quantity,
        payment_amount: payment_amount as u128,
    };
    let f_credits: Final =
        credits.aleo::transfer_public_as_signer(self.address, payment_amount);
    let f_gate: Final = fairdrop_gate_v2.aleo::check_admission(auction_id);
    let (receipt, f_proof): (fairdrop_proof_v2.aleo::ParticipationReceipt, Final) =
        fairdrop_proof_v2.aleo::issue_receipt(auction_id, 0field, bidder_key);
    return (bid, receipt, final {
        assert(!fairdrop_config_v2.aleo::paused.get_or_use(0field, false));
        f_credits.run(); f_gate.run(); f_proof.run();
        record_bid(auction_id, bidder_key, quantity, payment_amount as u128);
    });
}
// _ref variants: add f_ref CPI + f_ref.run() before record_bid
// private variants: credits CPI is transfer_private_to_public; return includes change record
```

##### Finalize side: extract `final fn record_bid`

In 3.5 each variant also has its own 35–45 line `finalize_place_bid_*` function with an
**identical** body — the only difference is which CPI Futures are awaited.
Extract the shared state-validation and mapping-write logic into one `final fn`:

```leo
// outside program {} — inlined by compiler into each caller's final block
final fn record_bid(
    auction_id:     field,
    bidder_key:     field,
    quantity:       u128,
    payment_amount: u128,
) {
    let config: AuctionConfig = auction_configs.get(auction_id);
    let state:  AuctionState  = auction_states.get(auction_id);
    assert(!state.supply_met);
    assert(!state.cleared);
    assert(!state.voided);
    assert(block.height >= config.start_block);
    assert(block.height <  config.end_block);
    // price computation, bid validation, state writes, escrow update, stats update...
}
```

Then each entry point `final {}` block is just:
```leo
fn place_bid_private(...) -> (..., Final) {
    // ...build bid record, CPIs...
    return (..., final {
        assert(!fairdrop_config_v2.aleo::paused.get_or_use(0field, false));
        f_credits.run(); f_gate.run(); f_proof.run();
        record_bid(auction_id, bidder_key, quantity, payment_amount as u128);
    });
}

fn place_bid_private_ref(...) -> (..., Final) {
    // identical except also f_ref.run() before record_bid
    return (..., final {
        assert(!fairdrop_config_v2.aleo::paused.get_or_use(0field, false));
        f_credits.run(); f_gate.run(); f_proof.run(); f_ref.run();
        record_bid(auction_id, bidder_key, quantity, payment_amount as u128);
    });
}
```

**Savings per auction (both helpers combined):**
- Transition body: 4 × ~15 duplicate lines → 1 `fn bid_setup` (~7 lines) + 4 × 8-line call sites
  (Bid construction must remain in each entry point — module-level fn cannot return records in 4.0)
- Finalize body:   4 × ~40 duplicate lines → 1 `final fn record_bid` (~40 lines) + 4 × 4-line `final {}` blocks
- Net: ~220 lines → ~90 lines per auction. Across 6 auctions: ~780 lines eliminated.

#### Other `final fn` candidates per contract

| Shared logic | Appears in | Suggested `final fn` name |
|---|---|---|
| Bid state validation + writes | all 4 `place_bid_*` | `record_bid` |
| Close revenue computation | `close_auction` only | inline (not shared) |
| Burn-backed mint budget decrement | `claim`, `withdraw_unsold` | `decrement_escrow_sales` |
| Payment escrow decrement | `withdraw_payments`, `claim_voided` | `decrement_escrow_payments` |
| Proof D12 check | `fairdrop_proof_v2.aleo` transitions 2+3 | `assert_caller_allowed` |
| Ref D12 check | `fairdrop_ref_v2.aleo` transitions | `assert_caller_allowed` |

---

## Migration Order

Migrate bottom-up: utilities first (no auction dependencies), then auctions, then tests.

### Phase 1 — Utility contracts (5 files, ~1,650 lines total)

1. **`fairdrop_config_v2.aleo`** (300 lines) — simplest; no CPI calls; no `final fn` opportunities
2. **`fairdrop_proof_v2.aleo`** (198 lines) — 3 transitions; extract `assert_caller_allowed` final fn
3. **`fairdrop_gate_v2.aleo`** (382 lines) — 4 transitions; similar D12 pattern
4. **`fairdrop_ref_v2.aleo`** (461 lines) — 4 transitions; extract `assert_caller_allowed`
5. **`fairdrop_vest_v2.aleo`** (310 lines) — 3 transitions

### Phase 2 — Auction contracts (6 files, ~8,500 lines total)

6. **`fairdrop_dutch_v3.aleo`** (1,511 lines) — reference; do this first and use as template
7. **`fairdrop_ascending_v3.aleo`** (1,235 lines) — closest to dutch; straightforward
8. **`fairdrop_raise_v2.aleo`** (1,406 lines) — no quantity param; `record_bid` signature differs slightly
9. **`fairdrop_sealed_v2.aleo`** (1,582 lines) — commit-reveal; `commit_bid_*` variants replace `place_bid_*`
10. **`fairdrop_lbp_v2.aleo`** (1,273 lines) — `max_bid_price` param added to `record_bid` signature
11. **`fairdrop_quadratic_v2.aleo`** (1,501 lines) — `contribution_weight` param added; sqrt inline stays in transition body

### Phase 3 — Test suites (11 files)

12–22. All `tests/*.leo` — see the dedicated **Test Migration** section below for
the full picture. Not just mechanical; the `script` → `fn` change requires
understanding *when* `final {}` is needed.

---

---

## Test Migration

The test files need more than mechanical keyword swaps. Three specific things to
understand.

---

### 1. `script` → `fn`, `transition` → `fn`

Every `@test script` and `@test transition` becomes `@test fn`. The `transition`
keyword on the legacy `test_never_passes` guard also changes:

```leo
// 3.5
@test
@should_fail
script test_bid_pub_zero_qty() { ... }

@test
@should_fail
transition test_never_passes() { assert_eq(1u32, 2u32); }

// 4.0
@test
@should_fail
fn test_bid_pub_zero_qty() { ... }

@test
@should_fail
fn test_never_passes() { assert_eq(1u32, 2u32); }
```

---

### 2. `test_never_passes` is no longer needed

In 3.5, Leo required at least one `transition` in every program. Test files only
had `script` and one bare `transition test_never_passes` to satisfy the compiler.

In 4.0, `@test fn` declarations ARE `fn` entry points. The program already has
multiple `fn` entry points from the test functions themselves. The dummy
`test_never_passes` guard can be deleted entirely.

---

### 3. Finalize-dependent tests need `return final { f.run(); }`

In 3.5, `script` was a special test context that could directly call `f.await()`.
In 4.0, `@test fn` is a regular proof-context entry point. Calling `.run()` on a
`Final` value is only valid inside a `final {}` block. To trigger finalize
execution in a test, the function must return `Final`:

```leo
// 3.5 — script can call f.await() directly
@test
@should_fail
script test_close_proof_d12() {
    let f: Future = fairdrop_dutch_v3.aleo/close_auction(...);
    f.await();   // finalize executes here; D12 fires
}

// 4.0 — must return Final and run inside final block
@test
@should_fail
fn test_close_proof_d12() -> Final {
    let f: Final = fairdrop_dutch_v3.aleo::close_auction(...);
    return final { f.run(); };   // finalize executes here; D12 fires
}
```

**Group 1 tests (transition-body failures)** don't strictly need this — the
transition body panics before the `final {}` block is reached. But using the same
`-> Final` pattern everywhere is cleaner and harmless:

```leo
@test
@should_fail
fn test_bid_pub_zero_qty() -> Final {
    let (_, _, f): (_, _, Final) =
        fairdrop_dutch_v3.aleo::place_bid_public(1field, 0u128, 1000u64);
    return final { f.run(); };
    // assert(quantity > 0) fires in transition body; final block never reached
}
```

**Rule: all `@test @should_fail fn` that call `fn -> Final` entry points should
return `Final` and end with `return final { f.run(); }`.**

#### Full 4.0 test structure for one test file

```leo
import fairdrop_dutch_v3.aleo;
import fairdrop_proof_v2.aleo;
import token_registry.aleo;

program test_dutch.aleo {
    @noupgrade
    constructor() {}                    // async removed

    // Group 1: transition-body assertion failures
    @test
    @should_fail
    fn test_bid_pub_zero_qty() -> Final {
        let (_, _, f): (
            fairdrop_dutch_v3.aleo::Bid,
            fairdrop_proof_v2.aleo::ParticipationReceipt,
            Final,
        ) = fairdrop_dutch_v3.aleo::place_bid_public(1field, 0u128, 1000u64);
        return final { f.run(); };
    }

    // Group 2: D12 / finalize failures
    @test
    @should_fail
    fn test_close_proof_d12() -> Final {
        let f: Final = fairdrop_dutch_v3.aleo::close_auction(
            1field,
            aleo128wz89c78ur4mx378056yd9q7kqmphr07k0kfsmnwvqnv7g9syyqkg263r,
            false, 0u128, 0u128,
        );
        return final { f.run(); };
    }

    // test_never_passes is DELETED — no longer needed in 4.0
}
```

---

### Test checklist

```
[ ] T1  async constructor → constructor
[ ] T2  @test script / @test transition → @test fn
[ ] T3  Delete test_never_passes (no longer required)
[ ] T4  All @test fn that call Final-returning entry points → fn returns Final
        with return final { f.run(); }
[ ] T5  Future → Final (type annotations in test bodies)
[ ] T6  f.await() → inside final { f.run(); } (never bare in fn body)
[ ] T7  .aleo/ → .aleo:: (all CPI calls and type references)
```

---

## Per-File Checklist

Apply to each file and check off:

```
[ ] 1a  .aleo/ → .aleo:: (all CPI calls, type annotations, mapping access)
[ ] 1b  Future → Final (return types, local type annotations)
[ ] 1c  f.await() → f.run() (all awaited futures)
[ ] 1d  async constructor → constructor
[ ] 2   async transition → fn; remove async from function keyword
[ ] 3   Delete all finalize_* async function definitions;
        inline their bodies as final { } blocks in the caller
[ ] 4   Move structs outside program {}
[ ] 5   Extract final fn for any logic shared across 2+ final blocks
[ ] T   (test files) see Test checklist above (T1–T7)
```

---

## Gotchas

**`self.signer` is not available inside `final {}`**
It is only available in the proof context (transition body). Capture it as a
`let caller: address = self.signer;` before the `final {}` block — it will be
closed over.

**`self.caller` behaves the same way** — capture before `final {}` if needed in finalize.

**`block.height` IS available inside `final {}`** — it runs in the finalize context.

**`final fn` cannot call regular `fn`** — `final fn` runs in the finalize context;
regular `fn` runs in the proof context. The split is strict.

**`final fn` IS inlined, not a standalone on-chain function** — no concern about
exceeding on-chain instruction limits from the inlining; the compiler handles it.
However, deeply nested `final fn` calls that expand to very large finalize bodies
may hit snarkVM's per-finalize instruction limit (check during testing).

**Parameter limit still applies to `fn` entry points** — Leo's 16-parameter limit
on transitions applies to `fn` entry points in 4.0. The struct grouping pattern
(`DutchParams`, `GateParams`, `VestParams`, `ConfigSnapshot`) is still needed.

**`final fn` takes no `Final` arguments** — you cannot pass a `Final` value into a
`final fn`. CPIs must be awaited with `.run()` directly in the `final {}` block
before calling the `final fn`. The `final fn` receives plain values only.
