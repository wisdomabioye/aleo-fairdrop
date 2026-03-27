import type { IndexerStatus } from '@fairdrop/types/indexer';
import { apiFetch } from './api.client.js';

export const indexerService = {
  status: (): Promise<IndexerStatus> => apiFetch('/indexer/status'),
};
