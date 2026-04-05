/**
 * Transaction builders for token_registry.aleo.
 *
 * Covers the authorization calls needed before creating an auction or
 * enabling vesting — the auction / vest program must have minter role (3)
 * on the sale token so it can mint tokens to claimants.
 */

import { SYSTEM_PROGRAMS } from '../constants';
import { DEFAULT_TX_FEE, type TxSpec } from '../transactions/_types';

/** token_registry role values. */
export const TOKEN_ROLE = {
  /** Standard holder — no mint/burn authority. */
  HOLDER:   0,
  /** Burner — can burn tokens from own balance. */
  BURNER:   1,
  /** Minter — can mint new tokens (required for auction + vest programs). */
  MINTER:   3,
} as const;

/**
 * Authorise a program address as a supply manager (minter/burner, role = 3)
 * for the given token.
 *
 * Call this before creating an auction to ensure the auction program can mint
 * sale tokens to winning bidders at claim time.
 * Also required for the vest program when vesting is enabled.
 *
 * @param tokenId        Token registry field ID for the sale token.
 * @param programAddress Aleo program address (aleo1…) derived from the program ID.
 * @param role           Supply manager role (default 3 = minter). Use TOKEN_ROLE constants.
 * @param fee            Transaction fee in microcredits (default 0.3 ALEO).
 */
export function authorizeSupplyManager(
  tokenId:        string,
  programAddress: string,
  role = TOKEN_ROLE.MINTER,
  fee  = DEFAULT_TX_FEE,
): TxSpec {
  return {
    program:  SYSTEM_PROGRAMS.tokenRegistry,
    function: 'set_role',
    inputs:   [tokenId, programAddress, `${role}u8`],
    fee,
    privateFee: false,
  };
}
