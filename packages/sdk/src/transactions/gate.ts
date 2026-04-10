/**
 * Transaction builders for fairdrop_gate_v3.aleo.
 *
 * User-callable transitions:
 *   verify_merkle    — bidder proves Merkle allowlist membership before bidding.
 *   verify_credential — bidder presents an issuer-signed credential before bidding.
 *
 * Admin transition (multisig-protected):
 *   setGateAllowedCaller — grant/revoke an auction program's right to call register_gate.
 */

import { PROGRAMS }    from '@fairdrop/config';
import { DEFAULT_TX_FEE, type TxSpec } from './_types';

const GATE_PROGRAM = PROGRAMS.gate.programId;

/**
 * verify_merkle — prove Merkle allowlist membership.
 *
 * Must be called by the bidder BEFORE place_bid on a Merkle-gated auction.
 * Sets verified[BHP256(BidderKey)] = true in finalize.
 *
 * @param auctionId Auction field ID.
 * @param proof     20 sibling hashes (as Leo field literals) from the Merkle path.
 * @param pathBits  Packed u32 encoding left/right bits for each path step.
 * @param fee       Transaction fee in microcredits (default 0.3 ALEO).
 */
export function verifyMerkle(
  auctionId: string,
  proof:     string[],   // 20 field literals, e.g. ["0field", "123...field", ...]
  pathBits:  number,
  fee = DEFAULT_TX_FEE,
): TxSpec {
  return {
    program:  GATE_PROGRAM,
    function: 'verify_merkle',
    inputs:   [auctionId, `[ ${proof.join(', ')} ]`, `${pathBits}u32`],
    fee,
    privateFee: false,
  };
}

/**
 * verify_credential — present an issuer-signed credential.
 *
 * Must be called by the bidder BEFORE place_bid on a credential-gated auction.
 * Sets verified[BHP256(BidderKey)] = true in finalize.
 *
 * @param auctionId  Auction field ID.
 * @param issuer     D11: credential_issuers[auctionId] — the expected issuer address.
 * @param signature  Issuer's Leo signature over the CredentialMessage (bech32 "sign1…").
 * @param expiry     Block height after which the credential is invalid.
 * @param fee        Transaction fee in microcredits (default 0.3 ALEO).
 */
export function verifyCredential(
  auctionId: string,
  issuer:    string,
  signature: string,
  expiry:    number,
  fee = DEFAULT_TX_FEE,
): TxSpec {
  return {
    program:  GATE_PROGRAM,
    function: 'verify_credential',
    inputs:   [auctionId, issuer, signature, `${expiry}u32`],
    fee,
    privateFee: false,
  };
}

/**
 * setGateAllowedCaller — grant or revoke an auction program's CPI rights.
 *
 * Multisig-protected. Requires a pre-approved op_hash in fairdrop_multisig.
 *
 * @param programAddr Auction program address to grant/revoke.
 * @param allowed     true = grant, false = revoke.
 * @param opNonce     Nonce matching the pre-approved AllowedCallerOp in multisig.
 */
export function setGateAllowedCaller(
  programAddr: string,
  allowed:     boolean,
  opNonce:     bigint,
  fee = DEFAULT_TX_FEE,
): TxSpec {
  return {
    program:  GATE_PROGRAM,
    function: 'set_allowed_caller',
    inputs:   [programAddr, String(allowed), `${opNonce}u64`],
    fee,
    privateFee: false,
  };
}
