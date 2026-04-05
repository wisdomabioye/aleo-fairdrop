/**
 * On-chain mapping readers for all fairdrop contracts.
 *
 * import { fetchAuctionConfig, fetchGateConfig, fetchCreatorReputation, … } from '@fairdrop/sdk/chain'
 *
 * Requires initAleoClient(rpcUrl) to be called once before use.
 */

export {
  fetchAuctionConfig,
  fetchAuctionState,
  fetchEscrowPayments,
  fetchEscrowSales,
  fetchProtocolTreasury,
  fetchCreatorWithdrawn,
  fetchUnsoldWithdrawn,
  fetchCreatorNonce,
  fetchAuctionStats,
  fetchCreatorAuctions,
  fetchSqrtWeights,
} from './auction';

export { fetchProtocolConfig, fetchPaused } from './config';

export { fetchGateConfig, fetchIsVerified, fetchIsGateRegistered, fetchIsAllowedGateCaller } from './gate';

export {
  fetchReferralConfig,
  fetchReferralRecord,
  fetchReferralListEntry,
  fetchEarned,
  fetchReferralReserve,
  fetchReferralCount,
  fetchIsReserveFunded,
  fetchIsAllowedRefCaller,
} from './ref';

export { fetchCreatorReputation, fetchHasParticipated, fetchIsAllowedProofCaller } from './proof';

export {
  fetchIsOpApproved,
  fetchIsAdmin,
  fetchIsOpExecuted,
  fetchIsMultisigInitialized,
  fetchApprovedUpgradeChecksum,
} from './multisig';

export { fetchIsAllowedVestCaller } from './vest';
