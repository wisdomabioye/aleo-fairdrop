import type { AuctionView, AuctionListItem, AuctionType, AuctionStatus, GateMode } from '../domain/auction.js';
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
