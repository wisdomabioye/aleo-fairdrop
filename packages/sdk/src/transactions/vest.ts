/**
 * Transaction builders for fairdrop_vest_v2.aleo transitions.
 */

import { PROGRAMS } from '@fairdrop/config';
import { DEFAULT_TX_FEE, type TxSpec } from './_types';

/**
 * setVestAllowedCaller — grant or revoke an auction program's CPI rights.
 *
 * Multisig-protected. Requires a pre-approved op_hash in fairdrop_multisig.
 *
 * @param programAddr Auction program address to grant/revoke.
 * @param allowed     true = grant, false = revoke.
 * @param opNonce     Nonce matching the pre-approved AllowedCallerOp in multisig.
 */
export function setVestAllowedCaller(
  programAddr: string,
  allowed:     boolean,
  opNonce:     bigint,
  fee = DEFAULT_TX_FEE,
): TxSpec {
  return {
    program:  PROGRAMS.vest.programId,
    function: 'set_allowed_caller',
    inputs:   [programAddr, String(allowed), `${opNonce}u64`],
    fee,
    privateFee: false,
  };
}

/**
 * release — releases a portion of a VestedAllocation to its owner.
 *
 * D11 pattern: caller supplies `amount`; finalize validates against on-chain
 * vesting math. Use computeReleasable() to compute the correct amount first.
 *
 * @param vestRecord Raw VestedAllocation record from the wallet.
 * @param amount     Tokens to release in base units (≤ vested_so_far − released).
 * @param fee        Transaction fee in microcredits (default 0.3 ALEO).
 */
export function releaseVested(
  vestRecord: string,
  amount:     bigint,
  fee = DEFAULT_TX_FEE,
): TxSpec {
  return {
    program:  PROGRAMS.vest.programId,
    function: 'release',
    inputs:   [vestRecord, `${amount}u128`],
    fee,
    privateFee: false,
  };
}
