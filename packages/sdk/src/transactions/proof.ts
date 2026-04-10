/**
 * Transaction builders for fairdrop_proof_v3.aleo.
 *
 * Admin (multisig-protected):
 *   setProofAllowedCaller — grant/revoke an auction program's CPI rights.
 */

import { PROGRAMS }    from '@fairdrop/config';
import { DEFAULT_TX_FEE, type TxSpec } from './_types';

const PROOF_PROGRAM = PROGRAMS.proof.programId;

/**
 * setProofAllowedCaller — grant or revoke an auction program's CPI rights.
 *
 * Multisig-protected. Requires a pre-approved op_hash in fairdrop_multisig.
 *
 * @param programAddr Auction program address to grant/revoke.
 * @param allowed     true = grant, false = revoke.
 * @param opNonce     Nonce matching the pre-approved AllowedCallerOp in multisig.
 */
export function setProofAllowedCaller(
  programAddr: string,
  allowed:     boolean,
  opNonce:     bigint,
  fee = DEFAULT_TX_FEE,
): TxSpec {
  return {
    program:  PROOF_PROGRAM,
    function: 'set_allowed_caller',
    inputs:   [programAddr, String(allowed), `${opNonce}u64`],
    fee,
    privateFee: false,
  };
}
