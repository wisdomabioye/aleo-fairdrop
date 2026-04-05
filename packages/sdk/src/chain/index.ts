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
  fetchCreatorNonce,
  fetchAuctionStats,
  fetchCreatorAuctions,
  fetchSqrtWeights,
} from './auction';

export { fetchProtocolConfig, fetchPaused } from './config';

export { fetchGateConfig, fetchIsVerified, fetchIsGateRegistered } from './gate';

export {
  fetchReferralConfig,
  fetchReferralRecord,
  fetchEarned,
  fetchReferralReserve,
  fetchReferralCount,
  fetchIsReserveFunded,
} from './ref';

export { fetchCreatorReputation, fetchHasParticipated } from './proof';

export {
  fetchIsOpApproved,
  fetchIsAdmin,
  fetchIsOpExecuted,
  fetchApprovedUpgradeChecksum,
} from './multisig';

export { fetchIsAllowedVestCaller } from './vest';
