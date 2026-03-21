# contracts/

Leo programs that run on Aleo. Split into two groups:

- **`auctions/`** — one program per auction mechanism. Each is an independent deployable unit with its own `program.json`, tests, and build artifacts.
- **`utilities/`** — shared helper programs called via CPI from auction programs. None of them hold auction state; they own their own domain (config, gating, reputation, referrals, vesting).
- **`shared/`** — Leo fixtures and scripts reused across contracts (test helpers, deployment scripts).
- **`deployments/`** — JSON snapshots of deployed program addresses and salts per network.

## Working with contracts

```bash
cd contracts/auctions/dutch
leo build          # compile and generate build/
leo test           # run tests in tests/
leo deploy         # deploy to network configured in .env
```

Each contract directory has a `.env` for the deployer private key and network endpoint — never commit this.

## Key constraints

- Leo `async transition` and `async function` each accept at most **16 inputs**. Group related params into structs in the transition body before passing to finalize.
- Cross-program calls use the **D11 caller-supplied pattern** — callers read on-chain state off-chain and supply it as public params; finalize validates with `assert_eq`.
- Records are private (owner-encrypted). Mappings are public. Design accordingly.
