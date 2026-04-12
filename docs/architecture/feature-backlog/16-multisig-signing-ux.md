# 16 — Multisig Signing UX

**Theme:** Admin Experience
**Status:** Planned
**Priority:** Medium — quality-of-life for all multisig-governed operations

---

## Problem

Every multisig operation (config changes, caller authorization, treasury withdrawals, upgrades, admin rotation) requires 3-of-5 admin signatures. The current flow is:

1. Admin opens the relevant panel in `/admin`
2. UI displays a message hash (field literal)
3. Admin manually copies the hash
4. Admin switches to CLI: `aleo account sign --private-key <KEY> --message <HASH>`
5. Admin copies the `sign1…` output back into the UI
6. Repeat for 3 admins — each must sign separately and communicate their signature out-of-band

This is error-prone (wrong hash, wrong field, stale nonce) and slow (requires real-time coordination between 3 people).

---

## Constraint

The wallet adapter (`@provablehq/aleo-wallet-adaptor-core`) only exposes `signMessage(Uint8Array)` — arbitrary byte signing. The on-chain multisig verifies `sig.verify(address, field)` — a Schnorr signature over a **field element**. These are incompatible operations. Only `aleo account sign` (CLI) or direct `PrivateKey.sign(field)` via `@provablehq/sdk` WASM produces the correct `sign1…` signature.

Until wallet adapters add a `signField(field: string)` method, browser-native field signing is not possible without exposing private keys to the page.

---

## Plan

### Phase 1 — Streamline the CLI flow (no backend changes)

Small changes to `SignaturePanel.tsx` and surrounding components.

#### 1a. Auto-fill address from connected wallet

- Add a "Use my address" button next to each admin address input
- On click, fill the address field with the connected wallet's `address`
- Auto-target the first empty slot if there is one

#### 1b. Copy CLI command

- Add a "Copy sign command" button next to each message hash display
- Copies a ready-to-paste command: `aleo account sign --private-key <YOUR_KEY> --message <HASH>`
- The admin only needs to replace `<YOUR_KEY>` with their actual private key

#### 1c. Smart paste

- When pasting into a signature field, detect `sign1…` prefix and auto-place it in the signature input even if focus is on the address input (or vice versa)
- If the CLI output includes both address and signature, parse and fill both fields

#### Files changed

- `apps/frontend/src/features/admin/components/shared/SignaturePanel.tsx`
- `apps/frontend/src/features/admin/components/shared/MsgHashPanel.tsx`

---

### Phase 2 — Async proposal queue (backend + frontend)

Decouple signing from execution so admins don't need to coordinate in real time. Gnosis Safe-style flow.

#### Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  Admin 1     │────▶│  POST        │     │  proposals   │
│  (propose)   │     │  /proposals  │────▶│  table (DB)  │
└─────────────┘     └──────────────┘     └──────┬───────┘
                                                │
┌─────────────┐     ┌──────────────┐            │
│  Admin 2     │────▶│  POST        │◀───────────┘
│  (approve)   │     │  /proposals  │
└─────────────┘     │  /:id/sign   │
                    └──────────────┘
┌─────────────┐           │
│  Admin 3     │───────────┘
│  (approve)   │
└─────────────┘
        │
        ▼  (3/5 reached)
┌─────────────┐
│  Any admin   │──▶ Execute on-chain (approve_op + target fn)
│  (execute)   │
└─────────────┘
```

#### Data model

```sql
CREATE TABLE proposals (
  id            UUID PRIMARY KEY,
  op_type       TEXT NOT NULL,        -- 'config_set', 'authorize_caller', 'withdraw', 'upgrade', 'rotate_admin'
  op_hash       TEXT NOT NULL,        -- BHP256 field literal
  msg_hash      TEXT NOT NULL,        -- ApproveOpMsg hash (what admins sign)
  request_id    TEXT NOT NULL,        -- u64 as string
  params        JSONB NOT NULL,       -- op-specific payload (fn_key, value, target contract, etc.)
  status        TEXT DEFAULT 'open',  -- 'open' | 'ready' | 'executed' | 'cancelled'
  created_by    TEXT NOT NULL,        -- aleo1… of proposer
  created_at    TIMESTAMPTZ DEFAULT now(),
  executed_tx   TEXT                  -- transaction ID once executed
);

CREATE TABLE proposal_signatures (
  proposal_id   UUID REFERENCES proposals(id),
  admin         TEXT NOT NULL,        -- aleo1…
  signature     TEXT NOT NULL,        -- sign1…
  signed_at     TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (proposal_id, admin)
);
```

#### API endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST`   | `/proposals`             | Create a new proposal (any admin) |
| `GET`    | `/proposals`             | List open/ready proposals |
| `GET`    | `/proposals/:id`         | Get proposal details + signatures |
| `POST`   | `/proposals/:id/sign`    | Add a signature (any admin, verified server-side) |
| `POST`   | `/proposals/:id/execute` | Mark as executed (after on-chain confirmation) |
| `DELETE` | `/proposals/:id`         | Cancel (proposer only, while open) |

#### Frontend

- New **Proposals** tab in the admin panel
- List view: pending proposals with signature count badges (e.g. "2/3")
- Detail view: op summary, collected signatures, "Sign" button (copies CLI command or signs if wallet supports it in the future), "Execute" button (enabled at 3/5)
- Existing panels (Config, Authorization, Treasury, Upgrades, Governance) get a "Propose" button that creates the proposal instead of immediately requiring all 3 signatures

#### Files changed

- `services/api/src/routes/proposals.ts` (new)
- `packages/database/migrations/XXXX_proposals.sql` (new)
- `apps/frontend/src/features/admin/components/proposals/` (new)
- `apps/frontend/src/features/admin/pages/AdminPage.tsx` (add Proposals tab)
- All existing admin panels — replace inline SignaturePanel with "Propose" flow

---

### Phase 3 — Wallet field signing (blocked on ecosystem)

When wallet adapters add `signField(field: string): Promise<string>`:

- Add a "Sign with wallet" button in the proposal detail view
- Calls `signField(msgHash)`, POSTs the result to `/proposals/:id/sign`
- Fully eliminates the CLI step

This is blocked on upstream changes to `@provablehq/aleo-wallet-adaptor-core`. Monitor:
- Leo Wallet changelog
- Puzzle Wallet changelog
- `@provablehq/aleo-wallet-standard` spec updates

---

## Implementation order

| Phase | Effort | Dependency | Impact |
|-------|--------|------------|--------|
| 1 — CLI streamlining | ~1 day | None | Removes 50% of copy-paste friction |
| 2 — Async proposals  | ~3–4 days | API + DB migration | Fully decouples admin coordination |
| 3 — Wallet signing   | ~0.5 day | Wallet adapter update | Eliminates CLI entirely |
