# Bug: `Finalization not found` panic when the same external CPI (returning `Final`) appears in multiple programs in the import tree

## Environment

- **Leo version:** <!-- fill in: `leo --version` -->
- **OS:** <!-- fill in: e.g. Ubuntu 22.04, macOS 14 -->
- **Network:** Testnet / local devnet

---

## Description

When two or more programs in the transitive import tree each contain a function that calls the **same** external CPI function — one that returns a `Final` or a tuple containing a `Final` — the Leo compiler panics during build with:

```
Finalization not found: <program>.aleo::<function>
```

The program being compiled may itself call that same CPI without issue when the conflicting dependency is absent. The panic is triggered only when the compiler processes the full import tree and encounters duplicate CPI-to-Final registrations from different compilation units.

---

## Minimal Reproduction

Three programs: `program_a.aleo` (the root being compiled), `program_b.aleo` (a dependency), and the shared external `credits.aleo`.

**`program_b.aleo`** — a utility contract that calls `credits.aleo::transfer_public_to_private`:

```leo
import credits.aleo;

program program_b.aleo {
    fn withdraw(
        owner:         address,
        public amount: u64,
    ) -> (credits.aleo::credits, Final) {
        let (c, f): (credits.aleo::credits, Final) =
            credits.aleo::transfer_public_to_private(owner, amount);
        return (c, final {
            f.run();
        });
    }
}
```

**`program_a.aleo`** — the root program; imports `program_b.aleo` and also calls `credits.aleo::transfer_public_to_private` directly:

```leo
import program_b.aleo;
import credits.aleo;

program program_a.aleo {
    fn payout(
        recipient:     address,
        public amount: u64,
    ) -> (credits.aleo::credits, Final) {
        let (c, f): (credits.aleo::credits, Final) =
            credits.aleo::transfer_public_to_private(recipient, amount);
        return (c, final {
            f.run();
        });
    }
}
```

**Steps:**

1. Create `program_b.aleo` as above.
2. Create `program_a.aleo` as above (imports `program_b.aleo`).
3. Run `leo build` on `program_a.aleo`.

**Expected:** Build succeeds.

**Actual:**
```
Error [ETYC0372075]: Finalization not found: credits.aleo::transfer_public_to_private
```

---

## Additional observations

- Commenting out `program_b.aleo::withdraw` (removing the CPI call from the dependency) allows `program_a.aleo` to build successfully.
- `program_a.aleo`'s own call to `credits.aleo::transfer_public_to_private` continues to work with no issue once the dependency's call is removed.
- The same panic reproduces with `token_registry.aleo::mint_private` in place of `credits.aleo::transfer_public_to_private`.
- The issue appears specific to CPI functions that return `Final` (or a tuple containing `Final`). CPIs returning plain values are not affected.

---

## Workaround

Moving the conflicting function out of any program imported by the root (into a standalone leaf program not part of the import chain) allows all programs to build independently.
