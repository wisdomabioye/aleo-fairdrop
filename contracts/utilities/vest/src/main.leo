// fairdrop_vest_v3.aleo — Post-claim token vesting with block-based linear release.
// Leo 4.0 migration: fn/Final/final/:: — no behavioural changes.
//
// Lifecycle:
//   1. Auction's claim_vested CPI calls fairdrop_vest_v3.aleo::create_vest(...) with
//      vesting parameters derived from the auction's own config + ended_at_block.
//      The auction contract is responsible for consuming the token budget from its
//      own escrow_sales (via mint/burn in its own SUPPLY_MANAGER_ROLE context).
//      create_vest issues a private VestedAllocation record to the bidder.
//
//   2. release(vest, amount) — permissionless (record ownership enforced by Aleo).
//      After cliff_block, releases up to vested_so_far - released tokens to the bidder.
//      Calls token_registry.aleo::mint_private (vest holds SUPPLY_MANAGER_ROLE).
//      Returns updated VestedAllocation with released += amount.
//
// Vesting math (S8 fix — uniform base across all bidders on same auction):
//   cliff_block   = state.ended_at_block + config.vest_cliff_blocks
//   end_block     = state.ended_at_block + config.vest_end_blocks
//   vested_so_far = if block.height >= end_block { total_amount }
//                   else { total_amount * (block.height - cliff_block) / vesting_duration }
//   available     = vested_so_far - released
//
// Caller authentication (D12):
//   create_vest: only registered auction programs (set via set_allowed_caller by admin).
//   release: permissionless — Aleo cryptographically enforces record ownership.
//
// Role requirement:
//   fairdrop_vest_v3.aleo must hold SUPPLY_MANAGER_ROLE (3) on each sale token used with
//   vesting. Token creators must call token_registry.aleo::set_role(fairdrop_vest_v3.aleo, 3)
//   before any create_vest call. Verified in finalize_create_vest (early fail).
//   Also required for the auction contract (burn_private at close, the same role covers
//   both programs — token creator must authorize both addresses).
//
// Overflow note:
//   Intermediate product: total_amount * blocks_vested. For realistic token amounts
//   (< 2^64 raw units) and realistic vesting durations (< 2^22 blocks ≈ 1 year at ~10s),
//   the product < 2^86 — well within u128. Leo reverts on overflow rather than wrapping.
//
// Integration pattern for auction contracts (claim_vested):
//   1. Deduct sale_amount from escrow_sales (auction's mint budget).
//   2. Validate ended_at_block == state.ended_at_block in finalize.
//   3. Validate cliff_blocks == config.vest_cliff_blocks in finalize.
//   4. Validate vest_end_blocks == config.vest_end_blocks in finalize.
//   5. CPI fairdrop_vest_v3.aleo::create_vest(auction_id, bid.owner, sale_token_id,
//        sale_amount, ended_at_block, cliff_blocks, vest_end_blocks).
//   6. Return VestedAllocation to bidder instead of Token.
//
// ── Privacy model ────────────────────────────────────────────────────────────
// Bidder address (vest.owner):
//   Present in VestedAllocation record (private, encrypted to bidder).
//   NOT in any finalize — never on-chain. ✓
//   Revealed as the tx signer in create_vest and release calls. Inherent.
//   For max privacy: use a fresh address for bidding; same address will claim.
//
// Vesting amounts revealed at release time:
//   total_amount, released, cliff_block, end_block, amount — all finalize inputs.
//   These are already derivable from the public auction config for any observer who
//   identifies the bidder — no new privacy loss beyond the bid itself.
//
// ── Leo 4.0 migration notes ───────────────────────────────────────────────────
//   async constructor → constructor
//   async transition  → fn; async function finalize_* → deleted, inlined as final {}
//   self.caller captured before final {} for D12 guard (create_vest)
//   record fields captured before final {} in release (all 7 vest fields)
//   TokenOwner struct moved outside program {}
//   Future → Final, .aleo/ → .aleo::
// ─────────────────────────────────────────────────────────────────────────────

import fairdrop_multisig_v2.aleo;
import token_registry.aleo;

// ═════════════════════════════════════════════════════════════════════════════
// Module-level struct definitions
// Leo 4.0: structs outside program {} (convention; records stay inside).
// ═════════════════════════════════════════════════════════════════════════════

// From token_registry.aleo — used for role-key BHP256 hashing.
// Must match token_registry.aleo TokenOwner field order exactly.
struct TokenOwner { account: address, token_id: field }

// Op struct for set_allowed_caller two-phase multisig approval.
// op_hash = BHP256::hash_to_field(AllowedCallerOp { caller, allowed, nonce })
struct AllowedCallerOp { caller: address, allowed: bool, nonce: u64 }

// =============================================================================
// Program interface
// =============================================================================

program fairdrop_vest_v3.aleo {
    // Upgrade governance: 3-of-5 multi-sig must call fairdrop_multisig_v2.aleo::approve_upgrade
    // with contract_key=5field and this program's compiled checksum before deployment.
    @checksum(mapping="fairdrop_multisig_v2.aleo::approved_upgrades", key="5field")
    constructor() {}

    // =========================================================================
    // Constants
    // =========================================================================

    // Required role for mint_private at release time.
    // Token creators must grant this to fairdrop_vest_v3.aleo.
    const SUPPLY_MANAGER_ROLE: u8 = 3u8;

    // =========================================================================
    // Record
    // =========================================================================

    // Private to the bidder (owner). Consumed and re-issued at each release.
    // All vesting parameters are self-contained — no external mapping lookups
    // required in release (the record is the single source of truth).
    //
    // owner:         bidder's address — private; never appears in any finalize.
    // sale_token_id: token to release — revealed in release finalize (public info).
    // auction_id:    informational; not used in release finalize.
    // total_amount:  original vested quantity — revealed in release finalize.
    // released:      cumulative tokens released so far — revealed in release finalize.
    // cliff_block:   absolute block — no releases permitted before this block.
    // end_block:     absolute block — fully vested after this block.
    record VestedAllocation {
        owner:          address,
        sale_token_id:  field,
        auction_id:     field,
        total_amount:   u128,
        released:       u128,
        cliff_block:    u32,
        end_block:      u32,
    }

    // =========================================================================
    // Mappings
    // =========================================================================

    // Auction programs authorised to call create_vest (D12).
    mapping allowed_callers: address => bool;

    // Consumed op hashes — prevents the same multisig approval from executing twice.
    mapping consumed_ops: field => bool;

    // =========================================================================
    // 1. set_allowed_caller — admin only
    // =========================================================================
    // Registers or deregisters an auction program as a trusted caller.
    // Must be called for each auction contract during Phase 1 deployment.
    //
    // Leo 4.0: self.signer captured before final {} (proof-context only).

    fn set_allowed_caller(
        public program_addr: address,
        public allowed:      bool,
        public op_nonce:     u64,
    ) -> Final {
        let op_hash: field = BHP256::hash_to_field(AllowedCallerOp {
            caller:  program_addr,
            allowed: allowed,
            nonce:   op_nonce,
        });
        return final {
            assert(fairdrop_multisig_v2.aleo::approved_ops.get_or_use(op_hash, false));
            assert(!consumed_ops.get_or_use(op_hash, false));
            consumed_ops.set(op_hash, true);
            allowed_callers.set(program_addr, allowed);
        };
    }

    // =========================================================================
    // 2. create_vest — CPI from auction claim_vested
    // =========================================================================
    // Issues a VestedAllocation record to the bidder with absolute cliff/end
    // blocks computed from ended_at_block (S8 fix — uniform vesting base).
    //
    // No token record is consumed here. The auction contract is responsible for
    // decrementing its own escrow_sales budget (the burn/mint accounting). Vest
    // only issues the schedule record and later mints at release time.
    //
    // Guards:
    //   D12: allowed_callers[self.caller] must be true.
    //   total_amount > 0: zero-amount vests would mint 0 tokens at release — useless.
    //   vest_end_blocks > cliff_blocks: prevents division-by-zero in release vesting math.
    //   SUPPLY_MANAGER_ROLE: early fail if fairdrop_vest_v3.aleo lacks minting rights.
    //
    // Privacy: owner (bidder) is a private parameter — never reaches finalize.
    // The auction's claim transition passes bid.owner (private record field) directly.
    //
    // Parameters validated by AUCTION's finalize (not vest's):
    //   ended_at_block: must equal auction_states[auction_id].ended_at_block.
    //   cliff_blocks:   must equal auction_configs[auction_id].vest_cliff_blocks.
    //   vest_end_blocks: must equal auction_configs[auction_id].vest_end_blocks.
    //
    // Leo 4.0: self.caller captured before final {} for D12 guard.

    fn create_vest(
        public auction_id:      field,
        owner:                  address,    // private — bidder address (never finalize)
        public sale_token_id:   field,
        public total_amount:    u128,
        public ended_at_block:  u32,
        public cliff_blocks:    u32,
        public vest_end_blocks: u32,
    ) -> (VestedAllocation, Final) {
        let vest: VestedAllocation = VestedAllocation {
            owner:         owner,
            sale_token_id: sale_token_id,
            auction_id:    auction_id,
            total_amount:  total_amount,
            released:      0u128,
            cliff_block:   ended_at_block + cliff_blocks,
            end_block:     ended_at_block + vest_end_blocks,
        };
        // Capture self.caller — the calling auction program address for D12.
        let caller: address = self.caller;
        return (vest, final {
            // D12: only registered auction programs may create vests.
            assert(allowed_callers.get_or_use(caller, false));
            // Prevent zero-amount vests (release would mint 0 tokens — useless and wasteful).
            assert(total_amount > 0u128);
            // Prevent division-by-zero in release: vesting_duration = end_block - cliff_block.
            // vest_end_blocks > cliff_blocks → end_block > cliff_block always.
            assert(vest_end_blocks > cliff_blocks);
            // Early fail: verify fairdrop_vest_v3.aleo has SUPPLY_MANAGER_ROLE on sale token.
            // Ensures release will succeed. Token creator must grant this before create_vest.
            let role_key: field = BHP256::hash_to_field(TokenOwner {
                account:  fairdrop_vest_v3.aleo,
                token_id: sale_token_id,
            });
            let role: u8 = token_registry.aleo::roles.get_or_use(role_key, 0u8);
            assert(role == SUPPLY_MANAGER_ROLE);
        });
    }

    // =========================================================================
    // 3. release — bidder releases vested tokens after cliff
    // =========================================================================
    // Permissionless: only the VestedAllocation owner (bidder) can call, because
    // Aleo cryptographically enforces that a record can only be spent by its owner.
    //
    // Vesting math (all in final {}, where block.height is available):
    //   vesting_duration = end_block - cliff_block  (validated > 0 at create_vest)
    //   blocks_vested    = min(block.height - cliff_block, vesting_duration)
    //   vested_so_far    = total_amount * blocks_vested / vesting_duration
    //   available        = vested_so_far - released
    //   assert(amount > 0 && amount <= available)
    //
    // D11 pattern: `amount` is caller-supplied. Finalize validates against on-chain
    // vesting math. If the block height advanced since the caller computed available,
    // the call succeeds (more tokens are vested). If the caller over-estimated, the
    // tx reverts. Frontend should re-read block.height before submitting.
    //
    // Returns:
    //   token_registry.aleo::Token — private, minted to vest.owner (never in finalize).
    //   VestedAllocation           — updated record with released += amount (issued to owner).
    //
    // After full release: vest.released == vest.total_amount.
    //   vested_so_far = total_amount, available = 0.
    //   Any amount > 0 fails assert(amount <= 0). Record is effectively exhausted.
    //
    // Leo 4.0: all vest record fields captured before final {} (record fields are
    // proof-context only — private UTXO data unavailable inside final {}).

    // !! COMMENTED OUT — Leo 4.0 compiler bug: "Finalization not found"
    // token_registry.aleo::mint_private returns a Final. When this function is enabled,
    // any program that imports fairdrop_vest_v3.aleo AND independently calls
    // token_registry.aleo::mint_private (or any other Final-returning CPI) fails to build
    // with "Finalization not found: token_registry.aleo::mint_private".
    // Root cause: Leo compiler panics when the same Final-returning CPI appears in multiple
    // programs in the import tree. VestedAllocation is a record of this program — release
    // cannot be moved elsewhere. Re-enable once Leo fixes the finalization deduplication bug.
    // Tracked in: docs/leo_bug_finalization_not_found.md | https://github.com/ProvableHQ/leo/issues/29297
    //
    fn release(
        vest:          VestedAllocation,
        public amount: u128,
    ) -> (token_registry.aleo::Token, VestedAllocation, Final) {
        // Capture all private record fields before final block.
        let total_amount:  u128 = vest.total_amount;
        let released:      u128 = vest.released;
        let cliff_block:   u32  = vest.cliff_block;
        let end_block:     u32  = vest.end_block;

        // Mint vested tokens privately to the owner.
        // vest.owner is private (from record) — never reaches finalize.
        // vest.sale_token_id is revealed in finalize (already public auction info).
        let (token, f_mint): (token_registry.aleo::Token, Final) =
            token_registry.aleo::mint_private(
                vest.sale_token_id,
                vest.owner,
                amount,
                false,          // external_authorization_required
                4294967295u32,  // authorized_until — no expiry
            );

        // Consume the old VestedAllocation, issue updated one with released += amount.
        // Leo reverts on overflow: released + amount > u128::MAX — impossible in practice.
        let updated: VestedAllocation = VestedAllocation {
            owner:         vest.owner,
            sale_token_id: vest.sale_token_id,
            auction_id:    vest.auction_id,
            total_amount:  vest.total_amount,
            released:      vest.released + amount,
            cliff_block:   vest.cliff_block,
            end_block:     vest.end_block,
        };

        return (token, updated, final {
            // Execute the mint Final.
            f_mint.run();

            // G_V5: zero-amount releases are invalid (and wasteful).
            assert(amount > 0u128);

            // G_V1: cliff must have passed before any tokens can be released.
            assert(block.height >= cliff_block);

            // Compute how many blocks have elapsed within the vesting window.
            // Cap at vesting_duration when block.height >= end_block (fully elapsed).
            let vesting_duration: u32 = end_block - cliff_block;  // > 0 (enforced at create_vest)
            let blocks_vested: u32    = block.height >= end_block
                ? vesting_duration                  // fully elapsed: all tokens vested
                : block.height - cliff_block;       // partial: proportional

            // Compute vested_so_far via linear interpolation.
            // Safe from u128 overflow for realistic values (see file header overflow note).
            let vested_so_far: u128 = total_amount * (blocks_vested as u128) / (vesting_duration as u128);

            // G_V9: amount must not exceed available (vested minus already released).
            let available: u128 = vested_so_far - released;
            assert(amount <= available);
        });
    }
}
