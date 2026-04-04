/**
 * Cache barrel — re-exports all cache modules.
 *
 * import { getPersisted, setStorage, MemoryStorageAdapter, … } from '@fairdrop/sdk/cache'
 */

export { type IStorage, LocalStorageAdapter, MemoryStorageAdapter } from './storage';

export {
  CACHE_VERSION,
  setStorage,
  cacheKey,
  getPersisted,
  setPersisted,
  removePersisted,
} from './persist';

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
