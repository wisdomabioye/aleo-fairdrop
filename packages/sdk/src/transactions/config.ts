/**
 * Transaction builders for fairdrop_config_v1.aleo.
 *
 * All setters are multisig-protected: the op_nonce must match a previously
 * approved op via fairdrop_multisig_v1.aleo::approve_op. Workflow:
 *   1. Compute op_hash = BHP256(ConfigOp { fn_key, op_value, nonce: op_nonce })
 *   2. Call multisig::approveOp(op_hash, ...) — 3-of-N admin sigs required
 *   3. Call the setter here with the same (new_value, op_nonce)
 */

import { PROGRAMS }    from '@fairdrop/config';
import { DEFAULT_TX_FEE, type TxSpec } from './_types';

const CONFIG_PROGRAM = PROGRAMS.config.programId;

function setter(fn: string, value: string, opNonce: bigint, fee: number): TxSpec {
  return {
    program: CONFIG_PROGRAM, function: fn,
    inputs:  [value, `${opNonce}u64`],
    fee,     privateFee: false,
  };
}

/** Set protocol fee in basis points (0–10000). */
export function setFeeBps(newValue: number, opNonce: bigint, fee = DEFAULT_TX_FEE): TxSpec {
  return setter('set_fee_bps', `${newValue}u16`, opNonce, fee);
}

/** Set per-auction creation fee in microcredits. */
export function setCreationFee(newValue: bigint, opNonce: bigint, fee = DEFAULT_TX_FEE): TxSpec {
  return setter('set_creation_fee', `${newValue}u128`, opNonce, fee);
}

/** Set the reward paid to close_auction callers in microcredits. */
export function setCloserReward(newValue: bigint, opNonce: bigint, fee = DEFAULT_TX_FEE): TxSpec {
  return setter('set_closer_reward', `${newValue}u128`, opNonce, fee);
}

/** Set the slash reward rate in basis points for slash_unrevealed. */
export function setSlashRewardBps(newValue: number, opNonce: bigint, fee = DEFAULT_TX_FEE): TxSpec {
  return setter('set_slash_reward_bps', `${newValue}u16`, opNonce, fee);
}

/** Set the maximum referral commission rate in basis points. */
export function setMaxReferralBps(newValue: number, opNonce: bigint, fee = DEFAULT_TX_FEE): TxSpec {
  return setter('set_max_referral_bps', `${newValue}u16`, opNonce, fee);
}

/** Set the protocol referral pool share in basis points. */
export function setReferralPoolBps(newValue: number, opNonce: bigint, fee = DEFAULT_TX_FEE): TxSpec {
  return setter('set_referral_pool_bps', `${newValue}u16`, opNonce, fee);
}

/** Set the minimum allowed auction duration in blocks. */
export function setMinAuctionDuration(newValue: number, opNonce: bigint, fee = DEFAULT_TX_FEE): TxSpec {
  return setter('set_min_auction_duration', `${newValue}u32`, opNonce, fee);
}

/** Pause or unpause all auction interactions. */
export function setPaused(newValue: boolean, opNonce: bigint, fee = DEFAULT_TX_FEE): TxSpec {
  return setter('set_paused', String(newValue), opNonce, fee);
}
