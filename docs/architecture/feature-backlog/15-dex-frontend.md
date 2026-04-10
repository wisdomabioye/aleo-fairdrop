# Plan: DEX Frontend Integration

## Status

**SDK layer: COMPLETE**
- `@fairdrop/sdk/dex` — math helpers, chain reads, deprecated tx builders, seeding, generated client
- `createFairswapDexV2` — generated typed client from leo-abigen; preferred for all tx building
- `packages/leo-abigen/src/runtime/dispatch.ts` — Field deserialization bug fixed (`ensureFieldSuffix`)

**Frontend layer: NOT STARTED**
- Routes, sidebar section, pages, hooks, form parts, token search — all pending this plan

Related plan: [09-amm-seeding.md](./09-amm-seeding.md) — covers `SeedLiquidityPanel` in the creator flow.

---

## Feature Scope

| Feature | Transitions | Privacy modes |
|---|---|---|
| Swap | `swap` / `swap_private` | public + private |
| Add Liquidity | `add_liquidity` / `add_liquidity_private` | public + private |
| Remove Liquidity | `remove_liquidity` / `remove_liquidity_private` | public + private |
| Pool creation | atomic via `add_liquidity` or `add_liquidity_private` with `fee_bps` | **both public and private** |
| AMM Seeding | `seed_liquidity` from creator manage page | public (CPI) |

Pool creation is verified atomic in `contracts/dex/fairswap_dex/src/main.leo:385-398` for
`add_liquidity` and `main.leo:498-512` for `add_liquidity_private`. Both transitions check
`if !pools.contains(pool_key)` and create the pool inline. `fee_bps` is silently ignored if the
pool already exists.

**Not in scope**: protocol fee governance (`update_fee`, `toggle_protocol_fee`, `toggle_paused`), analytics charts (see 11-analytics-page.md).

---

## Routes

Add to `src/config/app.routes.ts`:

```ts
// DEX / Exchange
dex:          '/dex',            // Swap page (landing)
dexLiquidity: '/dex/liquidity',  // Add / Remove liquidity
dexPoolNew:   '/dex/pool/new',   // Create a new pool
```

Add helper (same file):

```ts
/** Deep link to swap page with pre-selected pair (used from auction pages, token manager). */
export function dexSwapUrl(tokenInId?: string, tokenOutId?: string): string {
  const params = new URLSearchParams();
  if (tokenInId)  params.set('in',  tokenInId);
  if (tokenOutId) params.set('out', tokenOutId);
  const qs = params.size ? `?${params}` : '';
  return `/dex${qs}`;
}
```

Register in `App.tsx` (import from `features/dex/pages/`):

```tsx
<Route path="/dex"           element={<SwapPage />} />
<Route path="/dex/liquidity" element={<LiquidityPage />} />
<Route path="/dex/pool/new"  element={<CreatePoolPage />} />
```

---

## Sidebar — Collapsible Groups

### Problem

Adding an Exchange section brings the sidebar to 6 groups and ~21 items. A flat uncollapsible list wastes vertical space and makes it harder to find the section you use most.

### Solution: `NavGroupCollapsible`

`Collapsible`, `CollapsibleTrigger`, `CollapsibleContent` are exported from `@/components`
(confirmed via `src/components/index.ts:32-34`).

Add alongside the existing `NavGroup` in `AppSidebar.tsx`:

```tsx
// Imports to add:
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components';

function sidebarGroupKey(label: string): string {
  return `sidebar-group-${label.toLowerCase()}`;
}

function NavGroupCollapsible({
  label,
  items,
  defaultOpen = true,
}: {
  label:        string;
  items:        NavItem[];
  defaultOpen?: boolean;
}) {
  const { isMobile, setOpenMobile } = useSidebar();
  const storageKey = sidebarGroupKey(label);

  const [open, setOpen] = useState<boolean>(() => {
    const stored = localStorage.getItem(storageKey);
    return stored !== null ? stored === 'true' : defaultOpen;
  });

  const toggle = () =>
    setOpen((prev) => {
      localStorage.setItem(storageKey, String(!prev));
      return !prev;
    });

  const handleNavClick = () => { if (isMobile) setOpenMobile(false); };

  return (
    <Collapsible open={open} onOpenChange={toggle}>
      <SidebarGroup className="px-2 py-1">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="group flex w-full items-center justify-between px-2 pb-2"
          >
            <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground/75 transition-colors group-hover:text-muted-foreground">
              {label}
            </span>
            <ChevronRight
              className={cn(
                'size-3 text-muted-foreground/50 transition-transform duration-200',
                open ? 'rotate-90' : 'rotate-0',
              )}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {/* inner SidebarMenuItem + NavLink + SidebarMenuButton block is
                  identical to NavGroup — copy verbatim from that component */}
              {items.map(({ label: name, to, icon: Icon, end }) => (
                <SidebarMenuItem key={to}>
                  <NavLink to={to} end={end} className="block w-full" onClick={handleNavClick}>
                    {({ isActive }) => (
                      <SidebarMenuButton
                        isActive={isActive}
                        className={cn(
                          'group relative h-11 w-full rounded-xl border border-transparent px-2.5 transition-[border-color,background-color,box-shadow,transform] duration-200',
                          'hover:border-sky-500/10 hover:bg-sidebar-accent/45 hover:shadow-xs',
                          isActive && 'border-sky-500/12 bg-gradient-to-r from-sky-500/14 via-sky-400/8 to-transparent text-sidebar-foreground shadow-xs ring-1 ring-white/5',
                        )}
                      >
                        <span className={cn('absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-sky-400 transition-opacity', isActive ? 'opacity-100' : 'opacity-0')} />
                        <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-lg border transition-[border-color,background-color,color]', isActive ? 'border-sky-500/14 bg-sky-500/10 text-sky-300' : 'border-sidebar-border/60 bg-sidebar-accent/25 text-sidebar-foreground/70 group-hover:border-sky-500/10 group-hover:bg-sky-500/6')}>
                          <Icon className="size-4 shrink-0" />
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{name}</span>
                        <ChevronRight className={cn('size-4 shrink-0 text-muted-foreground/60 transition-all duration-200', isActive ? 'translate-x-0 text-sky-300/90 opacity-100' : 'translate-x-[-2px] opacity-0 group-hover:translate-x-0 group-hover:opacity-100')} />
                      </SidebarMenuButton>
                    )}
                  </NavLink>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  );
}
```

### Exchange nav items

`ArrowLeftRight` and `Droplets` are available in `lucide-react`. `PlusCircle` is already imported.

```ts
const EXCHANGE: NavItem[] = [
  { label: 'Swap',      to: AppRoutes.dex,          icon: ArrowLeftRight, end: true },
  { label: 'Liquidity', to: AppRoutes.dexLiquidity,  icon: Droplets },
  { label: 'New Pool',  to: AppRoutes.dexPoolNew,    icon: PlusCircle },
];
```

### Updated `<SidebarContent>`

```tsx
<SidebarContent className="gap-1 px-1 pb-2">
  <NavGroupCollapsible label="Overview"  items={OVERVIEW}  defaultOpen={true} />
  <SidebarSeparator className="mx-3 bg-sky-500/8" />
  <NavGroupCollapsible label="Auctions"  items={AUCTIONS}  defaultOpen={true} />
  <SidebarSeparator className="mx-3 bg-sky-500/8" />
  <NavGroupCollapsible label="Finance"   items={FINANCE}   defaultOpen={true} />
  <SidebarSeparator className="mx-3 bg-sky-500/8" />
  <NavGroupCollapsible label="Exchange"  items={EXCHANGE}  defaultOpen={true} />
  <SidebarSeparator className="mx-3 bg-sky-500/8" />
  <NavGroupCollapsible label="Tools"     items={TOOLS}     defaultOpen={true} />
</SidebarContent>
```

`NavGroup` (non-collapsible) remains for Resources in the footer — one item, no congestion risk.

---

## Token Discovery

### Problem

Asking users to paste a raw `field` ID is unusable. Token search must surface tokens from:
1. The user's own wallet holdings (immediate relevance)
2. Verified/popular tokens from the API (discovery)
3. Manual field ID lookup as a power-user escape hatch

### `TokenDisplay` interface

Both `TokenMetadata` (from `@fairdrop/types/domain`) and well-known tokens share a minimum
display shape. Define this interface to avoid union-type property errors:

```ts
// src/config/well-known-tokens.ts

/** Minimum token shape required for display in TokenChip, PoolStatsCard, etc. */
export interface TokenDisplay {
  tokenId:  string;  // plain string — matches TokenInfo.tokenId, PoolState.tokenA, WalletTokenRecord.token_id
  symbol:   string;
  name:     string;
  decimals: number;
  logoUrl:  string | null;
  verified: boolean;
}

/** Pinned tokens always shown at the top of the token picker. */
export const WELL_KNOWN_TOKENS: TokenDisplay[] = [
  {
    tokenId:  CREDITS_RESERVED_TOKEN_ID,  // from @fairdrop/sdk/credits
    symbol:   'ALEO',
    name:     'Aleo Credits',
    decimals: 6,
    logoUrl:  null,
    verified: true,
  },
];
```

`TokenMetadata` satisfies `TokenDisplay` — it has all required fields (`tokenId`, `symbol`,
`name`, `decimals`, `logoUrl`, `verified`). Use `TokenDisplay` in all component props. Only
upgrade to `TokenMetadata` where off-chain fields (`website`, `tags`, `totalSupply`) are needed.

> **Warning**: `TokenInfo` (confirmed from `packages/types/src/domain/token.ts`) does NOT satisfy
> `TokenDisplay`. `TokenInfo` has no `logoUrl` and no `verified` field. Only `TokenMetadata extends
> TokenInfo` adds those. Never widen a `TokenMetadata` to `TokenInfo` and pass it where
> `TokenDisplay` is expected — the compiler will reject it.

### `useTokenSearch(query)` hook

New file `src/shared/hooks/useTokenSearch.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { tokensService } from '@/services/tokens.service';

export function useTokenSearch(query: string) {
  return useQuery({
    queryKey:        ['token-search', query],
    queryFn:         () => tokensService.list({ query: query.trim(), pageSize: 20 }),
    enabled:         query.trim().length >= 2,  // guard: don't fire on empty / single char
    staleTime:       60_000,
    placeholderData: (prev) => prev,
  });
}
```

### `useVerifiedTokens()` hook

New file `src/shared/hooks/useVerifiedTokens.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { tokensService } from '@/services/tokens.service';
import { WELL_KNOWN_TOKENS, type TokenDisplay } from '@/config/well-known-tokens';
import type { TokenMetadata } from '@fairdrop/types/domain';

export function useVerifiedTokens() {
  return useQuery({
    queryKey:  ['tokens', 'verified'],
    queryFn:   () => tokensService.list({ verified: true, pageSize: 30 }),
    staleTime: 5 * 60_000,
    select:    (data): TokenDisplay[] => {
      // Merge well-known tokens at top, deduplicate by tokenId
      const apiIds = new Set(data.items.map((t: TokenMetadata) => t.tokenId));
      const pinned = WELL_KNOWN_TOKENS.filter((t) => !apiIds.has(t.tokenId));
      return [...pinned, ...data.items];
    },
  });
}
```

`Page<TokenMetadata>` confirmed to have `items: T[]` (see `packages/types/src/api/pagination.ts`).

### `TokenSearchCombobox` shared component

Location: `src/shared/components/dex/TokenSearchCombobox.tsx`

Placed in `shared/components/` — token search may be useful in other features.

```ts
interface TokenSearchComboboxProps {
  token:    TokenDisplay | null;   // full object, not just tokenId string
  onChange: (token: TokenDisplay) => void;
  exclude?: string | null;         // tokenId to exclude (the "other" token in a pair)
  label?:   string;
  disabled?: boolean;
}
```

**Why `token: TokenDisplay | null` not `value: string | null`**: rendering the selected `TokenChip`
in the trigger requires the full metadata (symbol, logo). Passing only a string would require
an internal `useTokenInfo(tokenId)` call per combobox instance, adding latency and extra queries.
The parent owns selection state as a `TokenDisplay` object.

Internals — uses `Command`, `CommandInput`, `CommandList`, `CommandGroup`, `CommandItem`,
`Popover`, `PopoverContent`, `PopoverTrigger` (all confirmed in `src/components/index.ts`):

```tsx
// Three CommandGroup sections:
// 1. "Your Tokens" — useTokenRecords() items, only when wallet connected,
//    filtered to unspent records, deduplicated by token_id
// 2. "Popular" — useVerifiedTokens() items
// 3. "Results" — useTokenSearch(query) items, only when query.length >= 2

// Field ID escape hatch:
// if (/^\d+field$/.test(query.trim())) show a "Look up <query>" CommandItem
// that resolves via useTokenInfo(query.trim()) on selection

// Exclude the "exclude" tokenId from all three sections
```

### `TokenChip` component

Location: `src/shared/components/dex/TokenChip.tsx`

```ts
interface TokenChipProps {
  token:    TokenDisplay | null;
  size?:    'sm' | 'md';
  loading?: boolean;
}
```

Renders: circular logo (fallback to first-letter monogram) + symbol + verified checkmark if
`token.verified`. When `token` is null: "Select token" placeholder with muted styling.

---

## Form Pattern

Follow `AscendingBidForm.tsx` + `_parts.tsx` exactly.

### Shared extraction: `PrivacyModeToggle`

`BidModeToggle` (in `features/auctions/bid-forms/_parts.tsx`) and the DEX mode toggle are
structurally identical (private/public with Shield/Eye icons, same className pattern). Extract:

**New file**: `src/shared/components/PrivacyModeToggle.tsx`

```tsx
interface PrivacyModeToggleProps {
  mode:     'private' | 'public';
  onChange: (mode: 'private' | 'public') => void;
}

export function PrivacyModeToggle({ mode, onChange }: PrivacyModeToggleProps) {
  // Render identical to BidModeToggle — copy the two-button grid from _parts.tsx
}
```

Update `features/auctions/bid-forms/_parts.tsx` to re-export with alias (no behavioral change):

```ts
export { PrivacyModeToggle as BidModeToggle } from '@/shared/components/PrivacyModeToggle';
```

### `features/dex/forms/_parts.tsx`

DEX-specific primitives (mirrors bid-forms pattern). All props are fully typed — no `any`:

```
TokenRecordSelect      — select a WalletTokenRecord for private swap/add-liquidity paths
LpRecordSelect         — select a WalletLpRecord for private remove-liquidity path
SwapPreviewPanel       — rate, price impact, min received (SummaryRow[])
LiquidityPreviewPanel  — LP to mint / expected amounts (SummaryRow[])
DexSubmitButton        — busy/waiting states
DexErrorBanner         — error string display
DexFormBlockerNotice   — blocker message (not connected, no records, etc.)
```

`type SummaryRow = [label: string, value: string] | null | false | undefined` — same as bid forms.

Price impact row in `SwapPreviewPanel` is color-coded per impact value:
- `< 1%` → `text-emerald-400`
- `1–5%` → `text-amber-400`
- `> 5%` → `text-destructive`

---

## Private Path UX — Critical Structural Difference

**Confirmed from the Leo contract** (`main.leo:458`, `main.leo:986-994`):

In all private transitions the **entire record amount is consumed** — there is no partial spend:
- `swap_private`: the full `token_in.amount` is swapped. `amount_out` is the snapshot of expected output.
- `add_liquidity_private`: both `record_a.amount` and `record_b.amount` are deposited in full.
- `remove_liquidity_private`: the full `lp.amount` is burned.

**UX consequence**: private forms do NOT have an amount input. Mode switching hides the amount
field and shows a record selector instead. The amount shown is the record's balance, displayed
read-only as context for the preview panel.

```
Public mode:   [Amount input] → user types → preview updates
Private mode:  [Record selector] → user picks record → preview shows record.amount read-only
```

Private add-liquidity edge case: the user must pick two records. Both are fully consumed. If the
ratio between the two records does not match the pool ratio, the excess of one is wasted (returned
as zero-dust record). The preview should show this: "~X tokenA + ~Y tokenB based on pool ratio —
excess returned as dust."

### Private add-liquidity can create a new pool

Confirmed from `main.leo:498-512`: `add_liquidity_private` also has the `if !pools.contains(pool_key)`
atomic creation block. Both public and private paths support first-liquidity deposits. When
`pool === null`, show the fee tier selector in **both** modes.

---

## Generated Client: Correct Usage

### `TransitionHandle` return type

Confirmed from `packages/leo-abigen/src/runtime/transition.ts:10-13`:

```ts
export interface TransitionHandle<A> {
  (args: A, opts?: TxOptions): Promise<string>;   // returns txId directly
  build(args: A, opts?: TxOptions): TransactionOptions;
}
```

The executor mode returns `Promise<string>` (the transaction ID). It **throws** on failure
(`transition.ts:40`). There is no `{ transactionId: string } | undefined` wrapper — that is
the raw wallet adapter shape, not the generated client shape.

**Correct usage in forms:**

```ts
// ✓ correct — guard first, client returns string directly
if (!client || !tokenIn || !tokenOut || !address) return undefined;
const txId = await client.swap({ token_in_id: tokenIn, ... });
return txId;  // Promise<string> — client throws if wallet returns undefined

// ✗ wrong — result is already a string, not { transactionId: string }
const result = await client.swap({ ... });
if (!result?.transactionId) throw new Error('...');
return result.transactionId;
```

### Amount serialization rules

The generated client serializes all non-record inputs automatically using the ABI type definition,
confirmed from `packages/leo-abigen/src/runtime/transition.ts:27`:
`serializeInputs(args as Record<string, unknown>, fn.inputs, structs)`.
Pass raw JS values — **never manually add Leo type suffixes**:

| Value | What to pass | Serializer output |
|---|---|---|
| Token amount | `String(rawIn)` — decimal string, no suffix | appends `u128` → `"1000u128"` |
| Token ID | `tokenIn as Field` — `tokenIn` is `string`; one inline cast | `ensureFieldSuffix` (no-op if already has `field` suffix) |
| Address | `address` — string from wallet | `String(value)` → identity |
| Record (private) | `record._record` — raw plaintext | passed through unchanged |

**Never manually append suffixes** — `"1000u128"` for a U128 becomes `"1000u128u128"` (double suffix).

**TypeScript brands**: `Field`, `U128`, `Address` are compile-time only (no runtime effect).
Token IDs throughout the codebase are plain `string` (`TokenInfo.tokenId`, `PoolState.tokenA`,
`WalletTokenRecord.token_id`, `CREDITS_RESERVED_TOKEN_ID` — all confirmed as `string`). Use
inline `as` casts at the single point of passing to the generated client:

```ts
token_in_id:  tokenIn  as Field,    // string → branded, no runtime effect
token_out_id: tokenOut as Field,
amount_in:    String(rawIn) as U128, // bigint → decimal string, then branded
recipient:    address as Address,    // wallet returns string | null, narrowed to string
```

**Avoid `!` (non-null assertion)** — use explicit null guards in `execute`. The return type of
`SequentialStep.execute` is `Promise<string | undefined>` (confirmed from
`useConfirmedSequentialTx.ts:10`), so returning `undefined` on a failed guard is valid.

### `PoolState` naming — two types, one name

`chain.ts` exports camelCase `PoolState` with bigint amounts (JS-native, for UI use).
The generated `fairswap-dex-v2.ts` also exports snake_case `PoolState` with `U128` strings.
The `@fairdrop/sdk/dex` barrel re-exports only the chain version.

**Rule**: always use `fetchPool()` for pool state reads — never `client.pools()` directly.
`fetchPool` returns the camelCase bigint `PoolState`; `client.pools()` returns the snake_case
string version and would require manual parsing.

### `!client` in formBlocker

`useDexClient()` returns `null` when wallet is disconnected. All form `formBlocker` conditions
must include `!client`:

```ts
const formBlocker = useMemo(() => {
  if (!connected) return 'Connect your wallet.';
  if (!client)    return 'Wallet not ready.';   // ← required
  // ...other checks
}, [connected, client, ...]);
```

---

## Swap Direction Utility

`computeSwapOutput` takes flat args `(reserveIn, reserveOut, amountIn, feeBps)`, not a pool object.
Since `PoolState.tokenA` is the canonical lesser token (confirmed from `main.leo:68, keys.ts:195-199`),
direction is determined by comparing `tokenIn` to `pool.tokenA`.

Add to `src/features/dex/utils/format.ts`:

```ts
import type { PoolState } from '@fairdrop/sdk/dex';

/**
 * Extract the correct reserve pair for a swap direction.
 * pool.tokenA is the canonical lesser token.
 */
export function getSwapDirection(
  pool:    PoolState,
  tokenIn: string,
): { reserveIn: bigint; reserveOut: bigint } {
  const isAIn = tokenIn === pool.tokenA;
  return {
    reserveIn:  isAIn ? pool.reserveA : pool.reserveB,
    reserveOut: isAIn ? pool.reserveB : pool.reserveA,
  };
}

/**
 * Price impact as a percentage (0–100).
 * spot_before = reserveOut / reserveIn
 * spot_after  = (reserveOut - amountOut) / (reserveIn + amountIn)
 * impact      = (spot_before - spot_after) / spot_before * 100
 *
 * Returns a number for display (e.g. 0.42 = "0.42%").
 * Uses scaled integer arithmetic to avoid floating-point during comparison.
 */
export function computePriceImpact(
  reserveIn:  bigint,
  reserveOut: bigint,
  amountIn:   bigint,
  amountOut:  bigint,
): number {
  if (reserveIn === 0n || reserveOut === 0n) return 0;
  // Guard: amountOut >= reserveOut would drain the pool entirely; bigint subtraction
  // wraps to a huge positive number instead of throwing. Return 100% impact.
  if (amountOut >= reserveOut) return 100;
  const SCALE = 1_000_000n;
  const spotBefore = (reserveOut * SCALE) / reserveIn;
  const spotAfter  = ((reserveOut - amountOut) * SCALE) / (reserveIn + amountIn);
  if (spotBefore === 0n) return 0;
  return Number((spotBefore - spotAfter) * 10_000n / spotBefore) / 100;
}

/** Format price impact for display with color class. */
export function formatPriceImpact(impact: number): { text: string; className: string } {
  const text = `${impact.toFixed(2)}%`;
  const className =
    impact < 1   ? 'text-emerald-400' :
    impact < 5   ? 'text-amber-400'   :
    'text-destructive';
  return { text, className };
}
```

**Usage in `SwapForm`:**

```ts
import { computeSwapOutput, applySlippage } from '@fairdrop/sdk/dex';
import { getSwapDirection, computePriceImpact } from '../utils/format';
import { parseTokenAmount, formatAmount } from '@fairdrop/sdk/format';

// Derived (inside useMemo):
const rawIn              = parseTokenAmount(amountIn, tokenInMeta?.decimals ?? 6);
const { reserveIn, reserveOut } = pool && tokenIn
  ? getSwapDirection(pool, tokenIn)
  : { reserveIn: 0n, reserveOut: 0n };
const preview            = pool && rawIn > 0n ? computeSwapOutput(reserveIn, reserveOut, rawIn, pool.feeBps) : null;
const minOut             = preview ? applySlippage(preview, slippageBps) : 0n;
const impact             = preview ? computePriceImpact(reserveIn, reserveOut, rawIn, preview) : null;
```

---

## `WalletLpRecord` Type

Add to `packages/types/src/primitives/wallet.ts`:

```ts
/**
 * Runtime-parsed LpToken record from fairswap_dex_v2.aleo.
 * Produced by useLpTokenRecords after parsing the U128 amount to bigint.
 */
export interface WalletLpRecord {
  id:       string;   // set to r._record — createRecordScanner does not expose commitment
  poolKey:  string;   // field string with "field" suffix — matches LpToken.pool_key
  amount:   bigint;   // parsed from U128 string via BigInt(record.amount)
  spent:    boolean;
  _record:  string;   // original plaintext — pass as transition input
}
```

---

## Data Hooks

### `useDexClient()`

```ts
// src/features/dex/hooks/useDexClient.ts
import { useMemo } from 'react';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { createFairswapDexV2, type FairswapDexV2 } from '@fairdrop/sdk/dex';

export function useDexClient(): FairswapDexV2 | null {
  const { executeTransaction } = useWallet();
  return useMemo(
    () => executeTransaction ? createFairswapDexV2({ executeTransaction }) : null,
    [executeTransaction],
  );
}
```

**Default fee**: `createFairswapDexV2({ executeTransaction })` uses the `createAbigen` default of
`300_000` microcredits (confirmed from `packages/leo-abigen/src/runtime/client.ts:22-23`:
`fee: config.fee ?? 300_000`). To override on a per-call basis pass `opts: { fee: TX_DEFAULT_FEE }`
as the second argument to any transition:

```ts
if (!client) return undefined;
const txId = await client.swap({ ... }, { fee: TX_DEFAULT_FEE });
```

`TX_DEFAULT_FEE` is from `@/env` (confirmed from `apps/frontend/src/env.ts:34`):
`export const TX_DEFAULT_FEE = Number(requireEnv('VITE_FEE'))`. If the env-configured fee already
matches 300,000 microcredits no override is needed; verify during implementation.

### `usePool(tokenA, tokenB)`

```ts
// src/features/dex/hooks/usePool.ts
import { useQuery } from '@tanstack/react-query';
import { fetchPool, type PoolState } from '@fairdrop/sdk/dex';

export function usePool(tokenA: string | null, tokenB: string | null) {
  return useQuery<PoolState | null>({
    queryKey:  ['dex', 'pool', tokenA, tokenB],
    queryFn:   () => fetchPool(tokenA!, tokenB!),
    enabled:   !!tokenA && !!tokenB,
    staleTime: 10_000,
    retry:     false,  // null return = pool does not exist, not retryable
  });
}
```

### `useLpBalance(address, poolKey)`

```ts
// src/features/dex/hooks/useLpBalance.ts
import { useQuery } from '@tanstack/react-query';
import { fetchLpBalance } from '@fairdrop/sdk/dex';

export function useLpBalance(address: string | null, poolKey: string | null) {
  return useQuery<bigint | null>({
    queryKey:  ['dex', 'lp-balance', address, poolKey],
    queryFn:   () => fetchLpBalance(address!, poolKey!),
    enabled:   !!address && !!poolKey,
    staleTime: 30_000,
    // No initialData — let data be undefined while loading so the UI can show a skeleton
    // rather than "0" (which looks like a real balance before the fetch completes)
  });
}
```

### `useLpTokenRecords()`

`scanLpTokenRecords` returns `LpTokenRecord[]` where `amount: U128` is a branded decimal string
(e.g. `"1000"`), confirmed from `fairswap-dex-v2.ts:26-32` and `scalars.ts:28`.
Convert to `bigint` with `BigInt(record.amount)`.

```ts
// src/features/dex/hooks/useLpTokenRecords.ts
import { useMemo } from 'react';
import { useWalletRecords } from '@/shared/hooks/useWalletRecords';
import { PROGRAMS } from '@fairdrop/config';
import { scanLpTokenRecords } from '@fairdrop/sdk/dex';
import type { WalletLpRecord } from '@fairdrop/types/primitives';

export function useLpTokenRecords(): { records: WalletLpRecord[]; loading: boolean } {
  const { entries, loading } = useWalletRecords(PROGRAMS.fairswap.programId);

  const records = useMemo<WalletLpRecord[]>(() => {
    return scanLpTokenRecords(entries).map((r) => ({
      id:       r._record,  // _record is the unique plaintext string — owner is wallet address (same for all records)
      poolKey:  r.pool_key, // Field string — carries "field" suffix
      amount:   BigInt(r.amount),  // U128 decimal string → bigint
      spent:    r.spent,
      _record:  r._record,
    }));
  }, [entries]);

  return { records, loading };
}
```

Note: `LpTokenRecord.owner` (confirmed from `packages/sdk/src/contracts/fairswap-dex-v2.ts:26-32`)
is the wallet `Address` — the same value for every record the wallet owns. It is NOT a unique
per-record identifier. `createRecordScanner` (confirmed from
`packages/leo-abigen/src/runtime/records.ts`) does NOT expose the commitment. The safest unique
key is `r._record` (the raw record plaintext string), which is already required as the transition
input. `WalletLpRecord.id` is set to `r._record`.

### `useTokenInfo` in pages — pass as props, not per-form queries

Pages (`SwapPage`, `LiquidityPage`) already call `useTokenInfo` for `PoolStatsCard` and
`TokenPairDisplay`. If forms also call `useTokenInfo` for the same token IDs, TanStack Query
deduplicates the network request (same query key), but the hook is still invoked twice, creating
unnecessary coupling and a potential stale-data race if one call resolves before the other.

**Pattern**: pages own the `TokenDisplay` objects and pass them as props:

```ts
// SwapPage (already owns these for PoolStatsCard):
const { data: tokenInMeta  } = useTokenInfo(tokenIn  ?? undefined);
const { data: tokenOutMeta } = useTokenInfo(tokenOut ?? undefined);

// Pass down — forms receive TokenDisplay | null | undefined, no internal query:
<SwapForm
  tokenInMeta={tokenInMeta ?? null}
  tokenOutMeta={tokenOutMeta ?? null}
  ...
/>
```

Forms then use the passed metadata directly:
```ts
const rawIn = parseTokenAmount(amountIn, tokenInMeta?.decimals ?? 6);
```

`parseTokenAmount` is confirmed exported from `@fairdrop/sdk/format` (see `src/format/index.ts:7`).
Same pattern applies to `AddLiquidityForm` and `RemoveLiquidityForm`.

---

## Folder Structure

```
src/shared/components/
├── dex/
│   ├── TokenSearchCombobox.tsx    # NEW — token picker: search + wallet holdings + field ID
│   └── TokenChip.tsx              # NEW — TokenDisplay chip (logo + symbol)
└── PrivacyModeToggle.tsx          # NEW — extracted from bid-forms/_parts.tsx

src/shared/hooks/
├── useTokenSearch.ts              # NEW — tokensService.list({ query }) with enabled guard
└── useVerifiedTokens.ts           # NEW — verified token list + well-known seed

src/config/
└── well-known-tokens.ts           # NEW — TokenDisplay interface + WELL_KNOWN_TOKENS

src/features/dex/
├── pages/
│   ├── SwapPage.tsx               # /dex
│   ├── LiquidityPage.tsx          # /dex/liquidity
│   └── CreatePoolPage.tsx         # /dex/pool/new
├── forms/
│   ├── _parts.tsx                 # DEX form primitives
│   ├── SwapForm.tsx
│   ├── AddLiquidityForm.tsx
│   └── RemoveLiquidityForm.tsx
├── components/
│   ├── TokenPairDisplay.tsx       # Two TokenChips + ArrowLeftRight — editable pair picker
│   ├── PoolStatsCard.tsx          # MetricCard grid: reserves, fee, spot price
│   ├── LpPositionCard.tsx         # LP balance + % share of pool
│   └── SlippageSettings.tsx       # Popover slippage selector
├── hooks/
│   ├── usePool.ts
│   ├── useLpBalance.ts
│   ├── useLpTokenRecords.ts
│   └── useDexClient.ts
└── utils/
    └── format.ts                  # getSwapDirection, computePriceImpact, formatPriceImpact,
                                   # formatLpAmount, formatPoolPrice

src/features/creator/
├── components/
│   └── SeedLiquidityPanel.tsx     # Currently commented out in AuctionManagePage.tsx:117
└── hooks/
    └── useSeedLiquidity.ts
```

---

## Component Specifications

### `SlippageSettings`

Controlled: `value: number` (bps) + `onChange: (bps: number) => void`. No internal state.
Renders as `Settings2` ghost `Button` → `Popover` with three preset buttons (50, 100, 200 bps) +
custom number `Input`. `Popover` confirmed in `src/components/index.ts:151-157`.

### `TokenPairDisplay`

Renders two `TokenChip` components (size="md") with `ArrowLeftRight` icon between them.
Props:
```ts
interface TokenPairDisplayProps {
  tokenA:         TokenDisplay | null;
  tokenB:         TokenDisplay | null;
  onChangeTokenA: (t: TokenDisplay) => void;
  onChangeTokenB: (t: TokenDisplay) => void;
}
```
Each chip is a button that opens its own `TokenSearchCombobox`. The `exclude` prop on each
combobox is set to the other token's ID to prevent selecting the same token on both sides.

### `PoolStatsCard`

```ts
interface PoolStatsCardProps {
  pool:     PoolState | null;  // camelCase chain PoolState from fetchPool
  tokenA:   TokenDisplay | null;
  tokenB:   TokenDisplay | null;
  loading?: boolean;
}
```

Uses `MetricCard` grid. Metrics: Reserve A, Reserve B, Fee, Spot Price, LP Supply. Shows
`Skeleton` components when `loading` is true.

### `SwapForm`

**State ownership**: `tokenIn` and `tokenOut` must be owned by `SwapPage`, not by `SwapForm`.
`SwapPage` calls `usePool(tokenIn, tokenOut)` and shares `pool` as a prop, so it must already hold
these values. Keeping them inside `SwapForm` would create a conflict: `SwapPage` cannot call
`usePool` without the token IDs, but it would not have them until `SwapForm` lifts them back up.

SwapForm **props**: `tokenIn: string | null`, `tokenOut: string | null`,
`onChangeTokenIn: (token: TokenDisplay) => void`,
`onChangeTokenOut: (token: TokenDisplay) => void`,
`pool: PoolState | null`, `poolLoading: boolean`, `slippageBps: number`,
`tokenInMeta: TokenDisplay | null`, `tokenOutMeta: TokenDisplay | null`.

`tokenIn`/`tokenOut` are plain `string | null` — `TokenDisplay.tokenId` is `string` (matching
`TokenInfo.tokenId: string`). The `as Field` cast is applied only at the generated client call site.

SwapForm **internal state**: `amountIn: string`, `mode: 'private' | 'public'`,
`selectedRecordId: string`, `recordTouched: boolean`, `amountTouched: boolean`.

**Internal wallet state** (not props — confirmed from `AscendingBidForm.tsx:30` pattern):
```ts
const { connected, address } = useWallet();
const client = useDexClient();  // internally calls useWallet() for executeTransaction
```

Public mode input: `TokenAmountInput` for `amountIn` with `max={publicBalance ?? undefined}`.
Private mode input: `TokenRecordSelect` showing records for `tokenIn` filtered from
`useTokenRecords()`. Filter: `records.filter(r => !r.spent && r.token_id === tokenIn)`.
`WalletTokenRecord.token_id` is snake_case (confirmed `wallet.ts:48`). No amount input — record
amount shown read-only in `SwapPreviewPanel`.

**Public path submit:**
```ts
steps = [{
  label:   `Swap ${tokenInMeta?.symbol} → ${tokenOutMeta?.symbol}`,
  execute: async () => {
    if (!client || !tokenIn || !tokenOut || !address || !pool || rawIn <= 0n) return undefined;
    const txId = await client.swap({
      token_in_id:  tokenIn  as Field,         // string → branded; ensureFieldSuffix handles suffix
      token_out_id: tokenOut as Field,
      amount_in:    String(rawIn) as U128,
      min_out:      String(minOut) as U128,
      recipient:    address as Address,
    });
    return txId;
  },
}];
```

**Private path submit:**
```ts
steps = [{
  label:   `Private Swap ${tokenInMeta?.symbol} → ${tokenOutMeta?.symbol}`,
  execute: async () => {
    if (!client || !tokenOut || !address || !selectedRecord || !pool || preview === null) return undefined;
    const txId = await client.swapPrivate({
      token_in:     selectedRecord._record,
      token_out_id: tokenOut as Field,
      amount_out:   String(preview) as U128,
      min_out:      String(minOut) as U128,
      recipient:    address as Address,
    });
    return txId;
  },
}];
```

In private mode, `rawIn = BigInt(selectedRecord.amount)` (full record amount, not from input).
`preview = pool ? computeSwapOutput(reserveIn, reserveOut, rawIn, pool.feeBps) : null`.

`formBlocker` checks: `!connected`, `!client`, `!tokenIn`, `!tokenOut`, `!pool`, public: `rawIn <= 0n || insufficient balance`, private: `!selectedRecord`.

Uses `useConfirmedSequentialTx(steps)` → `{ done, busy, isWaiting, error, advance, reset }`.

### `AddLiquidityForm`

**Props**: `tokenA: string | null`, `tokenB: string | null`, `tokenAMeta: TokenDisplay | null`,
`tokenBMeta: TokenDisplay | null`, `pool: PoolState | null`, `poolLoading: boolean`,
`slippageBps: number` — all lifted from `LiquidityPage`. `tokenA`/`tokenB` are `string | null`;
`as Field` cast applied only at the generated client call site.

**Internal state**: `amountA: string`, `amountB: string`, `feeBps: number`, `mode`, `recordAId: string`, `recordBId: string`

**Internal wallet state**: `const { connected, address } = useWallet()` + `const client = useDexClient()` — called inside the form, not props.

`amountB` is independent state (not just derived) because:
- **Existing pool**: derived read-only from `computeAddLiquidityAmounts` — form shows it read-only
- **New pool** (`pool === null`): `computeAddLiquidityAmounts` returns `{ amountB: 0n }` when
  `lpSupply === 0n` (confirmed from `math.ts:68-71`). The user sets the initial price by entering
  both amounts independently. Show two `TokenAmountInput` fields; show fee tier selector.

When `pool === null`: show fee tier selector in both modes (both public and private support
atomic pool creation — confirmed from contract).

Public mode — existing pool: `amountA` input → `computeAddLiquidityAmounts(pool.reserveA, pool.reserveB, pool.lpSupply, rawA)` → derived `amountB` shown read-only. Both token balances checked.

Public mode — new pool: two independent `TokenAmountInput` fields; no derived amount. Fee tier selector visible. User sets initial ratio.

Private mode: two `TokenRecordSelect` components (one for tokenA records, one for tokenB records from `useTokenRecords()`, filtered by `token_id`). No amount inputs — record amounts are the deposit.

```ts
const rawA = selectedRecordA ? BigInt(selectedRecordA.amount) : 0n;
const rawB = selectedRecordB ? BigInt(selectedRecordB.amount) : 0n;
```

**Canonical amount mapping** (confirmed from `contracts/dex/fairswap_dex/src/main.leo:518-519`):
the contract re-sorts the two deposited amounts by canonical pair before computing `lp_to_mint`.
`pool.tokenA` is always the canonical lesser token. If `selectedRecordA.token_id !== pool.tokenA`,
swap the amounts before passing to `computeLpToMint`:

```ts
// Canonical sort for lp_to_mint preview
// WalletTokenRecord uses snake_case token_id (confirmed from packages/types/src/primitives/wallet.ts:48)
const isACanonical  = pool ? selectedRecordA?.token_id === pool.tokenA : true;
const canonicalRawA = isACanonical ? rawA : rawB;
const canonicalRawB = isACanonical ? rawB : rawA;

const lpMint = pool
  ? computeLpToMint(pool.reserveA, pool.reserveB, pool.lpSupply, canonicalRawA, canonicalRawB)
  : computeLpToMint(0n, 0n, 0n, rawA, rawB);  // first-liquidity: lpSupply===0n branch
const minLp  = applySlippage(lpMint, slippageBps);
```

> **Note**: `bigintSqrt` and `MIN_LIQUIDITY` are **not exported** from `@fairdrop/sdk/dex`
> (confirmed from `packages/sdk/src/dex/math.ts`). For first-liquidity preview, use
> `computeLpToMint(0n, 0n, 0n, rawA, rawB)` which internally hits the `lpSupply === 0n` branch
> and returns `bigintSqrt(amountA * amountB) - MIN_LIQUIDITY`.

**Public path submit:**
```ts
// rawA is always from amountA input.
// rawB source differs by pool state:
//   Existing pool: derived from computeAddLiquidityAmounts to maintain ratio
//   New pool:      parsed from independent amountB input (user sets initial price)
const rawA = parseTokenAmount(amountA, tokenAMeta?.decimals ?? 6);
const rawB = pool
  ? computeAddLiquidityAmounts(pool.reserveA, pool.reserveB, pool.lpSupply, rawA).amountB
  : parseTokenAmount(amountB, tokenBMeta?.decimals ?? 6);

if (!client || !tokenA || !tokenB || !address || rawA <= 0n || rawB <= 0n) return undefined;
const txId = await client.addLiquidity({
  token_a_id: tokenA as Field,
  token_b_id: tokenB as Field,
  amount_a:   String(rawA) as U128,
  amount_b:   String(rawB) as U128,
  fee_bps:    feeBps,
  min_lp:     String(minLp) as U128,
  recipient:  address as Address,
});
return txId;
```

`fee_bps` initializes the pool when `pool === null`; silently ignored on-chain when pool exists
but still required by the transition signature.

**Private path submit:**
```ts
if (!client || !selectedRecordA || !selectedRecordB || !address) return undefined;
const txId = await client.addLiquidityPrivate({
  record_a:   selectedRecordA._record,
  record_b:   selectedRecordB._record,
  lp_to_mint: String(lpMint) as U128,
  min_lp:     String(minLp) as U128,
  fee_bps:    feeBps,
  recipient:  address as Address,
});
return txId;
```

### `RemoveLiquidityForm`

**Props**: `tokenA: string | null`, `tokenB: string | null`, `pool: PoolState | null`,
`slippageBps: number` — all lifted from `LiquidityPage`.

**Internal state**: `lpAmountInput: string`, `mode`, `selectedLpRecordId: string`

**Internal wallet state**: `const { connected, address } = useWallet()` + `const client = useDexClient()` — called inside the form, not props.

Public path: `useLpBalance(address, poolKey)` → LP balance. User enters LP amount.
Private path: `useLpTokenRecords()` filtered by `computePoolKey(tokenA, tokenB)`.

```ts
// Filter LP records by the currently-selected pair — pool key is deterministic
const poolKey   = tokenA && tokenB ? computePoolKey(tokenA, tokenB) : null;
const { records: lpRecords } = useLpTokenRecords();
const pairLpRecords = useMemo(
  () => poolKey ? lpRecords.filter(r => r.poolKey === poolKey) : [],
  [lpRecords, poolKey],
);
```

> **WASM requirement**: `computePoolKey` delegates to `hashStruct` → `_bhp.ts`, which imports
> `BHP256` and `Plaintext` from `@provablehq/sdk`. This requires the Provable WASM module to be
> fully initialised before the call. In React, call it inside `useMemo` only — never at module
> load time or in top-level code. If WASM is not yet loaded when the component mounts, `poolKey`
> will be `null` and the filter returns `[]`; this is safe because pool key computation will
> re-run once WASM is ready. The same requirement applies to every call site of `computePoolKey`,
> `computeLpBalKey`, and `computeProtocolFeeKey`.

On-chain, `remove_liquidity_private` validates `lp.pool_key === pool_key` at `main.leo:779`.
The filter above ensures the UI only shows matching records, so this assertion will always pass.

**Private path submit:**
```ts
if (!client || !selectedLpRecord || !pool || !address) return undefined;

const { amountA, amountB } =
  computeRemoveLiquidityAmounts(pool.reserveA, pool.reserveB, pool.lpSupply, selectedLpRecord.amount);
const minA = applySlippage(amountA, slippageBps);
const minB = applySlippage(amountB, slippageBps);

const txId = await client.removeLiquidityPrivate({
  lp:          selectedLpRecord._record,
  token_a_id:  pool.tokenA as Field,     // PoolState.tokenA is string (chain.ts:20); cast to Field
  token_b_id:  pool.tokenB as Field,
  amount_a:    String(amountA) as U128,
  amount_b:    String(amountB) as U128,
  min_a:       String(minA) as U128,
  min_b:       String(minB) as U128,
  recipient:   address as Address,
});
return txId;
```

---

## Page Specifications

### `SwapPage` (`/dex`)

`SlippageSettings` is lifted to page level so it persists across token-pair changes.
`usePool` is lifted to page level so `PoolStatsCard` and `SwapForm` share the same query.

```tsx
<div className="mx-auto max-w-md space-y-4 p-4 sm:p-5 lg:p-6">
  <div className="flex items-center justify-between">
    <h1 className="text-lg font-bold">Swap</h1>
    <SlippageSettings value={slippageBps} onChange={setSlippageBps} />
  </div>
  <Card className="border-sky-500/10 bg-gradient-surface shadow-xs ring-1 ring-white/5">
    <CardContent className="space-y-3 p-4">
      <SwapForm pool={pool} poolLoading={poolLoading} slippageBps={slippageBps} ... />
    </CardContent>
  </Card>
  {pool && <PoolStatsCard pool={pool} tokenA={tokenAMeta} tokenB={tokenBMeta} />}
</div>
```

URL params `?in=<fieldId>&out=<fieldId>` pre-select token pair on mount via `useSearchParams`.

### `LiquidityPage` (`/dex/liquidity`)

Token pair state lifted to page; shared across Add/Remove tabs and `PoolStatsCard`.
`Tabs` confirmed in `src/components/index.ts:220`.

```tsx
<div className="mx-auto max-w-lg space-y-4 p-4 sm:p-5 lg:p-6">
  <div className="flex items-center justify-between">
    <h1 className="text-lg font-bold">Liquidity</h1>
    <SlippageSettings value={slippageBps} onChange={setSlippageBps} />
  </div>
  <TokenPairDisplay tokenA={tokenAMeta} tokenB={tokenBMeta} onChangeTokenA={...} onChangeTokenB={...} />
  <Tabs defaultValue="add">
    <TabsList className="grid w-full grid-cols-2">
      <TabsTrigger value="add">Add</TabsTrigger>
      <TabsTrigger value="remove">Remove</TabsTrigger>
    </TabsList>
    <TabsContent value="add">
      <Card ...><CardContent>
        <AddLiquidityForm pool={pool} tokenA={tokenA} tokenB={tokenB} slippageBps={slippageBps} />
      </CardContent></Card>
    </TabsContent>
    <TabsContent value="remove">
      <Card ...><CardContent>
        <RemoveLiquidityForm pool={pool} tokenA={tokenA} tokenB={tokenB} slippageBps={slippageBps} />
      </CardContent></Card>
    </TabsContent>
  </Tabs>
  {pool && address && <LpPositionCard address={address} pool={pool} tokenA={tokenAMeta} tokenB={tokenBMeta} />}
  {pool && <PoolStatsCard pool={pool} tokenA={tokenAMeta} tokenB={tokenBMeta} />}
</div>
```

### `CreatePoolPage` (`/dex/pool/new`)

Renders `AddLiquidityForm`. When the selected pair has an existing pool (`pool !== null`),
show a notice with a link to `/dex/liquidity?in=...&out=...` instead of the form:
"A pool for this pair already exists — add liquidity instead."

---

## `add_liquidity_cpi_private_in`

The generated client also exposes `addLiquidityCpiPrivateIn` — a simpler private-add variant that
does not need the `lp_to_mint` snapshot (no `amount_out` pre-computation). It is designed for
CPI callers (e.g. auction `seed_liquidity`), not direct wallet use. It does NOT return an LP record
to the signer — LP goes to `recipient` as a public balance entry.

For the user-facing `AddLiquidityForm`, use `addLiquidityPrivate` (returns private `LpToken`
record). `addLiquidityCpiPrivateIn` is used only in `SeedLiquidityPanel` / `seed_liquidity`.

---

## AMM Seeding Integration

See [09-amm-seeding.md](./09-amm-seeding.md) for contract and SDK layer details.

### `useSeedLiquidity(auction, input)`

```ts
// src/features/creator/hooks/useSeedLiquidity.ts
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { useConfirmedSequentialTx } from '@/shared/hooks/useConfirmedSequentialTx';
import { buildSeedLiquidity, type SeedLiquidityInput } from '@fairdrop/sdk/dex';
import type { AuctionView } from '@fairdrop/types/domain';

export function useSeedLiquidity(
  auction: AuctionView | null,
  input:   SeedLiquidityInput | null,
) {
  const { address, executeTransaction } = useWallet();

  const steps = useMemo(() => {
    if (!auction || !input || !address || !executeTransaction) return [];
    return [{
      label:   'Seed Liquidity',
      execute: async () => {
        const spec = buildSeedLiquidity(auction, input);
        const result = await executeTransaction({ ...spec, inputs: spec.inputs as string[] });
        // buildSeedLiquidity uses the deprecated TxSpec builder (not generated client),
        // so executeTransaction is called directly here and returns { transactionId } | undefined.
        if (!result?.transactionId) throw new Error('No transaction ID returned');
        return result.transactionId;
      },
    }];
  }, [auction, input, address, executeTransaction]);

  return useConfirmedSequentialTx(steps);
}
```

Note: `buildSeedLiquidity` returns a `TxSpec` (deprecated builder path, not generated client),
so `executeTransaction` is called directly here, and the return type is `{ transactionId } | undefined`.
The `result?.transactionId` check is correct in this specific case.

### `SeedLiquidityPanel`

Uncomment line 117 in `AuctionManagePage.tsx` once implemented. Pre-flight:
`validateSeedLiquidity(auction, input, address)` before showing submit button. Display validation
errors in a warning card.

---

## Implementation Phases

### Phase 1 — Types and Shared Primitives
1. Add `WalletLpRecord` to `packages/types/src/primitives/wallet.ts`
2. Add `dex`, `dexLiquidity`, `dexPoolNew` to `AppRoutes` + `dexSwapUrl()` helper
3. Create `src/config/well-known-tokens.ts` (`TokenDisplay` interface + ALEO entry)
4. Extract `PrivacyModeToggle` to `src/shared/components/PrivacyModeToggle.tsx`
5. Update `bid-forms/_parts.tsx` to re-export `PrivacyModeToggle as BidModeToggle`

### Phase 2 — Token Search
6. `useTokenSearch.ts` (with `enabled` guard) and `useVerifiedTokens.ts`
7. `TokenChip.tsx`
8. `TokenSearchCombobox.tsx`

### Phase 3 — Sidebar
9. Add `NavGroupCollapsible` to `AppSidebar.tsx` with localStorage persistence
10. Convert all existing `NavGroup` sections to `NavGroupCollapsible`
11. Add Exchange section with `ArrowLeftRight`, `Droplets`, `PlusCircle` icons

### Phase 4 — DEX Utilities and Data Hooks
12. `features/dex/utils/format.ts` — `getSwapDirection`, `computePriceImpact`, `formatPriceImpact`, `formatLpAmount`
13. `usePool.ts`, `useLpBalance.ts`, `useLpTokenRecords.ts` (with `BigInt()` parse), `useDexClient.ts`

### Phase 5 — Form Parts and Display Components
14. `features/dex/forms/_parts.tsx`
15. `TokenPairDisplay.tsx`, `SlippageSettings.tsx`, `PoolStatsCard.tsx`, `LpPositionCard.tsx`

### Phase 6 — Swap Page (public path first)
16. `SwapForm.tsx` — public mode
17. `SwapPage.tsx` — URL params, lifted pool state and slippage
18. Register route in `App.tsx`

### Phase 7 — Liquidity Pages (public path first)
19. `AddLiquidityForm.tsx` — public mode (pool creation case included)
20. `RemoveLiquidityForm.tsx` — public mode
21. `LiquidityPage.tsx` and `CreatePoolPage.tsx` (with existing-pool redirect)
22. Register routes in `App.tsx`

### Phase 8 — Private Paths
23. `SwapForm.tsx` — private mode (record selector, full-amount preview)
24. `AddLiquidityForm.tsx` — private mode (two record selectors, dust warning)
25. `RemoveLiquidityForm.tsx` — private mode (LP record selector filtered by pool key)

### Phase 9 — AMM Seeding
26. `useSeedLiquidity.ts`
27. `SeedLiquidityPanel.tsx`
28. Uncomment `SeedLiquidityPanel` in `AuctionManagePage.tsx:117`

---

## Reuse Checklist

| Need | Component / Hook | Location |
|---|---|---|
| Amount input (bigint max) | `TokenAmountInput` | `src/components/fairdrop/token-amount-input.tsx` |
| Stat display grid | `MetricCard` | `src/components/fairdrop/metric-card.tsx` |
| Tx step progress | `WizardTxStatus` | `src/shared/components/WizardTxStatus.tsx` |
| Multi-step tx + polling | `useConfirmedSequentialTx` | `src/shared/hooks/useConfirmedSequentialTx.ts` |
| Public token balance | `useTokenBalance(tokenId)` | `src/shared/hooks/useTokenBalance.ts` |
| Token records (private Token) | `useTokenRecords()` | `src/shared/hooks/useTokenRecords.ts` |
| Raw wallet records | `useWalletRecords(programId)` | `src/shared/hooks/useWalletRecords.ts` |
| Single token metadata | `useTokenInfo(tokenId)` | `src/shared/hooks/useTokenInfo.ts` |
| Amount parsing | `parseTokenAmount(str, decimals)` | `@fairdrop/sdk/format` |
| Amount formatting | `formatAmount(bigint, decimals)` | `@fairdrop/sdk/format` |
| Pool key derivation | `computePoolKey(tokenA, tokenB)` | `@fairdrop/sdk/dex` |
| Token search (API) | `useTokenSearch(query)` | NEW `src/shared/hooks/useTokenSearch.ts` |
| Verified token list | `useVerifiedTokens()` | NEW `src/shared/hooks/useVerifiedTokens.ts` |
| Privacy mode toggle | `PrivacyModeToggle` | NEW `src/shared/components/PrivacyModeToggle.tsx` |
| Token picker combobox | `TokenSearchCombobox` | NEW `src/shared/components/dex/` |
| Token chip display | `TokenChip` | NEW `src/shared/components/dex/` |
| Collapsible | `Collapsible`, `CollapsibleTrigger`, `CollapsibleContent` | `src/components` barrel |
| Combobox search | `Command`, `CommandInput`, `CommandList`, `CommandGroup`, `CommandItem` | `src/components` barrel |
| Slippage popover | `Popover`, `PopoverContent`, `PopoverTrigger` | `src/components` barrel |
| Tab layout | `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` | `src/components` barrel |
| Card layout | `Card`, `CardContent`, `CardHeader`, `CardTitle` | `src/components` barrel |
| Single-tx form pattern | `ShieldForm.tsx` | `src/features/shield/components/ShieldForm.tsx` |
| Multi-input bid form | `AscendingBidForm.tsx` + `_parts.tsx` | `src/features/auctions/bid-forms/` |

---

## Type Safety Constraints

- No `any` in component props or hook return values
- `string | Record<string, unknown>` in generated client args (`AddLiquidityPrivateArgs.record_a` etc.) is unavoidable — it is the generated type, not hand-written code
- `TokenDisplay` used in all component props — not the raw `TokenMetadata | WellKnownToken` union
- `WalletLpRecord` (typed, bigint amount) used throughout — never raw `LpTokenRecord` from generated client
- `FairswapDexV2` typed client return — never inlined
- `SummaryRow = [label: string, value: string] | null | false | undefined` — same as bid forms
- Generated client transitions return `Promise<string>` (txId) and throw on failure — no `result?.transactionId` pattern needed when using the generated client
