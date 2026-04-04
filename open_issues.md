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
