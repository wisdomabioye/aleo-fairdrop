import { API_URL } from '@/env';
import { apiFetch } from './api.client';
import type { MetadataCreateResponse, LogoUploadResponse } from '@fairdrop/types/api';

// ── Frontend-facing types (camelCase) ─────────────────────────────────────────

export interface MetadataInput {
  name:        string;
  description: string;
  website?:    string;
  twitter?:    string;
  discord?:    string;
  logoIpfs?:   string;  // CID from uploadLogo()
}

export interface MetadataUploadResult {
  hash:    string;  // Nfield literal — pass directly to create_auction
  ipfsCid: string;
}

// ── Service ───────────────────────────────────────────────────────────────────

export const metadataService = {
  /**
   * Upload a logo image to IPFS via POST /metadata/logo.
   * Returns the IPFS CID, or null on any failure (caller degrades gracefully).
   */
  uploadLogo: async (file: File): Promise<string | null> => {
    const body = new FormData();
    body.append('logo', file);
    try {
      const res = await fetch(`${API_URL}/metadata/logo`, { method: 'POST', body });
      if (!res.ok) return null;
      const data = (await res.json()) as LogoUploadResponse;
      return data.ipfs_cid ?? null;
    } catch {
      return null;
    }
  },

  /**
   * Pin metadata JSON to IPFS and compute its on-chain hash.
   * Returns { hash, ipfsCid } — hash is committed to create_auction as metadata_hash.
   */
  upload: async (data: MetadataInput): Promise<MetadataUploadResult> => {
    const raw = await apiFetch<MetadataCreateResponse>('/metadata', {
      method: 'POST',
      body:   JSON.stringify({
        name:        data.name,
        description: data.description,
        ...(data.website  ? { website:   data.website  } : {}),
        ...(data.logoIpfs ? { logo_ipfs: data.logoIpfs } : {}),
        ...(data.twitter  ? { twitter:   data.twitter  } : {}),
        ...(data.discord  ? { discord:   data.discord  } : {}),
      }),
    });
    return { hash: raw.metadata_hash, ipfsCid: raw.ipfs_cid };
  },
};
