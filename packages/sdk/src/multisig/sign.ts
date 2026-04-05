/**
 * Off-chain signing preparation for fairdrop_multisig_v1.aleo.
 *
 * Each `prepare*` function computes the exact field value that 3 admins
 * must sign (using their Aleo private key) before the corresponding
 * `submit*` transaction can be submitted on-chain.
 *
 * The actual signing — `signature = privateKey.sign(msgHash)` — is the
 * admin's responsibility and is not performed by the SDK.
 *
 * Workflow for approve_op (config setters, set_allowed_caller, treasury withdrawal):
 *   1. Compute op_hash with the relevant computeXxxOpHash() from @fairdrop/sdk/hash
 *   2. Call prepareApproveOp(op_hash, requestId) → { msgHash }
 *   3. Each of 3 admins: sig_N = sign(privateKey, msgHash)
 *   4. Call submitApproveOp(op_hash, sig1, admin1, ..., requestId)
 *   5. Call the target transition (config setter, set_allowed_caller, etc.)
 *
 * Workflow for approve_upgrade:
 *   1. Call prepareApproveUpgrade(contractKey, checksum, requestId) → { msgHash, upgradeHash }
 *   2. Each of 3 admins: sig_N = sign(privateKey, msgHash)
 *   3. Call submitApproveUpgrade(contractKey, checksum, sig1, admin1, ..., requestId)
 *
 * Workflow for update_admin:
 *   1. Call prepareUpdateAdmin(oldAdmin, newAdmin, requestId) → { msgHash }
 *   2. Each of 3 admins: sig_N = sign(privateKey, msgHash)
 *   3. Call submitUpdateAdmin(oldAdmin, newAdmin, sig1, admin1, ..., requestId)
 */

import {
  computeApproveOpMsgHash,
  computeUpgradeOpHash,
  computeUpdateAdminOpHash,
} from '../hash/keys';

// ── approve_op ────────────────────────────────────────────────────────────────

/**
 * Prepare the message hash for approve_op.
 *
 * Admins sign ApproveOpMsg { op_hash, request_id } — NOT the op_hash directly.
 * This binds each signature to a specific request_id preventing replay.
 *
 * @param opHash     BHP256 hash of the target op struct (from computeXxxOpHash).
 * @param requestId  Unique u64 counter — must not have been used before.
 * @returns          msgHash — the field each admin must sign.
 */
export function prepareApproveOp(
  opHash:    string,
  requestId: bigint,
): { msgHash: string } {
  return { msgHash: computeApproveOpMsgHash(opHash, requestId) };
}

// ── approve_upgrade ───────────────────────────────────────────────────────────

/**
 * Prepare the message hash for approve_upgrade.
 *
 * Admins sign BHP256(ApproveUpgradeOp { contract_key, checksum, request_id })
 * directly (no ApproveOpMsg wrapper — the op IS the message).
 *
 * @param contractKey  UPGRADE_KEY constant for the target contract.
 * @param checksum     32-byte SHA-256 of the new program bytecode (from `leo build`).
 * @param requestId    Unique u64 counter.
 * @returns            msgHash — the field each admin must sign.
 */
export function prepareApproveUpgrade(
  contractKey: string,
  checksum:    number[],
  requestId:   bigint,
): { msgHash: string } {
  return { msgHash: computeUpgradeOpHash(contractKey, checksum, requestId) };
}

// ── update_admin ──────────────────────────────────────────────────────────────

/**
 * Prepare the message hash for update_admin.
 *
 * Admins sign BHP256(UpdateAdminOp { old_admin, new_admin, request_id }) directly.
 *
 * @param oldAdmin   Admin address to remove.
 * @param newAdmin   Replacement admin address.
 * @param requestId  Unique u64 counter.
 * @returns          msgHash — the field each admin must sign.
 */
export function prepareUpdateAdmin(
  oldAdmin:  string,
  newAdmin:  string,
  requestId: bigint,
): { msgHash: string } {
  return { msgHash: computeUpdateAdminOpHash(oldAdmin, newAdmin, requestId) };
}