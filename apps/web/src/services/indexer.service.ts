import type { IndexerCheckpoint } from '@fairdrop/types/indexer';
import { apiFetch } from './api.client.js';

export interface IndexerStatus {
  checkpoints:       IndexerCheckpoint[];
  latestChainBlock:  number;
  /** Blocks behind chain tip across all programs (max lag). */
  lagBlocks:         number;
}

export const indexerService = {
  status: (): Promise<IndexerStatus> => apiFetch('/indexer/status'),
};
