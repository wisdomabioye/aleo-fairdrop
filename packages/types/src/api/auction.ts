import type { AuctionView, AuctionListItem, AuctionMetadata, AuctionType, AuctionStatus, GateMode } from '../domain/auction.js';
import type { Page } from './pagination.js';

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
 * POST /metadata — creator submits auction metadata before calling create_auction.
 * Server pins to IPFS, computes BHP256 hash, returns { metadata_hash, ipfs_cid }.
 */
export interface MetadataCreateRequest {
  auction_id:  string;        // field — used for pre-registration before tx
  name:        string;
  description: string;
  website?:    string;
  logo_ipfs?:  string;        // pre-uploaded IPFS CID
  twitter?:    string;
  discord?:    string;
}

export interface MetadataCreateResponse {
  metadata_hash: string;      // field — pass this into create_auction transition
  ipfs_cid:      string;      // IPFS CID where the canonical JSON was pinned
}

/** GET /metadata/:hash — enriched metadata by on-chain hash. */
export type MetadataResponse = AuctionMetadata;
