/**
 * Transaction builders for fairdrop_multisig_v1.aleo.
 *
 * All governance actions require 3-of-N admin signatures.
 * Signatures are passed as Leo `signature` type (bech32 "sign1…" strings).
 *
 * Workflow for approve_op (governing config changes, allowed_caller updates):
 *   1. Compute op_hash off-chain (BHP256 of the specific Op struct)
 *   2. Collect sig_1..3 from 3 admins — each signs BHP256(ApproveOpMsg { op_hash, request_id })
 *   3. Call approveOp — finalize verifies sigs and stores approved_ops[op_hash] = true
 *   4. Call the target transition (config setter, set_allowed_caller, etc.) with the same nonce
 */

import { PROGRAMS }    from '@fairdrop/config';
import { DEFAULT_TX_FEE, type TxSpec } from './_types';

const MULTISIG_PROGRAM = PROGRAMS.multisig.programId;

/** Format a [u8; 32] checksum array as a Leo array literal. */
function formatChecksum(bytes: number[]): string {
  return `[ ${bytes.map(b => `${b}u8`).join(', ')} ]`;
}

/** Shared 3-of-N signature+admin inputs. */
function sigInputs(
  sig1: string, admin1: string,
  sig2: string, admin2: string,
  sig3: string, admin3: string,
): string[] {
  return [sig1, admin1, sig2, admin2, sig3, admin3];
}

/**
 * initialize — one-time setup; writes the 5 hardcoded admin addresses.
 * Reverts if already called (guard: assert(!already)).
 */
export function initializeMultisig(fee = DEFAULT_TX_FEE): TxSpec {
  return {
    program: MULTISIG_PROGRAM, function: 'initialize',
    inputs:  [],
    fee,     privateFee: false,
  };
}

/**
 * approve_upgrade — approve a contract upgrade checksum.
 *
 * @param contractKey  Upgrade key field (0–11field, one per upgradeable contract).
 * @param checksum     32-byte SHA-256 hash of the new program bytecode.
 * @param requestId    Unique request ID (prevents replay); use a monotonic counter.
 */
export function approveUpgrade(
  contractKey: string,
  checksum:    number[],
  sig1: string, admin1: string,
  sig2: string, admin2: string,
  sig3: string, admin3: string,
  requestId:   bigint,
  fee = DEFAULT_TX_FEE,
): TxSpec {
  return {
    program: MULTISIG_PROGRAM, function: 'approve_upgrade',
    inputs:  [
      contractKey,
      formatChecksum(checksum),
      ...sigInputs(sig1, admin1, sig2, admin2, sig3, admin3),
      `${requestId}u64`,
    ],
    fee, privateFee: false,
  };
}

/**
 * approve_op — approve a governance operation (config change, allowed_caller, etc.).
 *
 * @param opHash    BHP256(OpStruct) — unique hash of the proposed change.
 * @param requestId Unique request ID (prevents replay).
 */
export function approveOp(
  opHash:    string,
  sig1: string, admin1: string,
  sig2: string, admin2: string,
  sig3: string, admin3: string,
  requestId: bigint,
  fee = DEFAULT_TX_FEE,
): TxSpec {
  return {
    program: MULTISIG_PROGRAM, function: 'approve_op',
    inputs:  [
      opHash,
      ...sigInputs(sig1, admin1, sig2, admin2, sig3, admin3),
      `${requestId}u64`,
    ],
    fee, privateFee: false,
  };
}

/**
 * update_admin — replace one admin address with another.
 *
 * @param oldAdmin Current admin address to remove.
 * @param newAdmin Replacement admin address.
 * @param requestId Unique request ID (prevents replay).
 */
export function updateAdmin(
  oldAdmin:  string,
  newAdmin:  string,
  sig1: string, admin1: string,
  sig2: string, admin2: string,
  sig3: string, admin3: string,
  requestId: bigint,
  fee = DEFAULT_TX_FEE,
): TxSpec {
  return {
    program: MULTISIG_PROGRAM, function: 'update_admin',
    inputs:  [
      oldAdmin, newAdmin,
      ...sigInputs(sig1, admin1, sig2, admin2, sig3, admin3),
      `${requestId}u64`,
    ],
    fee, privateFee: false,
  };
}
