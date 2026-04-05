/**
 * On-chain submission builders for fairdrop_multisig_v1.aleo.
 *
 * Each function constructs a TxSpec ready to pass to executeTransaction().
 * Signatures must be obtained off-chain using the prepare* functions from
 * @fairdrop/sdk/multisig — each admin signs the msgHash with their private key.
 *
 * Transition input ordering (from the Leo contract):
 *   approve_upgrade : contract_key, checksum[u8;32], sig1, admin1, sig2, admin2, sig3, admin3, request_id
 *   approve_op      : op_hash, sig1, admin1, sig2, admin2, sig3, admin3, request_id
 *   update_admin    : old_admin, new_admin, sig1, admin1, sig2, admin2, sig3, admin3, request_id
 */

import { PROGRAMS }                       from '@fairdrop/config';
import { DEFAULT_TX_FEE, type TxSpec }    from '../transactions/_types';

const MULTISIG_PROGRAM = PROGRAMS.multisig.programId;

/** Format a [u8; 32] checksum array as a Leo array literal. */
function formatChecksum(bytes: number[]): string {
  return `[ ${bytes.map(b => `${b}u8`).join(', ')} ]`;
}

/** 3-of-N signature + admin address pairs in positional order. */
function sigInputs(
  sig1: string, admin1: string,
  sig2: string, admin2: string,
  sig3: string, admin3: string,
): string[] {
  return [sig1, admin1, sig2, admin2, sig3, admin3];
}

/**
 * initialize — one-time multisig setup.
 *
 * Writes the 5 hardcoded admin addresses. Reverts if already initialised.
 */
export function initializeMultisig(fee = DEFAULT_TX_FEE): TxSpec {
  return {
    program:  MULTISIG_PROGRAM,
    function: 'initialize',
    inputs:   [],
    fee,
    privateFee: false,
  };
}

/**
 * submitApproveUpgrade — record approval for a contract upgrade checksum.
 *
 * Call after all 3 admins have signed with prepareApproveUpgrade().
 *
 * @param contractKey  UPGRADE_KEY constant for the target contract (0–11field).
 * @param checksum     32-byte SHA-256 of the new program bytecode (from `leo build`).
 * @param sig1..3      bech32 "sign1…" signatures from 3 admins.
 * @param admin1..3    Aleo addresses of the corresponding signers.
 * @param requestId    Unique u64 counter — must match the one used in prepareApproveUpgrade.
 */
export function submitApproveUpgrade(
  contractKey: string,
  checksum:    number[],
  sig1: string, admin1: string,
  sig2: string, admin2: string,
  sig3: string, admin3: string,
  requestId:   bigint,
  fee = DEFAULT_TX_FEE,
): TxSpec {
  return {
    program:  MULTISIG_PROGRAM,
    function: 'approve_upgrade',
    inputs:   [
      contractKey,
      formatChecksum(checksum),
      ...sigInputs(sig1, admin1, sig2, admin2, sig3, admin3),
      `${requestId}u64`,
    ],
    fee,
    privateFee: false,
  };
}

/**
 * submitApproveOp — record approval for a governance operation.
 *
 * Call after all 3 admins have signed with prepareApproveOp().
 * Stores approved_ops[op_hash] = true; the target transition reads this.
 *
 * @param opHash    BHP256(OpStruct) — from the relevant computeXxxOpHash().
 * @param requestId Unique u64 counter — must match prepareApproveOp.
 */
export function submitApproveOp(
  opHash:    string,
  sig1: string, admin1: string,
  sig2: string, admin2: string,
  sig3: string, admin3: string,
  requestId: bigint,
  fee = DEFAULT_TX_FEE,
): TxSpec {
  return {
    program:  MULTISIG_PROGRAM,
    function: 'approve_op',
    inputs:   [
      opHash,
      ...sigInputs(sig1, admin1, sig2, admin2, sig3, admin3),
      `${requestId}u64`,
    ],
    fee,
    privateFee: false,
  };
}

/**
 * submitUpdateAdmin — replace one admin address with another.
 *
 * Call after all 3 admins have signed with prepareUpdateAdmin().
 *
 * @param oldAdmin  Admin address to remove.
 * @param newAdmin  Replacement admin address.
 * @param requestId Unique u64 counter — must match prepareUpdateAdmin.
 */
export function submitUpdateAdmin(
  oldAdmin:  string,
  newAdmin:  string,
  sig1: string, admin1: string,
  sig2: string, admin2: string,
  sig3: string, admin3: string,
  requestId: bigint,
  fee = DEFAULT_TX_FEE,
): TxSpec {
  return {
    program:  MULTISIG_PROGRAM,
    function: 'update_admin',
    inputs:   [
      oldAdmin,
      newAdmin,
      ...sigInputs(sig1, admin1, sig2, admin2, sig3, admin3),
      `${requestId}u64`,
    ],
    fee,
    privateFee: false,
  };
}
