import type { ProtocolConfig } from '@fairdrop/types/domain';
import { apiFetch } from './api.client.js';

export const configService = {
  get: (): Promise<ProtocolConfig> => apiFetch('/config'),
};
