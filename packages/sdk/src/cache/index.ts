/**
 * Cache barrel — re-exports all cache modules.
 *
 * import { getPersisted, getCachedAuctionConfig, getCachedTokenInfo … } from '@fairdrop/sdk/cache'
 */

export { cacheKey, getPersisted, setPersisted, removePersisted, CACHE_VERSION } from './persist.js';

export {
  getCachedAuctionConfig,
  setCachedAuctionConfig,
  partitionAuctionConfigs,
} from './auction-config.js';

export {
  getCachedGlobalIndex,
  setCachedGlobalIndex,
  getCachedCreatorIndex,
  setCachedCreatorIndex,
} from './auction-index.js';

export { getCachedTokenInfo, setCachedTokenInfo } from './token-meta.js';

export { getCachedGateConfig, setCachedGateConfig } from './gate-config.js';
