import type { AuctionView, AuctionListItem, AuctionMetadata, AuctionType, AuctionStatus, GateMode } from '../domain/auction';
import type { Page } from './pagination';

// ── List ─────────────────────────────────────────────────────────────────────

export interface AuctionListParams {
  type?:    AuctionType;
  status?:  AuctionStatus;
  creator?: string;
  token?:   string;
  page?:    number;
  pageSize?: number;
  sort?:    'created' | 'endBlock' | 'progressPct' | 'volume';
  order?:   'asc' | 'desc';
}

export type AuctionListResponse = Page<AuctionListItem>;

// ── Detail ────────────────────────────────────────────────────────────────────

export type AuctionDetailResponse = AuctionView;

// ── Bid ───────────────────────────────────────────────────────────────────────

export interface BidRequest {
  auctionId:     string;
  quantity:      string;   // bigint as string
  paymentAmount: string;   // bigint as string (microcredits)
  usePrivate:    boolean;
  codeId?:       string;   // referral code_id (optional)
}

export interface BidResponse {
  transactionId: string;
}

// ── Search / filter ───────────────────────────────────────────────────────────

export interface AuctionFilterOptions {
  types:     AuctionType[];
  statuses:  AuctionStatus[];
  gateModes: GateMode[];
  vestOnly:  boolean;
}

// ── Metadata ─────────────────────────────────────────────────────────────────

/**
 * POST /metadata — creator uploads auction metadata before calling create_auction.
 * Server pins canonical JSON to IPFS, computes a field-valued hash, returns both.
 *
 * No auction_id field — metadata is content-addressed. The auction ↔ metadata
 * relationship is established on-chain via create_auction's metadata_hash param
 * and off-chain via auctions.metadata_hash = auction_metadata.hash.
 */
/**
 * Camelcase shape used throughout the frontend and as the canonical shared type.
 * The frontend service maps this to MetadataCreateRequest before sending over HTTP.
 */
export interface MetadataInput {
  name:           string;
  description:    string;
  website?:       string;
  logoIpfs?:      string;   // CID returned by POST /metadata/logo
  twitter?:       string;
  discord?:       string;
  /** URL of the credential-signer service. Required for credential-gated auctions. */
  credentialUrl?: string;
}

export interface MetadataCreateRequest {
  name:            string;
  description:     string;
  website?:        string;
  logo_ipfs?:      string;    // CID returned by POST /metadata/logo
  twitter?:        string;
  discord?:        string;
  credential_url?: string;    // credential-signer service URL; required for credential-gated auctions
}

export interface MetadataCreateResponse {
  metadata_hash: string;      // Nfield literal — pass directly to create_auction
  ipfs_cid:      string;      // IPFS CID where the canonical JSON was pinned
}

/** POST /metadata/logo — pin a logo image, returns its CID. */
export interface LogoUploadResponse {
  ipfs_cid: string;
}

/** GET /metadata/:hash — enriched metadata by on-chain hash. */
export type MetadataResponse = AuctionMetadata;
