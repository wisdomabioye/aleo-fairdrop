/**
 * BHP256 key derivation functions — mirrors every on-chain BHP256::hash_to_field call
 * used across the Fairdrop and token_registry contracts.
 *
 * All functions require @provablehq/sdk WASM to be loaded.
 * Inputs must be valid Leo-typed literals (e.g. address strings, `Nfield` suffixed fields).
 */

import { hashStruct } from './_bhp';

// ── token_registry.aleo ───────────────────────────────────────────────────────

/**
 * Compute the (account, tokenId) mapping key used by token_registry.aleo.
 * Mirrors: BHP256::hash_to_field(TokenOwner { account, token_id })
 *
 * Used for: authorized_balances, balances, roles lookups.
 */
export function computeTokenOwnerKey(account: string, tokenId: string): string {
  return hashStruct(`{ account: ${account}, token_id: ${tokenId} }`);
}

// ── Auction contracts ─────────────────────────────────────────────────────────

/**
 * Compute the auction_id for any auction type.
 * Mirrors: BHP256::hash_to_field(AuctionKey { creator, nonce, program_salt })
 *
 * program_salt is the PROGRAM_SALT constant in each auction contract
 * (e.g. 1field for Dutch, 2field for Ascending, etc.).
 */
export function computeAuctionId(
  creator:     string,
  nonce:       bigint,
  programSalt: string,
): string {
  return hashStruct(`{ creator: ${creator}, nonce: ${nonce}u64, program_salt: ${programSalt} }`);
}

/**
 * Compute the pseudonymous per-bidder key for sealed auctions.
 * Mirrors: BHP256::hash_to_field(BidderKey { bidder, auction_id })
 *
 * Used as the key in pending_commits and as input to slash_unrevealed.
 */
export function computeBidderKey(bidder: string, auctionId: string): string {
  return hashStruct(`{ bidder: ${bidder}, auction_id: ${auctionId} }`);
}

// ── fairdrop_ref_v2.aleo ──────────────────────────────────────────────────────

/**
 * Compute a referral list enumeration key.
 * Mirrors: BHP256::hash_to_field(RefListKey { code_id, index })
 *
 * Used to enumerate bidder_keys from the referral_list mapping.
 */
export function computeRefListKey(codeId: string, index: bigint): string {
  return hashStruct(`{ code_id: ${codeId}, index: ${index}u64 }`);
}

// ── Governance (multisig) ─────────────────────────────────────────────────────

/**
 * Compute the op hash for a ConfigOp (config setters).
 * Mirrors: BHP256::hash_to_field(ConfigOp { fn_key, op_value, nonce })
 */
export function computeConfigOpHash(fnKey: string, opValue: string, nonce: bigint): string {
  return hashStruct(`{ fn_key: ${fnKey}, op_value: ${opValue}, nonce: ${nonce}u64 }`);
}

/**
 * Compute the op hash for an AllowedCallerOp (set_allowed_caller in utilities).
 * Mirrors: BHP256::hash_to_field(AllowedCallerOp { caller, allowed, nonce })
 */
export function computeAllowedCallerOpHash(
  caller:  string,
  allowed: boolean,
  nonce:   bigint,
): string {
  return hashStruct(`{ caller: ${caller}, allowed: ${allowed}, nonce: ${nonce}u64 }`);
}

/**
 * Compute the op hash for a WithdrawalOp (withdraw_treasury_fees in auction contracts).
 * Mirrors: BHP256::hash_to_field(WithdrawalOp { amount, recipient, nonce })
 */
export function computeWithdrawalOpHash(
  amount:    bigint,
  recipient: string,
  nonce:     bigint,
): string {
  return hashStruct(`{ amount: ${amount}u128, recipient: ${recipient}, nonce: ${nonce}u64 }`);
}

/**
 * Compute the message hash signed by each admin for approve_op.
 * Mirrors: BHP256::hash_to_field(ApproveOpMsg { op_hash, request_id })
 *
 * Admins sign this — NOT the op_hash directly — so signatures are bound
 * to a specific request_id and cannot be replayed with a different one.
 */
export function computeApproveOpMsgHash(opHash: string, requestId: bigint): string {
  return hashStruct(`{ op_hash: ${opHash}, request_id: ${requestId}u64 }`);
}

/**
 * Compute the op hash for an ApproveUpgradeOp.
 * Mirrors: BHP256::hash_to_field(ApproveUpgradeOp { contract_key, checksum, request_id })
 *
 * checksum is the [u8; 32] compiled program checksum from `leo build` output.
 */
export function computeUpgradeOpHash(
  contractKey: string,
  checksum:    number[],
  requestId:   bigint,
): string {
  const checksumLeo = `[ ${checksum.map((b) => `${b}u8`).join(', ')} ]`;
  return hashStruct(
    `{ contract_key: ${contractKey}, checksum: ${checksumLeo}, request_id: ${requestId}u64 }`,
  );
}

/**
 * Compute the op hash for an UpdateAdminOp.
 * Mirrors: BHP256::hash_to_field(UpdateAdminOp { old_admin, new_admin, request_id })
 */
export function computeUpdateAdminOpHash(
  oldAdmin:  string,
  newAdmin:  string,
  requestId: bigint,
): string {
  return hashStruct(
    `{ old_admin: ${oldAdmin}, new_admin: ${newAdmin}, request_id: ${requestId}u64 }`,
  );
}

// ── Utilities ─────────────────────────────────────────────────────────────────

/**
 * Generate a cryptographically random token_id field literal.
 * Used when registering a new token via token_registry.aleo.
 */
export function generateTokenId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let v = 0n;
  for (const b of bytes) v = (v << 8n) | BigInt(b);
  return `${v}field`;
}
