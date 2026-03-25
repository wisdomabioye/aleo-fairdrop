/**
 * Program IDs and deployment salts — sourced from contracts/deployments/programs.json.
 * Imported at bundle time; no runtime I/O. Same values on every network.
 */
import programsJson from '../../../contracts/deployments/programs.json';
import type { Programs, Accounts } from './types';

// Cast through unknown: JSON import is typed structurally, Programs is a subset view.
export const PROGRAMS: Programs = programsJson.programs as Programs;
export const DEFAULT_ACCOUNTS = programsJson.accounts as Accounts