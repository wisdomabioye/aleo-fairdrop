/**
 * Multisig governance module for fairdrop_multisig_v1.aleo.
 *
 * import { prepareApproveOp, submitApproveOp, UPGRADE_KEY, … } from '@fairdrop/sdk/multisig'
 *
 * Full workflow:
 *   1. Compute op_hash — use computeXxxOpHash() from @fairdrop/sdk/hash
 *   2. Prepare msg_hash — use prepare* functions (returns the field each admin must sign)
 *   3. Admins sign off-chain — sig = privateKey.sign(msgHash)
 *   4. Submit on-chain — use submit* functions to build the TxSpec
 *   5. Execute target transition — config setter, set_allowed_caller, etc.
 */

// ── Constants ─────────────────────────────────────────────────────────────────

export { UPGRADE_KEY, CONFIG_OP_KEY } from './constants';

// ── Off-chain signing preparation ─────────────────────────────────────────────

export {
  prepareApproveOp,
  prepareApproveUpgrade,
  prepareUpdateAdmin,
} from './sign';

// ── On-chain submission ───────────────────────────────────────────────────────

export {
  initializeMultisig,
  submitApproveOp,
  submitApproveUpgrade,
  submitUpdateAdmin,
} from './submit';
