/**
 * Cache barrel — re-exports all cache modules.
 *
 * import { getPersisted, getCachedAuctionConfig, getCachedTokenInfo … } from '@fairdrop/sdk/cache'
 */

export { cacheKey, getPersisted, setPersisted, removePersisted, CACHE_VERSION } from './persist';

export {
  getCachedAuctionConfig,
  setCachedAuctionConfig,
  partitionAuctionConfigs,
} from './auction-config';

export {
  getCachedGlobalIndex,
  setCachedGlobalIndex,
  getCachedCreatorIndex,
  setCachedCreatorIndex,
} from './auction-index';

export { getCachedTokenInfo, setCachedTokenInfo } from './token-meta';

export { getCachedGateConfig, setCachedGateConfig } from './gate-config';
