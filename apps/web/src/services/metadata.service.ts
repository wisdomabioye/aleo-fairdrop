import { API_URL } from '@/env';
import { apiFetch } from './api.client';

export interface MetadataInput {
  name:        string;
  description: string;
  website?:    string;
  twitter?:    string;
  discord?:    string;
  logoIpfs?:   string;
}

export interface MetadataUploadResult {
  hash:    string; // BHP256 field hex committed on-chain
  ipfsCid: string;
}

export const metadataService = {
  /**
   * Upload logo file to IPFS via the API.
   * Returns the IPFS CID string, or null on failure.
   */
  uploadLogo: async (file: File): Promise<string | null> => {
    const body = new FormData();
    body.append('logo', file);
    try {
      const res = await fetch(`${API_URL}/metadata/logo`, { method: 'POST', body });
      if (!res.ok) return null;
      const data = (await res.json()) as { ipfsCid: string };
      return data.ipfsCid ?? null;
    } catch {
      return null;
    }
  },

  /**
   * Pin metadata JSON to IPFS and compute its BHP256 on-chain hash.
   * Returns { hash, ipfsCid } — hash is committed to create_auction as metadata_hash.
   */
  upload: (data: MetadataInput): Promise<MetadataUploadResult> =>
    apiFetch('/metadata', {
      method: 'POST',
      body:   JSON.stringify(data),
    }),
};
