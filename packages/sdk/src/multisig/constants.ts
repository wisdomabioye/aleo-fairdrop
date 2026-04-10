/**
 * Multisig governance constants — mirrors the Leo constants in
 * fairdrop_multisig_v2.aleo and fairdrop_config_v1.aleo.
 */

import { PROGRAMS } from '@fairdrop/config';

/**
 * Contract key assignments for approved_upgrades mapping.
 * Derived from programs.json — single source of truth.
 * Pass these as the `contractKey` argument to submitApproveUpgrade().
 */
export const UPGRADE_KEY = {
  MULTISIG:  PROGRAMS.multisig.upgradeKey,
  CONFIG:    PROGRAMS.config.upgradeKey,
  GATE:      PROGRAMS.gate.upgradeKey,
  PROOF:     PROGRAMS.proof.upgradeKey,
  REF:       PROGRAMS.ref.upgradeKey,
  VEST:      PROGRAMS.vest.upgradeKey,
  ASCENDING: PROGRAMS.ascending.upgradeKey,
  DUTCH:     PROGRAMS.dutch.upgradeKey,
  LBP:       PROGRAMS.lbp.upgradeKey,
  QUADRATIC: PROGRAMS.quadratic.upgradeKey,
  RAISE:     PROGRAMS.raise.upgradeKey,
  SEALED:    PROGRAMS.sealed.upgradeKey,
} as const;

/**
 * fn_key values for ConfigOp hashing — identifies which config setter is being authorised.
 * Pass as the `fnKey` argument to computeConfigOpHash().
 */
export const CONFIG_OP_KEY = {
  SET_FEE_BPS:              '1field',
  SET_CREATION_FEE:         '2field',
  SET_CLOSER_REWARD:        '3field',
  SET_SLASH_REWARD_BPS:     '4field',
  SET_MAX_REFERRAL_BPS:     '5field',
  SET_REFERRAL_POOL_BPS:    '6field',
  SET_MIN_AUCTION_DURATION: '7field',
  SET_PAUSED:               '8field',
} as const;
