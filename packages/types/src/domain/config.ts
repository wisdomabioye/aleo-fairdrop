/**
 * Protocol configuration — values stored in fairdrop_config.aleo mappings.
 *
 * Served by GET /config. The indexer owns reading this from chain and
 * keeping the DB row current. The frontend fetches from the API.
 *
 * Defaults match the contract constants (get_or_use values):
 *   feeBps:             250   (2.5%)
 *   creationFee:        "10000"
 *   closerReward:       "10000"
 *   slashRewardBps:     2000  (20%)
 *   maxReferralBps:     2000  (20% of pool)
 *   referralPoolBps:    500   (5% of protocol fee)
 *   minAuctionDuration: 360   (blocks, ~1 hr)
 *   paused:             false
 */
export interface ProtocolConfig {
  feeBps:             number;
  creationFee:        string;   // u128 as decimal string
  closerReward:       string;   // u128 as decimal string
  slashRewardBps:     number;
  maxReferralBps:     number;
  referralPoolBps:    number;
  minAuctionDuration: number;
  paused:             boolean;
  protocolAdmin:      string;   // aleo1... address
  updatedAt:          string;   // ISO-8601 — when indexer last synced
}
