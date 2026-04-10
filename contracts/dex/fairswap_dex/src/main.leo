// fairswap_dex_v2.aleo — Uniswap V2-style constant-product AMM on Aleo.
//
// Design summary:
//   • Constant product formula: x * y = k
//   • Any two token_registry.aleo token pairs (use CREDITS_RESERVED_TOKEN_ID for ALEO)
//   • 0.3% swap fee accrued entirely in reserves (LP benefit by default)
//   • Protocol fee (1/6 of swap fee ≈ 0.05%) diverted to protocol_fees mapping when enabled
//     via toggle_protocol_fee; state stored in internal protocol_fee_enabled mapping
//   • TWAP cumulative price oracle updated at each swap
//   • Minimum liquidity lock: 1000 LP burned to zero address on first mint
//   • Dual public/private paths for swaps and liquidity operations
//   • LP positions tracked internally: lp_balances mapping + LpToken record
//   • CPI-callable add_liquidity_cpi_private_in for seamless post-auction seeding
//   • Multisig governance for fee updates and protocol fee withdrawal
//
// Privacy model:
//   Pool reserves are always public (AMM invariant checked in final {}).
//   Trade amounts are always inferable from reserve deltas even on private paths.
//   Private paths hide trader/LP identity and wallet balances.
//
//   Private path — snapshot pattern:
//     Amounts to transfer (LP, token_out) must be known in proof context so CPI
//     calls can be built. The caller reads current pool state off-chain, computes
//     amounts conservatively, and passes them as public params. final {} verifies
//     current reserves can support the committed amounts. If the pool moved between
//     read and finalization the tx reverts (records are NOT consumed) and caller retries.
//
// Pool key derivation:
//   Canonical ordering enforced: token_a < token_b by field integer value.
//   pool_key = BHP256(PoolKey { token_a, token_b }) — canonical pair only.
//   SDK computePoolKey must enforce the same ordering.
//
// LP token design:
//   Managed internally — NOT through token_registry.aleo:
//     - Public:  lp_balances[BHP256(LpBalKey{holder, pool_key})] : u128
//     - Private: LpToken record { owner, pool_key, amount }
//   Phase 5 farming contract reads lp_balances directly via external mapping read.
//
// add_liquidity_cpi_private_in (auction seeding):
//   Caller passes two private Token records directly. The DEX atomically deposits
//   them to its public balance via transfer_private_to_public in the same tx proof.
//   Callers with public balances use the in-flight record pattern:
//     token_registry::transfer_public_to_private(dex_address, amount, false)
//     → produces a Token record owned by dex_address, passed immediately as an arg.
//   No pre-transfer transaction needed; everything is atomic in one proof.
//
// Upgrade governance:
//   @checksum at key 12field in fairdrop_multisig_v1.aleo::approved_upgrades.
//   First deployment (edition=0) bypasses; all upgrades require 3-of-5.
//
// ── Leo 4.0 notes ────────────────────────────────────────────────────────────
//   • Transitions: fn inside program {}. Finalize logic in final {} blocks.
//   • Structs at module level (outside program {}).
//   • Proof-context helpers: module-level fn.
//   • Pure helpers callable from both proof and final {} contexts: module-level fn.
//   • CPI syntax: program.aleo::transition(args) → Final; .run() inside final {}.
//   • External mapping read inside final {}: program.aleo::mapping.get(key).
// ─────────────────────────────────────────────────────────────────────────────

import fairdrop_multisig_v1.aleo;
import token_registry.aleo;
import fairdrop_config_v2.aleo;

// =============================================================================
// Module-level structs
// =============================================================================

struct PoolKey         { token_a: field, token_b: field }
struct LpBalKey        { holder: address, pool_key: field }
struct ProtocolFeeKey  { pool_key: field, token_id: field }
struct WithdrawalOp        { pool_key: field, token_id: field, amount: u128, recipient: address, nonce: u64 }
struct FeeUpdateOp         { pool_key: field, fee_bps: u16, nonce: u64 }
struct ProtocolFeeToggleOp { enabled: bool, nonce: u64 }
struct PauseToggleOp       { paused: bool, nonce: u64 }

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

// =============================================================================
// Module-level helpers — proof context (inlined at every call site)
// =============================================================================

// Returns (canonical_a, canonical_b) such that canonical_a < canonical_b.
fn canonical_pair(ta: field, tb: field) -> (field, field) {
    let a: field = ta < tb ? ta : tb;
    let b: field = ta < tb ? tb : ta;
    return (a, b);
}

// Constant-product swap output (fee applied to input side).
// amount_out = reserve_out * amount_in*(10000-fee) / (reserve_in*10000 + amount_in*(10000-fee))
// Known overflow: reserve_out * amt_in_fee overflows u128 if the product exceeds ~3.4e38.
// SDK guard: assert reserve_out * amount_in * 10000 <= u128::MAX before submitting.
fn swap_out(reserve_in: u128, reserve_out: u128, amount_in: u128, fee_bps: u16) -> u128 {
    let factor:      u128 = 10000u128 - (fee_bps as u128);
    let amt_in_fee:  u128 = amount_in * factor;
    let numerator:   u128 = reserve_out * amt_in_fee;
    let denominator: u128 = reserve_in * 10000u128 + amt_in_fee;
    return numerator / denominator;
}

// LP minted for non-initial liquidity adds.
// Returns min(amount_a * lp_supply / reserve_a, amount_b * lp_supply / reserve_b).
// Known overflow: amount * lp_supply overflows u128 if either operand exceeds ~1.84e19 units.
// SDK guard: assert amount_a * lp_supply <= u128::MAX before submitting.
fn lp_for_add(reserve_a: u128, reserve_b: u128, lp_supply: u128, amount_a: u128, amount_b: u128) -> u128 {
    let mint_a: u128 = amount_a * lp_supply / reserve_a;
    let mint_b: u128 = amount_b * lp_supply / reserve_b;
    return mint_a < mint_b ? mint_a : mint_b;
}

// Newton-Raphson integer sqrt — 64 unrolled iterations from 2^33.
// Same approach as fairdrop_quadratic_v3.aleo. Converges to floor(sqrt(n)).
fn sqrt_u128(n: u128) -> u128 {
    let s0:  u128 = 8_589_934_592u128;
    let s1:  u128 = (s0  + n / s0)  / 2u128;
    let s2:  u128 = (s1  + n / s1)  / 2u128;
    let s3:  u128 = (s2  + n / s2)  / 2u128;
    let s4:  u128 = (s3  + n / s3)  / 2u128;
    let s5:  u128 = (s4  + n / s4)  / 2u128;
    let s6:  u128 = (s5  + n / s5)  / 2u128;
    let s7:  u128 = (s6  + n / s6)  / 2u128;
    let s8:  u128 = (s7  + n / s7)  / 2u128;
    let s9:  u128 = (s8  + n / s8)  / 2u128;
    let s10: u128 = (s9  + n / s9)  / 2u128;
    let s11: u128 = (s10 + n / s10) / 2u128;
    let s12: u128 = (s11 + n / s11) / 2u128;
    let s13: u128 = (s12 + n / s12) / 2u128;
    let s14: u128 = (s13 + n / s13) / 2u128;
    let s15: u128 = (s14 + n / s14) / 2u128;
    let s16: u128 = (s15 + n / s15) / 2u128;
    let s17: u128 = (s16 + n / s16) / 2u128;
    let s18: u128 = (s17 + n / s17) / 2u128;
    let s19: u128 = (s18 + n / s18) / 2u128;
    let s20: u128 = (s19 + n / s19) / 2u128;
    let s21: u128 = (s20 + n / s20) / 2u128;
    let s22: u128 = (s21 + n / s21) / 2u128;
    let s23: u128 = (s22 + n / s22) / 2u128;
    let s24: u128 = (s23 + n / s23) / 2u128;
    let s25: u128 = (s24 + n / s24) / 2u128;
    let s26: u128 = (s25 + n / s25) / 2u128;
    let s27: u128 = (s26 + n / s26) / 2u128;
    let s28: u128 = (s27 + n / s27) / 2u128;
    let s29: u128 = (s28 + n / s28) / 2u128;
    let s30: u128 = (s29 + n / s29) / 2u128;
    let s31: u128 = (s30 + n / s30) / 2u128;
    let s32: u128 = (s31 + n / s31) / 2u128;
    let s33: u128 = (s32 + n / s32) / 2u128;
    let s34: u128 = (s33 + n / s33) / 2u128;
    let s35: u128 = (s34 + n / s34) / 2u128;
    let s36: u128 = (s35 + n / s35) / 2u128;
    let s37: u128 = (s36 + n / s36) / 2u128;
    let s38: u128 = (s37 + n / s37) / 2u128;
    let s39: u128 = (s38 + n / s38) / 2u128;
    let s40: u128 = (s39 + n / s39) / 2u128;
    let s41: u128 = (s40 + n / s40) / 2u128;
    let s42: u128 = (s41 + n / s41) / 2u128;
    let s43: u128 = (s42 + n / s42) / 2u128;
    let s44: u128 = (s43 + n / s43) / 2u128;
    let s45: u128 = (s44 + n / s44) / 2u128;
    let s46: u128 = (s45 + n / s45) / 2u128;
    let s47: u128 = (s46 + n / s46) / 2u128;
    let s48: u128 = (s47 + n / s47) / 2u128;
    let s49: u128 = (s48 + n / s48) / 2u128;
    let s50: u128 = (s49 + n / s49) / 2u128;
    let s51: u128 = (s50 + n / s50) / 2u128;
    let s52: u128 = (s51 + n / s51) / 2u128;
    let s53: u128 = (s52 + n / s52) / 2u128;
    let s54: u128 = (s53 + n / s53) / 2u128;
    let s55: u128 = (s54 + n / s54) / 2u128;
    let s56: u128 = (s55 + n / s55) / 2u128;
    let s57: u128 = (s56 + n / s56) / 2u128;
    let s58: u128 = (s57 + n / s57) / 2u128;
    let s59: u128 = (s58 + n / s58) / 2u128;
    let s60: u128 = (s59 + n / s59) / 2u128;
    let s61: u128 = (s60 + n / s60) / 2u128;
    let s62: u128 = (s61 + n / s61) / 2u128;
    let s63: u128 = (s62 + n / s62) / 2u128;
    let s64: u128 = (s63 + n / s63) / 2u128;
    return s64 < s63 ? s64 : s63;
}

// =============================================================================
// Module-level helpers — callable from final {} (value-returning; stays as fn)
// =============================================================================
// Leo 4.0: final fn is void-only (state mutations, no return value).
// Value-returning helpers used inside final {} blocks must remain as regular fn.
// The compiler allows pure fn to be called from final {} contexts.

// Update TWAP cumulative prices before a reserve change.
// price_a_cum += (reserve_b / reserve_a) * 1e6 * blocks_elapsed
// No-op if elapsed == 0 or either reserve == 0.
// Receives current_height from the caller (a final {} block) to avoid
// reading block.height inside this function. Returns updated TWAP state.
//
// Known overflow risks (tracked as known limitations; SDK must guard before submitting):
//   TWAP:        reserve * 1_000_000u128 overflows if reserve > ~3.4e32.
//                price_a_cum accumulation can also overflow after many blocks at high price ratios.
//   Initial LP:  sqrt_u128(amt_a * amt_b) — the multiplication overflows if both amounts > ~1.84e19.
//   lp_for_add:  amount * lp_supply overflows if either operand > ~1.84e19.
//   swap_out:    reserve_out * amt_in_fee overflows if the product exceeds ~3.4e38.
fn twap_update(pool: PoolState, current_height: u32) -> PoolState {
    let elapsed: u32 = current_height - pool.last_block;
    if elapsed == 0u32 || pool.reserve_a == 0u128 || pool.reserve_b == 0u128 {
        return pool;
    }
    let e: u128       = elapsed as u128;
    let price_a: u128 = pool.reserve_b * 1_000_000u128 / pool.reserve_a;
    let price_b: u128 = pool.reserve_a * 1_000_000u128 / pool.reserve_b;
    return PoolState {
        token_a:     pool.token_a,
        token_b:     pool.token_b,
        reserve_a:   pool.reserve_a,
        reserve_b:   pool.reserve_b,
        lp_supply:   pool.lp_supply,
        fee_bps:     pool.fee_bps,
        price_a_cum: pool.price_a_cum + price_a * e,
        price_b_cum: pool.price_b_cum + price_b * e,
        last_block:  current_height,
    };
}

// =============================================================================
// Program interface
// =============================================================================

program fairswap_dex_v2.aleo {

    // Upgrade governance: 3-of-5 multisig must approve with contract_key = 12field.
    @checksum(mapping="fairdrop_multisig_v1.aleo::approved_upgrades", key="12field")
    constructor() {}

    // =========================================================================
    // Constants
    // =========================================================================

    // ALEO credits token ID in token_registry.aleo.
    const CREDITS_RESERVED_TOKEN_ID: field =
        3443843282313283355522573239085696902919850365217539366784739393210722344986field;

    // Minimum LP permanently locked on first mint. Prevents full pool drain.
    const MIN_LIQUIDITY: u128 = 1_000u128;

    // Maximum governance-allowed fee.
    const MAX_FEE_BPS: u16 = 100u16;

    // SDK hint only — not enforced on-chain. Pre-fill this when the user creates
    // a pool without specifying a custom fee. The on-chain bound is MAX_FEE_BPS.
    const DEFAULT_FEE_BPS: u16 = 30u16;

    // Sink for MIN_LIQUIDITY on initial mint (all-zeros Aleo address).
    const ZERO_ADDRESS: address =
        aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc;

    // =========================================================================
    // Records
    // =========================================================================

    // Private LP position. Consumed by remove_liquidity_private.
    record LpToken {
        owner:    address,
        pool_key: field,
        amount:   u128,
    }

    // =========================================================================
    // Mappings
    // =========================================================================

    // Pool state per token pair.
    // key = BHP256::hash_to_field(PoolKey { token_a: ca, token_b: cb }) where ca < cb.
    mapping pools: field => PoolState;

    // Public LP balances. key = BHP256(LpBalKey { owner, pool_key }).
    mapping lp_balances: field => u128;

    // Accumulated protocol fees per (pool, token). Denominated in the token that was
    // swapped in. key = BHP256(ProtocolFeeKey { pool_key, token_id }).
    mapping protocol_fees: field => u128;

    // Global protocol fee switch. key = 0field; default false (fee off).
    // Enabled via toggle_protocol_fee (multisig-governed).
    mapping protocol_fee_enabled: field => bool;

    // Local DEX pause. key = 0field; default false (running).
    // Either this OR fairdrop_config_v2::paused being true halts the DEX.
    mapping paused: field => bool;

    // Replay protection for multisig-governed calls.
    mapping consumed_ops: field => bool;

    // =========================================================================
    // 1. create_pool
    // =========================================================================
    //
    // Pre-registers a token pair with no liquidity. Permissionless.
    // Optional: add_liquidity and add_liquidity_cpi now create the pool
    // atomically if it does not exist, so a separate create_pool call is
    // only needed when the fee rate must be set before any liquidity is added
    // (e.g., a protocol pre-registering a pair with a custom fee).
    // Canonical ordering (token_a < token_b) enforced in transition body via canonical_pair.
    // Reverts if the pool already exists.

    fn create_pool(
        public token_x: field,
        public token_y: field,
        public fee_bps: u16,
    ) -> Final {
        assert(token_x != token_y);
        assert(fee_bps <= MAX_FEE_BPS);
        let (ca, cb): (field, field) = canonical_pair(token_x, token_y);
        let pool_key: field = BHP256::hash_to_field(PoolKey { token_a: ca, token_b: cb });

        return final {
            assert(!fairdrop_config_v2.aleo::paused.get_or_use(0field, false) && !paused.get_or_use(0field, false));
            assert(!pools.contains(pool_key));
            pools.set(pool_key, PoolState {
                token_a:     ca,
                token_b:     cb,
                reserve_a:   0u128,
                reserve_b:   0u128,
                lp_supply:   0u128,
                fee_bps:     fee_bps,
                price_a_cum: 0u128,
                price_b_cum: 0u128,
                last_block:  block.height,
            });
        };
    }

    // =========================================================================
    // 2. add_liquidity — public path
    // =========================================================================
    //
    // Pulls token_a and token_b from the signer's token_registry public balances
    // and mints LP to recipient's public lp_balances entry.
    //
    // Atomic pool creation: if the pool does not exist yet, it is created inline
    // using the provided fee_bps. This eliminates the front-running window that
    // exists when create_pool and add_liquidity are separate transactions.
    // If the pool already exists, fee_bps is silently ignored — the existing
    // fee rate applies.
    //
    // Initial mint:    LP = sqrt(amt_a * amt_b) - MIN_LIQUIDITY
    //                  MIN_LIQUIDITY is permanently credited to ZERO_ADDRESS
    //                  to prevent the pool from ever being fully drained.
    // Subsequent mint: LP = min(amt_a * lp_supply / reserve_a,
    //                           amt_b * lp_supply / reserve_b)
    //
    // min_lp: slippage guard — reverts if LP minted to recipient < min_lp.

    fn add_liquidity(
        public token_a_id: field,
        public token_b_id: field,
        public amount_a:   u128,
        public amount_b:   u128,
        public fee_bps:    u16,     // only used if pool does not exist yet
        public min_lp:     u128,
        public recipient:  address,
    ) -> Final {
        assert(amount_a > 0u128 && amount_b > 0u128);
        assert(token_a_id != token_b_id);
        let (ca, cb): (field, field) = canonical_pair(token_a_id, token_b_id);
        let pool_key: field = BHP256::hash_to_field(PoolKey { token_a: ca, token_b: cb });

        let f_a: Final =
            token_registry.aleo::transfer_public_as_signer(token_a_id, self.address, amount_a);
        let f_b: Final =
            token_registry.aleo::transfer_public_as_signer(token_b_id, self.address, amount_b);

        return final {
            assert(!fairdrop_config_v2.aleo::paused.get_or_use(0field, false) && !paused.get_or_use(0field, false));
            f_a.run();
            f_b.run();

            // Create pool atomically if it doesn't exist.
            // Eliminates the front-running window between create_pool and first add_liquidity.
            if !pools.contains(pool_key) {
                assert(fee_bps <= MAX_FEE_BPS);
                pools.set(pool_key, PoolState {
                    token_a:     ca,
                    token_b:     cb,
                    reserve_a:   0u128,
                    reserve_b:   0u128,
                    lp_supply:   0u128,
                    fee_bps:     fee_bps,
                    price_a_cum: 0u128,
                    price_b_cum: 0u128,
                    last_block:  block.height,
                });
            }

            let pool: PoolState = pools.get(pool_key);
            assert_eq(pool.token_a, ca);

            // Re-orient amounts into canonical (a, b) order.
            let amt_a: u128 = token_a_id == ca ? amount_a : amount_b;
            let amt_b: u128 = token_a_id == ca ? amount_b : amount_a;

            let is_initial: bool    = pool.lp_supply == 0u128;
            if is_initial {
                // Prevent underflow: sqrt_u128(amt_a * amt_b) - MIN_LIQUIDITY panics
                // if the sqrt is < MIN_LIQUIDITY. Require product >= MIN_LIQUIDITY^2.
                assert(amt_a * amt_b >= MIN_LIQUIDITY * MIN_LIQUIDITY);
            }
            if !is_initial {
                // Guard: if reserves were drained to 0 by rounding (Uniswap V2 known edge
                // case), fail with a clear error rather than a divide-by-zero in lp_for_add.
                assert(pool.reserve_a > 0u128 && pool.reserve_b > 0u128);
            }
            let lp_out: u128 = is_initial
                ? sqrt_u128(amt_a * amt_b) - MIN_LIQUIDITY
                : lp_for_add(pool.reserve_a, pool.reserve_b, pool.lp_supply, amt_a, amt_b);

            assert(lp_out >= min_lp && lp_out > 0u128);

            // Credit LP to recipient.
            let rec_key: field = BHP256::hash_to_field(LpBalKey { holder:recipient, pool_key: pool_key });
            lp_balances.set(rec_key, lp_balances.get_or_use(rec_key, 0u128) + lp_out);

            // Lock MIN_LIQUIDITY on first mint.
            let new_supply: u128 = is_initial
                ? pool.lp_supply + lp_out + MIN_LIQUIDITY
                : pool.lp_supply + lp_out;
            if is_initial {
                let zk: field = BHP256::hash_to_field(LpBalKey { holder:ZERO_ADDRESS, pool_key: pool_key });
                lp_balances.set(zk, MIN_LIQUIDITY);
            }

            pools.set(pool_key, PoolState {
                token_a:     pool.token_a,
                token_b:     pool.token_b,
                reserve_a:   pool.reserve_a + amt_a,
                reserve_b:   pool.reserve_b + amt_b,
                lp_supply:   new_supply,
                fee_bps:     pool.fee_bps,
                price_a_cum: pool.price_a_cum,
                price_b_cum: pool.price_b_cum,
                last_block:  pool.last_block,
            });
        };
    }

    // =========================================================================
    // 3. add_liquidity_private — private path
    // =========================================================================
    //
    // Deposits two private token records to the DEX's public balance and returns
    // a private LpToken record. Records are fully consumed (entire .amount of each).
    //
    // Snapshot pattern: caller computes lp_to_mint from current reserves off-chain.
    // final {} verifies lp_to_mint <= max possible from current reserves.
    // If stale, tx reverts with records intact; caller retries with fresh snapshot.

    fn add_liquidity_private(
        record_a:          token_registry.aleo::Token,
        record_b:          token_registry.aleo::Token,
        public lp_to_mint: u128,
        public min_lp:     u128,
        public fee_bps:    u16,     // only used if pool does not exist yet
        public recipient:  address,
    ) -> (LpToken, Final) {
        assert(lp_to_mint >= min_lp && lp_to_mint > 0u128);

        let amount_a:   u128  = record_a.amount;
        let amount_b:   u128  = record_b.amount;
        let token_a_id: field = record_a.token_id;
        let token_b_id: field = record_b.token_id;
        assert(token_a_id != token_b_id);
        assert(amount_a > 0u128 && amount_b > 0u128);

        let (ca, cb): (field, field) = canonical_pair(token_a_id, token_b_id);
        let pool_key: field = BHP256::hash_to_field(PoolKey { token_a: ca, token_b: cb });

        // Deposit both records into the DEX's public balance.
        // Reserves and DEX balance stay in sync — no phantom reserve divergence.
        let (dust_a, f_dep_a): (token_registry.aleo::Token, Final) =
            token_registry.aleo::transfer_private_to_public(self.address, amount_a, record_a);
        let (dust_b, f_dep_b): (token_registry.aleo::Token, Final) =
            token_registry.aleo::transfer_private_to_public(self.address, amount_b, record_b);

        let lp_record: LpToken = LpToken { owner: recipient, pool_key: pool_key, amount: lp_to_mint };

        return (lp_record, final {
            assert(!fairdrop_config_v2.aleo::paused.get_or_use(0field, false) && !paused.get_or_use(0field, false));
            f_dep_a.run();
            f_dep_b.run();

            // Create pool atomically if it doesn't exist.
            // Eliminates the front-running window between create_pool and first add_liquidity_private.
            if !pools.contains(pool_key) {
                assert(fee_bps <= MAX_FEE_BPS);
                pools.set(pool_key, PoolState {
                    token_a:     ca,
                    token_b:     cb,
                    reserve_a:   0u128,
                    reserve_b:   0u128,
                    lp_supply:   0u128,
                    fee_bps:     fee_bps,
                    price_a_cum: 0u128,
                    price_b_cum: 0u128,
                    last_block:  block.height,
                });
            }

            let pool: PoolState = pools.get(pool_key);
            assert_eq(pool.token_a, ca);

            let amt_a: u128 = token_a_id == ca ? amount_a : amount_b;
            let amt_b: u128 = token_a_id == ca ? amount_b : amount_a;

            // Verify committed lp_to_mint does not exceed what current reserves allow.
            let is_initial: bool = pool.lp_supply == 0u128;
            if is_initial {
                assert(amt_a * amt_b >= MIN_LIQUIDITY * MIN_LIQUIDITY);
            }
            if !is_initial {
                // Guard: if reserves were drained to 0 by rounding (Uniswap V2 known edge
                // case), fail with a clear error rather than a divide-by-zero in lp_for_add.
                assert(pool.reserve_a > 0u128 && pool.reserve_b > 0u128);
            }
            let max_lp: u128 = is_initial
                ? sqrt_u128(amt_a * amt_b) - MIN_LIQUIDITY
                : lp_for_add(pool.reserve_a, pool.reserve_b, pool.lp_supply, amt_a, amt_b);
            assert(lp_to_mint <= max_lp);

            let new_supply: u128 = is_initial
                ? pool.lp_supply + lp_to_mint + MIN_LIQUIDITY
                : pool.lp_supply + lp_to_mint;
            if is_initial {
                let zk: field = BHP256::hash_to_field(LpBalKey { holder:ZERO_ADDRESS, pool_key: pool_key });
                lp_balances.set(zk, MIN_LIQUIDITY);
            }

            pools.set(pool_key, PoolState {
                token_a:     pool.token_a,
                token_b:     pool.token_b,
                reserve_a:   pool.reserve_a + amt_a,
                reserve_b:   pool.reserve_b + amt_b,
                lp_supply:   new_supply,
                fee_bps:     pool.fee_bps,
                price_a_cum: pool.price_a_cum,
                price_b_cum: pool.price_b_cum,
                last_block:  pool.last_block,
            });
        });
    }

    // =========================================================================
    // 4. add_liquidity_cpi_private_in — CPI path for auction seeding
    // =========================================================================
    //
    // Called by auction contracts from their seed_liquidity transition.
    // Accepts two private Token records and atomically deposits them to the
    // DEX's public balance via transfer_private_to_public. Amounts and token
    // IDs are read directly from the records — ZK record ownership proves the
    // deposit is valid. No prior transfer CPI or allowlist needed; permissionless.
    //
    // Callers with PUBLIC token balances use the in-flight record pattern:
    //   1. token_registry::transfer_public_to_private(dex_address, amount, false)
    //      → creates a Token record owned by dex_address (not yet on-chain)
    //   2. Pass that record as record_a or record_b to this transition
    //   Both records are created and consumed atomically in the same transaction —
    //   they never persist as unspent outputs on-chain.
    //
    // 0-amount remainder records (dust) are emitted as implicit outputs.
    //
    // Atomic pool creation: if the pool does not exist yet, it is created inline
    // using the provided fee_bps. If the pool already exists, fee_bps is ignored.
    //
    // Pause check intentionally omitted: seeding is post-auction settlement,
    // not a live trade. A paused DEX should not block auction finalization.

    fn add_liquidity_cpi_private_in(
        record_a:         token_registry.aleo::Token,
        record_b:         token_registry.aleo::Token,
        public fee_bps:   u16,
        public min_lp:    u128,
        public recipient: address,
    ) -> Final {
        let amount_a:   u128  = record_a.amount;
        let amount_b:   u128  = record_b.amount;
        let token_a_id: field = record_a.token_id;
        let token_b_id: field = record_b.token_id;
        assert(amount_a > 0u128 && amount_b > 0u128);
        assert(token_a_id != token_b_id);
        let (ca, cb): (field, field) = canonical_pair(token_a_id, token_b_id);
        let pool_key: field = BHP256::hash_to_field(PoolKey { token_a: ca, token_b: cb });

        // Deposit both records to DEX's public balance atomically.
        // Full amounts transferred; dust remainder records (0-amount) emitted as outputs.
        let (dust_a, f_deposit_a): (token_registry.aleo::Token, Final) =
            token_registry.aleo::transfer_private_to_public(self.address, amount_a, record_a);
        let (dust_b, f_deposit_b): (token_registry.aleo::Token, Final) =
            token_registry.aleo::transfer_private_to_public(self.address, amount_b, record_b);

        return final {
            f_deposit_a.run();
            f_deposit_b.run();

            // Create pool atomically if it doesn't exist.
            // Pool creation is still pause-gated even though liquidity seeding is not:
            // a governance pause should prevent new markets from being opened while
            // still allowing already-registered pools to receive their auction proceeds.
            if !pools.contains(pool_key) {
                assert(!fairdrop_config_v2.aleo::paused.get_or_use(0field, false) && !paused.get_or_use(0field, false));
                assert(fee_bps <= MAX_FEE_BPS);
                pools.set(pool_key, PoolState {
                    token_a:     ca,
                    token_b:     cb,
                    reserve_a:   0u128,
                    reserve_b:   0u128,
                    lp_supply:   0u128,
                    fee_bps:     fee_bps,
                    price_a_cum: 0u128,
                    price_b_cum: 0u128,
                    last_block:  block.height,
                });
            }

            let pool: PoolState = pools.get(pool_key);
            assert_eq(pool.token_a, ca);

            let amt_a: u128 = token_a_id == ca ? amount_a : amount_b;
            let amt_b: u128 = token_a_id == ca ? amount_b : amount_a;

            let is_initial: bool = pool.lp_supply == 0u128;
            if is_initial {
                assert(amt_a * amt_b >= MIN_LIQUIDITY * MIN_LIQUIDITY);
            }
            if !is_initial {
                // Guard: if reserves were drained to 0 by rounding (Uniswap V2 known edge
                // case), fail with a clear error rather than a divide-by-zero in lp_for_add.
                assert(pool.reserve_a > 0u128 && pool.reserve_b > 0u128);
            }
            let lp_out: u128 = is_initial
                ? sqrt_u128(amt_a * amt_b) - MIN_LIQUIDITY
                : lp_for_add(pool.reserve_a, pool.reserve_b, pool.lp_supply, amt_a, amt_b);

            assert(lp_out >= min_lp && lp_out > 0u128);

            let rec_key: field = BHP256::hash_to_field(LpBalKey { holder: recipient, pool_key: pool_key });
            lp_balances.set(rec_key, lp_balances.get_or_use(rec_key, 0u128) + lp_out);

            let new_supply: u128 = is_initial
                ? pool.lp_supply + lp_out + MIN_LIQUIDITY
                : pool.lp_supply + lp_out;
            if is_initial {
                let zk: field = BHP256::hash_to_field(LpBalKey { holder: ZERO_ADDRESS, pool_key: pool_key });
                lp_balances.set(zk, MIN_LIQUIDITY);
            }

            pools.set(pool_key, PoolState {
                token_a:     pool.token_a,
                token_b:     pool.token_b,
                reserve_a:   pool.reserve_a + amt_a,
                reserve_b:   pool.reserve_b + amt_b,
                lp_supply:   new_supply,
                fee_bps:     pool.fee_bps,
                price_a_cum: pool.price_a_cum,
                price_b_cum: pool.price_b_cum,
                last_block:  pool.last_block,
            });
        };
    }

    // =========================================================================
    // 5. remove_liquidity — public path
    // =========================================================================
    //
    // Burns lp_amount from caller's public lp_balance and sends token_a + token_b
    // to recipient. Amounts computed on-chain from current reserves.
    //
    // amount_out = lp_amount * reserve / lp_supply (for each token).
    //
    // ⚠ SDK NOTE — min_a/min_b are the TRANSFER AMOUNTS, not slippage guards:
    //   Because the transfer CPI must be committed at proof time (before final {}),
    //   the DEX pays out exactly min_a and min_b. Any surplus (actual_raw - min_a)
    //   stays in the pool as a bonus to remaining LPs.
    //   To avoid leaving value behind, callers should set:
    //     min_a = lp_amount * reserve_a / lp_supply  (current off-chain snapshot)
    //     min_b = lp_amount * reserve_b / lp_supply
    //   A slippage % applied here means that % of the withdrawal is gifted to the pool.
    //   If the snapshot is stale (actual_raw < min_a), the transaction reverts cleanly.

    fn remove_liquidity(
        public token_a_id: field,
        public token_b_id: field,
        public lp_amount:  u128,
        public min_a:      u128,
        public min_b:      u128,
        public recipient:  address,
    ) -> Final {
        assert(lp_amount > 0u128);
        let (ca, cb): (field, field) = canonical_pair(token_a_id, token_b_id);
        let pool_key: field = BHP256::hash_to_field(PoolKey { token_a: ca, token_b: cb });
        let caller: address = self.signer;

        let f_out_a: Final =
            token_registry.aleo::transfer_public(token_a_id, recipient, min_a);
        let f_out_b: Final =
            token_registry.aleo::transfer_public(token_b_id, recipient, min_b);

        return final {
            assert(!fairdrop_config_v2.aleo::paused.get_or_use(0field, false) && !paused.get_or_use(0field, false));

            let pool: PoolState = pools.get(pool_key);
            assert_eq(pool.token_a, ca);
            assert(pool.lp_supply > 0u128);

            // Compute actual amounts from current reserves.
            let raw_a: u128 = lp_amount * pool.reserve_a / pool.lp_supply;
            let raw_b: u128 = lp_amount * pool.reserve_b / pool.lp_supply;

            // Map back to caller's token ordering.
            let out_a: u128 = token_a_id == ca ? raw_a : raw_b;
            let out_b: u128 = token_a_id == ca ? raw_b : raw_a;
            assert(out_a >= min_a && out_b >= min_b);

            // Burn LP from caller's public balance.
            let ckey: field = BHP256::hash_to_field(LpBalKey { holder:caller, pool_key: pool_key });
            let cbal: u128  = lp_balances.get_or_use(ckey, 0u128);
            assert(cbal >= lp_amount);
            lp_balances.set(ckey, cbal - lp_amount);

            f_out_a.run();
            f_out_b.run();

            // Reserves decrease by the amounts actually transferred (min_a/min_b in
            // caller ordering, mapped back to canonical). The surplus (raw - min) stays
            // in reserves as a bonus to remaining LPs — same mechanism as swap surplus.
            pools.set(pool_key, PoolState {
                token_a:     pool.token_a,
                token_b:     pool.token_b,
                reserve_a:   pool.reserve_a - (token_a_id == ca ? min_a : min_b),
                reserve_b:   pool.reserve_b - (token_a_id == ca ? min_b : min_a),
                lp_supply:   pool.lp_supply - lp_amount,
                fee_bps:     pool.fee_bps,
                price_a_cum: pool.price_a_cum,
                price_b_cum: pool.price_b_cum,
                last_block:  pool.last_block,
            });
        };
    }

    // =========================================================================
    // 6. remove_liquidity_private — private path
    // =========================================================================
    //
    // Consumes a private LpToken record and returns two private token records.
    //
    // Snapshot pattern: caller pre-computes amount_a and amount_b from current
    // reserves. final {} verifies actual amounts >= committed amounts.
    // Stale snapshot → revert, caller retries.

    fn remove_liquidity_private(
        lp:                LpToken,
        public token_a_id: field,
        public token_b_id: field,
        public amount_a:   u128,
        public amount_b:   u128,
        public min_a:      u128,
        public min_b:      u128,
        public recipient:  address,
    ) -> (token_registry.aleo::Token, token_registry.aleo::Token, Final) {
        assert(amount_a >= min_a && amount_b >= min_b);
        assert(amount_a > 0u128 && amount_b > 0u128);
        let (ca, cb): (field, field) = canonical_pair(token_a_id, token_b_id);
        let pool_key: field = BHP256::hash_to_field(PoolKey { token_a: ca, token_b: cb });
        assert_eq(lp.pool_key, pool_key);

        let lp_amount: u128 = lp.amount;

        // Withdraw from DEX's public balance to private records for recipient.
        // Draws from the balance funded by add_liquidity_private deposits — no minting.
        let (out_a, f_priv_a): (token_registry.aleo::Token, Final) =
            token_registry.aleo::transfer_public_to_private(token_a_id, recipient, amount_a, false);
        let (out_b, f_priv_b): (token_registry.aleo::Token, Final) =
            token_registry.aleo::transfer_public_to_private(token_b_id, recipient, amount_b, false);

        return (out_a, out_b, final {
            assert(!fairdrop_config_v2.aleo::paused.get_or_use(0field, false) && !paused.get_or_use(0field, false));

            let pool: PoolState = pools.get(pool_key);
            assert_eq(pool.token_a, ca);
            assert(pool.lp_supply > 0u128);

            let actual_ca: u128 = lp_amount * pool.reserve_a / pool.lp_supply;
            let actual_cb: u128 = lp_amount * pool.reserve_b / pool.lp_supply;

            // Verify committed amounts do not exceed what current reserves support.
            let committed_ca: u128 = token_a_id == ca ? amount_a : amount_b;
            let committed_cb: u128 = token_a_id == ca ? amount_b : amount_a;
            assert(committed_ca <= actual_ca);
            assert(committed_cb <= actual_cb);

            f_priv_a.run();
            f_priv_b.run();

            // Reserves decrease by committed amounts (what was transferred out). Surplus
            // (actual - committed) stays in reserves, benefiting remaining LPs.
            pools.set(pool_key, PoolState {
                token_a:     pool.token_a,
                token_b:     pool.token_b,
                reserve_a:   pool.reserve_a - committed_ca,
                reserve_b:   pool.reserve_b - committed_cb,
                lp_supply:   pool.lp_supply - lp_amount,
                fee_bps:     pool.fee_bps,
                price_a_cum: pool.price_a_cum,
                price_b_cum: pool.price_b_cum,
                last_block:  pool.last_block,
            });
        });
    }

    // =========================================================================
    // 7. swap — public path
    // =========================================================================
    //
    // Swaps token_in for token_out using constant-product formula.
    // Updates TWAP cumulative prices before reserve change.
    // Optionally splits protocol fee from LP fee when governance-enabled.
    //
    // Transfer CPI for token_out uses min_out as the amount; final {} verifies
    // actual amount_out >= min_out. The DEX pays out exactly min_out to prevent
    // overpayment from stale state — any surplus stays in reserves as LP bonus.

    fn swap(
        public token_in_id:  field,
        public token_out_id: field,
        public amount_in:    u128,
        public min_out:      u128,
        public recipient:    address,
    ) -> Final {
        assert(amount_in > 0u128 && min_out > 0u128);
        assert(token_in_id != token_out_id);
        let (ca, cb): (field, field) = canonical_pair(token_in_id, token_out_id);
        let pool_key: field = BHP256::hash_to_field(PoolKey { token_a: ca, token_b: cb });

        let f_in: Final =
            token_registry.aleo::transfer_public_as_signer(token_in_id, self.address, amount_in);
        let f_out: Final =
            token_registry.aleo::transfer_public(token_out_id, recipient, min_out);

        return final {
            assert(!fairdrop_config_v2.aleo::paused.get_or_use(0field, false) && !paused.get_or_use(0field, false));
            f_in.run();

            let pool: PoolState = pools.get(pool_key);
            assert_eq(pool.token_a, ca);

            let res_in:  u128 = token_in_id == ca ? pool.reserve_a : pool.reserve_b;
            let res_out: u128 = token_in_id == ca ? pool.reserve_b : pool.reserve_a;

            let amount_out: u128 = swap_out(res_in, res_out, amount_in, pool.fee_bps);
            assert(amount_out >= min_out);

            let fee_amount: u128 = amount_in * (pool.fee_bps as u128) / 10000u128;
            let proto_enabled: bool = protocol_fee_enabled.get_or_use(0field, false);
            let proto_cut: u128     = proto_enabled ? fee_amount / 6u128 : 0u128;
            let fee_key: field = BHP256::hash_to_field(ProtocolFeeKey { pool_key: pool_key, token_id: token_in_id });
            protocol_fees.set(fee_key, protocol_fees.get_or_use(fee_key, 0u128) + proto_cut);

            let updated: PoolState = twap_update(pool, block.height);
            f_out.run();

            let new_ra: u128 = token_in_id == ca
                ? updated.reserve_a + amount_in
                : updated.reserve_a - min_out;
            let new_rb: u128 = token_in_id == ca
                ? updated.reserve_b - min_out
                : updated.reserve_b + amount_in;

            pools.set(pool_key, PoolState {
                token_a:     updated.token_a,
                token_b:     updated.token_b,
                reserve_a:   new_ra,
                reserve_b:   new_rb,
                lp_supply:   updated.lp_supply,
                fee_bps:     updated.fee_bps,
                price_a_cum: updated.price_a_cum,
                price_b_cum: updated.price_b_cum,
                last_block:  updated.last_block,
            });
        };
    }

    // =========================================================================
    // 8. swap_cpi_private_in — CPI swap path (private token in)
    // =========================================================================
    //
    // Callable from other contracts (router, auction post-close, auto-compound, etc.).
    // Accepts a private Token record for token_in and atomically deposits it to the
    // DEX's public balance via transfer_private_to_public. Record ownership is proven
    // by ZK — no prior transfer CPI needed; permissionless.
    //
    // Callers with PUBLIC token balances use the in-flight record pattern:
    //   1. token_registry::transfer_public_to_private(dex_address, amount_in, false)
    //      → creates a Token record owned by dex_address (not yet on-chain)
    //   2. Pass that record as token_in to this transition
    //   The record is created and consumed atomically — it never persists on-chain.
    //
    // token_out is sent to recipient via transfer_public (from DEX's public balance).
    // A 0-amount remainder record (dust) is emitted as an implicit output.
    //
    // min_out: slippage guard. DEX pays out exactly min_out; any surplus
    // stays in reserves as a bonus to LPs (same behaviour as swap).

    fn swap_cpi_private_in(
        token_in:            token_registry.aleo::Token,
        public token_out_id: field,
        public min_out:      u128,
        public recipient:    address,
    ) -> Final {
        assert(min_out > 0u128);
        let amount_in:   u128  = token_in.amount;
        let token_in_id: field = token_in.token_id;
        assert(amount_in > 0u128);
        assert(token_in_id != token_out_id);
        let (ca, cb): (field, field) = canonical_pair(token_in_id, token_out_id);
        let pool_key: field = BHP256::hash_to_field(PoolKey { token_a: ca, token_b: cb });

        // Deposit token_in to DEX's public balance atomically.
        // Full amount transferred; dust remainder record (0-amount) emitted as output.
        let (dust, f_deposit): (token_registry.aleo::Token, Final) =
            token_registry.aleo::transfer_private_to_public(self.address, amount_in, token_in);
        let f_out: Final =
            token_registry.aleo::transfer_public(token_out_id, recipient, min_out);

        return final {
            assert(!fairdrop_config_v2.aleo::paused.get_or_use(0field, false) && !paused.get_or_use(0field, false));
            f_deposit.run();

            let pool: PoolState = pools.get(pool_key);
            assert_eq(pool.token_a, ca);

            let res_in:  u128 = token_in_id == ca ? pool.reserve_a : pool.reserve_b;
            let res_out: u128 = token_in_id == ca ? pool.reserve_b : pool.reserve_a;

            let amount_out: u128 = swap_out(res_in, res_out, amount_in, pool.fee_bps);
            assert(amount_out >= min_out);

            let fee_amount: u128 = amount_in * (pool.fee_bps as u128) / 10000u128;
            let proto_enabled: bool = protocol_fee_enabled.get_or_use(0field, false);
            let proto_cut: u128     = proto_enabled ? fee_amount / 6u128 : 0u128;
            let fee_key: field = BHP256::hash_to_field(ProtocolFeeKey { pool_key: pool_key, token_id: token_in_id });
            protocol_fees.set(fee_key, protocol_fees.get_or_use(fee_key, 0u128) + proto_cut);

            let updated: PoolState = twap_update(pool, block.height);
            f_out.run();

            let new_ra: u128 = token_in_id == ca
                ? updated.reserve_a + amount_in
                : updated.reserve_a - min_out;
            let new_rb: u128 = token_in_id == ca
                ? updated.reserve_b - min_out
                : updated.reserve_b + amount_in;

            pools.set(pool_key, PoolState {
                token_a:     updated.token_a,
                token_b:     updated.token_b,
                reserve_a:   new_ra,
                reserve_b:   new_rb,
                lp_supply:   updated.lp_supply,
                fee_bps:     updated.fee_bps,
                price_a_cum: updated.price_a_cum,
                price_b_cum: updated.price_b_cum,
                last_block:  updated.last_block,
            });
        };
    }

    // =========================================================================
    // 9. swap_private — private path
    // =========================================================================
    //
    // Accepts a private token_in record and returns a private token_out record.
    // token_in is deposited to DEX's public balance via transfer_private_to_public;
    // token_out is drawn from DEX's public balance via transfer_public_to_private.
    // DEX balance and reserves move together — no phantom reserve divergence.
    // Identity and wallet balance hidden; trade amount inferable from reserve delta.
    //
    // Snapshot pattern: caller pre-computes amount_out from current reserves.
    // final {} verifies actual_out >= amount_out (prevents over-commitment).
    // If stale, tx reverts with records intact.

    fn swap_private(
        token_in:            token_registry.aleo::Token,
        public token_out_id: field,
        public amount_out:   u128,
        public min_out:      u128,
        public recipient:    address,
    ) -> (token_registry.aleo::Token, Final) {
        assert(amount_out >= min_out && amount_out > 0u128);
        let amount_in:   u128  = token_in.amount;
        let token_in_id: field = token_in.token_id;
        assert(token_in_id != token_out_id);
        assert(amount_in > 0u128);

        let (ca, cb): (field, field) = canonical_pair(token_in_id, token_out_id);
        let pool_key: field = BHP256::hash_to_field(PoolKey { token_a: ca, token_b: cb });

        let (dust, f_dep): (token_registry.aleo::Token, Final) =
            token_registry.aleo::transfer_private_to_public(self.address, amount_in, token_in);
        let (out_record, f_out): (token_registry.aleo::Token, Final) =
            token_registry.aleo::transfer_public_to_private(token_out_id, recipient, amount_out, false);

        return (out_record, final {
            assert(!fairdrop_config_v2.aleo::paused.get_or_use(0field, false) && !paused.get_or_use(0field, false));
            f_dep.run();

            let pool: PoolState = pools.get(pool_key);
            assert_eq(pool.token_a, ca);

            let res_in:  u128 = token_in_id == ca ? pool.reserve_a : pool.reserve_b;
            let res_out: u128 = token_in_id == ca ? pool.reserve_b : pool.reserve_a;

            let actual_out: u128 = swap_out(res_in, res_out, amount_in, pool.fee_bps);
            // Reject if committed amount_out exceeds what current reserves can provide.
            assert(amount_out <= actual_out);

            let fee_amount: u128    = amount_in * (pool.fee_bps as u128) / 10000u128;
            let proto_enabled: bool = protocol_fee_enabled.get_or_use(0field, false);
            let proto_cut: u128     = proto_enabled ? fee_amount / 6u128 : 0u128;
            let fee_key: field      = BHP256::hash_to_field(ProtocolFeeKey { pool_key: pool_key, token_id: token_in_id });
            protocol_fees.set(fee_key, protocol_fees.get_or_use(fee_key, 0u128) + proto_cut);

            let updated: PoolState = twap_update(pool, block.height);
            f_out.run();

            let new_ra: u128 = token_in_id == ca
                ? updated.reserve_a + amount_in
                : updated.reserve_a - amount_out;
            let new_rb: u128 = token_in_id == ca
                ? updated.reserve_b - amount_out
                : updated.reserve_b + amount_in;

            pools.set(pool_key, PoolState {
                token_a:     updated.token_a,
                token_b:     updated.token_b,
                reserve_a:   new_ra,
                reserve_b:   new_rb,
                lp_supply:   updated.lp_supply,
                fee_bps:     updated.fee_bps,
                price_a_cum: updated.price_a_cum,
                price_b_cum: updated.price_b_cum,
                last_block:  updated.last_block,
            });
        });
    }

    // =========================================================================
    // 10. lp_to_private — convert public LP balance to a private LpToken record
    // =========================================================================
    //
    // Atomically burns `amount` from the caller's public lp_balances entry and
    // returns a private LpToken record of the same amount. No pool state change.
    //
    // Enables private LP holders to participate in on-chain systems (e.g. farming)
    // that read lp_balances, or to shield an existing public LP position.

    fn lp_to_private(
        public pool_key: field,
        public amount:   u128,
    ) -> (LpToken, Final) {
        assert(amount > 0u128);
        let caller: address = self.signer;
        let lp: LpToken = LpToken { owner: caller, pool_key: pool_key, amount: amount };
        return (lp, final {
            assert(!fairdrop_config_v2.aleo::paused.get_or_use(0field, false) && !paused.get_or_use(0field, false));
            let key: field = BHP256::hash_to_field(LpBalKey { holder: caller, pool_key: pool_key });
            let bal: u128  = lp_balances.get_or_use(key, 0u128);
            assert(bal >= amount);
            lp_balances.set(key, bal - amount);
        });
    }

    // =========================================================================
    // 11. lp_to_public — convert a private LpToken record to a public lp_balances entry
    // =========================================================================
    //
    // Consumes a private LpToken record and credits `amount` to recipient's public
    // lp_balances entry. No pool state change.
    //
    // Enables private LP holders to participate in farming (which reads lp_balances)
    // without removing and re-adding liquidity. Also allows contracts holding a
    // private LpToken to deposit it into a publicly-accessible balance.

    fn lp_to_public(
        lp:               LpToken,
        public recipient: address,
    ) -> Final {
        let amount:   u128  = lp.amount;
        let pool_key: field = lp.pool_key;
        assert(amount > 0u128);
        return final {
            assert(!fairdrop_config_v2.aleo::paused.get_or_use(0field, false) && !paused.get_or_use(0field, false));
            let key: field = BHP256::hash_to_field(LpBalKey { holder: recipient, pool_key: pool_key });
            lp_balances.set(key, lp_balances.get_or_use(key, 0u128) + amount);
        };
    }

    // =========================================================================
    // 12. withdraw_protocol_fees — multisig governance
    // =========================================================================
    //
    // Drains protocol_fees[BHP256(pool_key, token_id)] to recipient.
    // Two-phase approve_op pattern: multisig writes approved_ops[op_hash]=true first,
    // then this transition executes. op_hash commits to pool_key, token_id, amount,
    // recipient, and nonce — no ambiguity about which pool/token is being drained.

    fn withdraw_protocol_fees(
        public pool_key:  field,
        public token_id:  field,
        public amount:    u128,
        public recipient: address,
        public op_nonce:  u64,
    ) -> Final {
        assert(amount > 0u128);

        let op_hash: field = BHP256::hash_to_field(WithdrawalOp {
            pool_key:  pool_key,
            token_id:  token_id,
            amount:    amount,
            recipient: recipient,
            nonce:     op_nonce,
        });

        let f_out: Final =
            token_registry.aleo::transfer_public(token_id, recipient, amount);

        return final {
            assert(fairdrop_multisig_v1.aleo::approved_ops.get_or_use(op_hash, false));
            assert(!consumed_ops.get_or_use(op_hash, false));
            consumed_ops.set(op_hash, true);

            let fee_key: field = BHP256::hash_to_field(ProtocolFeeKey { pool_key: pool_key, token_id: token_id });
            let available: u128 = protocol_fees.get_or_use(fee_key, 0u128);
            assert(available >= amount);
            protocol_fees.set(fee_key, available - amount);

            // Keep pool.reserve in sync with DEX public balance.
            // Protocol fees were accumulated from public swaps, which incremented both
            // the DEX balance and the pool reserve. Withdrawing must decrement the reserve
            // or LP redemptions will compute entitlements the DEX can't cover.
            let pool: PoolState = pools.get(pool_key);
            // Guard: token_id must belong to this pool. A governance op that commits a
            // mismatched pool_key/token_id pair would otherwise silently decrement the
            // wrong reserve side.
            assert(token_id == pool.token_a || token_id == pool.token_b);
            let is_token_a: bool = token_id == pool.token_a;
            // Guard: reserve must cover amount. LP withdrawals draw proportionally from
            // reserves that include accumulated protocol fee portions, so reserve can fall
            // below the recorded protocol fee balance after heavy LP exit.
            let current_res: u128 = is_token_a ? pool.reserve_a : pool.reserve_b;
            assert(amount <= current_res);
            pools.set(pool_key, PoolState {
                token_a:     pool.token_a,
                token_b:     pool.token_b,
                reserve_a:   is_token_a ? pool.reserve_a - amount : pool.reserve_a,
                reserve_b:   is_token_a ? pool.reserve_b : pool.reserve_b - amount,
                lp_supply:   pool.lp_supply,
                fee_bps:     pool.fee_bps,
                price_a_cum: pool.price_a_cum,
                price_b_cum: pool.price_b_cum,
                last_block:  pool.last_block,
            });

            f_out.run();
        };
    }

    // =========================================================================
    // 13. update_fee — multisig governance
    // =========================================================================
    //
    // Updates fee_bps for an existing pool. Bounded to MAX_FEE_BPS (100 bps = 1%).
    // Requires a 3-of-5 admin-signed FeeUpdateOp.

    fn update_fee(
        public pool_key: field,
        public fee_bps:  u16,
        public op_nonce: u64,
    ) -> Final {
        assert(fee_bps <= MAX_FEE_BPS);

        let op_hash: field = BHP256::hash_to_field(FeeUpdateOp {
            pool_key: pool_key,
            fee_bps:  fee_bps,
            nonce:    op_nonce,
        });

        return final {
            assert(fairdrop_multisig_v1.aleo::approved_ops.get_or_use(op_hash, false));
            assert(!consumed_ops.get_or_use(op_hash, false));
            consumed_ops.set(op_hash, true);

            let pool: PoolState = pools.get(pool_key);
            pools.set(pool_key, PoolState {
                token_a:     pool.token_a,
                token_b:     pool.token_b,
                reserve_a:   pool.reserve_a,
                reserve_b:   pool.reserve_b,
                lp_supply:   pool.lp_supply,
                fee_bps:     fee_bps,
                price_a_cum: pool.price_a_cum,
                price_b_cum: pool.price_b_cum,
                last_block:  pool.last_block,
            });
        };
    }

    // =========================================================================
    // 14. toggle_protocol_fee — multisig governance
    // =========================================================================
    //
    // Enables or disables the protocol fee split (1/6 of swap fee → protocol_fees).
    // Disabled by default (protocol_fee_enabled[0field] not set → false).
    // Requires a 3-of-5 admin-signed ProtocolFeeToggleOp.

    fn toggle_protocol_fee(
        public enabled:  bool,
        public op_nonce: u64,
    ) -> Final {
        let op_hash: field = BHP256::hash_to_field(ProtocolFeeToggleOp {
            enabled: enabled,
            nonce:   op_nonce,
        });

        return final {
            assert(fairdrop_multisig_v1.aleo::approved_ops.get_or_use(op_hash, false));
            assert(!consumed_ops.get_or_use(op_hash, false));
            consumed_ops.set(op_hash, true);

            protocol_fee_enabled.set(0field, enabled);
        };
    }

    // =========================================================================
    // 15. toggle_paused — local DEX pause (multisig governance)
    // =========================================================================
    //
    // Pauses or unpauses the DEX independently of fairdrop_config_v2::paused.
    // Either being true halts swap/liquidity operations.
    // fairdrop_config_v2::paused remains the global protocol kill switch and
    // cannot be overridden by setting local paused = false.

    fn toggle_paused(
        public is_paused: bool,
        public op_nonce:  u64,
    ) -> Final {
        let op_hash: field = BHP256::hash_to_field(PauseToggleOp {
            paused: is_paused,
            nonce:  op_nonce,
        });

        return final {
            assert(fairdrop_multisig_v1.aleo::approved_ops.get_or_use(op_hash, false));
            assert(!consumed_ops.get_or_use(op_hash, false));
            consumed_ops.set(op_hash, true);

            paused.set(0field, is_paused);
        };
    }
}
