/**
 * Transaction builders for token_registry.aleo (ARC-20).
 *
 * Covers the full lifecycle: register, mint, burn, split, join, and role management.
 * Each builder returns a TxSpec that can be spread directly into executeTransaction().
 */

import { SYSTEM_PROGRAMS } from '../constants';
import { DEFAULT_TX_FEE, type TxSpec } from '../transactions/_types';

const TOKEN_REGISTRY = SYSTEM_PROGRAMS.tokenRegistry;

/** u32::MAX — used as the no-expiry sentinel in mint_private. */
const NO_EXPIRY = 4294967295;

// ── Role constants ────────────────────────────────────────────────────────────

/** token_registry role values. */
export const TOKEN_ROLE = {
  /** Standard holder — no mint/burn authority. */
  HOLDER: 0,
  /** Burner — can burn tokens from own balance. */
  BURNER: 1,
  /** Minter — can mint new tokens (required for auction + vest programs). */
  MINTER: 3,
} as const;

// ── Token lifecycle ───────────────────────────────────────────────────────────

/**
 * Register a new token on token_registry.aleo.
 * The caller becomes the token admin.
 *
 * @param tokenId        Pre-generated field ID (use generateTokenId() from @fairdrop/sdk/hash).
 * @param nameU128       Token name encoded as u128 (use asciiToU128() from @fairdrop/sdk/parse).
 * @param symbolU128     Token symbol encoded as u128.
 * @param decimals       Number of decimal places (0–18).
 * @param maxSupply      Maximum total supply in raw units (bigint).
 * @param admin          Admin address — typically the connected wallet.
 * @param externalAuth   Set to true only for tokens with external authorization logic.
 */
export function registerToken(
  tokenId:     string,
  nameU128:    bigint,
  symbolU128:  bigint,
  decimals:    number,
  maxSupply:   bigint,
  admin:       string,
  externalAuth = false,
  fee          = DEFAULT_TX_FEE,
): TxSpec {
  return {
    program:    TOKEN_REGISTRY,
    function:   'register_token',
    inputs:     [tokenId, `${nameU128}u128`, `${symbolU128}u128`, `${decimals}u8`, `${maxSupply}u128`, String(externalAuth), admin],
    fee,
    privateFee: false,
  };
}

/**
 * Mint tokens as a private record to a recipient.
 *
 * @param tokenId      Token field ID.
 * @param recipient    Recipient address.
 * @param amount       Amount in raw units (bigint).
 * @param externalAuth Must match the token's registration flag.
 * @param expiry       Block height after which the record expires (default: no expiry).
 */
export function mintPrivate(
  tokenId:     string,
  recipient:   string,
  amount:      bigint,
  externalAuth = false,
  expiry       = NO_EXPIRY,
  fee          = DEFAULT_TX_FEE,
): TxSpec {
  return {
    program:    TOKEN_REGISTRY,
    function:   'mint_private',
    inputs:     [tokenId, recipient, `${amount}u128`, String(externalAuth), `${expiry}u32`],
    fee,
    privateFee: false,
  };
}

/**
 * Mint tokens as a public balance to a recipient.
 *
 * @param tokenId      Token field ID.
 * @param recipient    Recipient address.
 * @param amount       Amount in raw units (bigint).
 * @param expiry       Block height after which the balance expires (default: no expiry).
 */
export function mintPublic(
  tokenId:     string,
  recipient:   string,
  amount:      bigint,
  expiry       = NO_EXPIRY,
  fee          = DEFAULT_TX_FEE,
): TxSpec {
  return {
    program:    TOKEN_REGISTRY,
    function:   'mint_public',
    inputs:     [tokenId, recipient, `${amount}u128`, `${expiry}u32`],
    fee,
    privateFee: false,
  };
}

/**
 * Burn a private token record (partially or fully).
 * Requires the caller to hold BURNER_ROLE or be the token admin.
 *
 * @param record  Raw token record string from the wallet.
 * @param amount  Amount to burn in raw units.
 */
export function burnPrivate(
  record: string,
  amount: bigint,
  fee    = DEFAULT_TX_FEE,
): TxSpec {
  return {
    program:    TOKEN_REGISTRY,
    function:   'burn_private',
    inputs:     [record, `${amount}u128`],
    fee,
    privateFee: false,
  };
}

// ── Record management ─────────────────────────────────────────────────────────

/**
 * Split a private token record into two records.
 *
 * @param record       Raw token record string.
 * @param splitAmount  Amount to split off into the first output record.
 *                     The remainder stays in a second record.
 */
export function splitToken(
  record:      string,
  splitAmount: bigint,
  fee          = DEFAULT_TX_FEE,
): TxSpec {
  return {
    program:    TOKEN_REGISTRY,
    function:   'split',
    inputs:     [record, `${splitAmount}u128`],
    fee,
    privateFee: false,
  };
}

/**
 * Combine two private token records of the same token into one.
 *
 * @param record1  First raw token record string.
 * @param record2  Second raw token record string (must be the same token).
 */
export function joinTokens(
  record1: string,
  record2: string,
  fee      = DEFAULT_TX_FEE,
): TxSpec {
  return {
    program:    TOKEN_REGISTRY,
    function:   'join',
    inputs:     [record1, record2],
    fee,
    privateFee: false,
  };
}

// ── Role management ───────────────────────────────────────────────────────────

/**
 * Assign a role to an account on a token.
 * Only the token admin can call this.
 *
 * @param tokenId  Token field ID.
 * @param account  Aleo address to assign the role to.
 * @param role     Role value (use TOKEN_ROLE constants).
 */
export function setRole(
  tokenId: string,
  account: string,
  role:    number,
  fee      = DEFAULT_TX_FEE,
): TxSpec {
  return {
    program:    TOKEN_REGISTRY,
    function:   'set_role',
    inputs:     [tokenId, account, `${role}u8`],
    fee,
    privateFee: false,
  };
}

/**
 * Revoke a role from an account on a token.
 * Only the token admin can call this.
 */
export function removeRole(
  tokenId: string,
  account: string,
  fee      = DEFAULT_TX_FEE,
): TxSpec {
  return {
    program:    TOKEN_REGISTRY,
    function:   'remove_role',
    inputs:     [tokenId, account],
    fee,
    privateFee: false,
  };
}

// ── Convenience ───────────────────────────────────────────────────────────────

/**
 * Authorize a program address as a supply manager (minter, role = 3) for a token.
 *
 * Thin wrapper around setRole — call before creating an auction or enabling vesting
 * so the program can mint sale tokens to claimants.
 */
export function authorizeSupplyManager(
  tokenId:        string,
  programAddress: string,
  role            = TOKEN_ROLE.MINTER,
  fee             = DEFAULT_TX_FEE,
): TxSpec {
  return setRole(tokenId, programAddress, role, fee);
}
