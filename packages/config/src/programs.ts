/**
 * Program IDs and deployment salts — sourced from contracts/deployments/programs.json.
 * Imported at bundle time; no runtime I/O. Same values on every network.
 */
import programsJson from '../../../contracts/deployments/programs.json';
import type { Programs, Accounts } from './types';

// Cast through unknown: JSON import is typed structurally, Programs is a subset view.
export const PROGRAMS: Programs = programsJson.programs as Programs;
export const DEFAULT_ACCOUNTS = programsJson.accounts as Accounts;

/** Contract defaults — active before any set_* call (mirrors fairdrop_config_v3.aleo get_or_use values). */
export const CONFIG_DEFAULTS = {
  feeBps:             250,
  creationFee:        '10000',
  closerReward:       '10000',
  slashRewardBps:     2000,
  maxReferralBps:     2000,
  referralPoolBps:    500,
  minAuctionDuration: 360,
  paused:             false,
} as const;