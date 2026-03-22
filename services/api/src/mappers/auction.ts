import {
  AuctionType, AuctionStatus, GateMode,
  type AuctionView, type AuctionListItem, type AuctionMetadata,
} from '@fairdrop/types/domain';
import type { AuctionRow, AuctionMetadataRow } from '@fairdrop/database';
import type { BlockContext } from '../queries/auctions.js';
import type { TokenInfo } from '../lib/token-cache.js';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Approximate Aleo block time — used for wall-clock estimates only. */
const BLOCK_TIME_MS = 10_000;

// ── Helpers ───────────────────────────────────────────────────────────────────

function bigOrNull(s: string | null): bigint | null {
  return s != null ? BigInt(s) : null;
}

function gateMode(n: number): GateMode {
  if (n === 1) return GateMode.Merkle;
  if (n === 2) return GateMode.Credential;
  return GateMode.Open;
}

function computeStatus(row: AuctionRow, currentBlock: number): AuctionStatus {
  if (row.voided)                    return AuctionStatus.Voided;
  if (row.cleared)                   return AuctionStatus.Cleared;
  if (row.startBlock > currentBlock) return AuctionStatus.Upcoming;
  if (row.supplyMet)                 return AuctionStatus.Clearing;
  if (row.endBlock < currentBlock)   return AuctionStatus.Ended;
  return AuctionStatus.Active;
}

/**
 * Estimate the wall-clock time for a target block.
 * Uses lastProcessedAt as an anchor: future blocks add BLOCK_TIME_MS per block,
 * past blocks subtract it.
 */
function estimateTime(targetBlock: number, ctx: BlockContext): Date | null {
  if (!ctx.lastProcessedAt || ctx.currentBlock === 0) return null;
  const diff = targetBlock - ctx.currentBlock;
  return new Date(ctx.lastProcessedAt.getTime() + diff * BLOCK_TIME_MS);
}

/**
 * Compute the current Dutch auction price at the given block.
 * Returns null for non-Dutch auctions or before price fields are set.
 */
function computeDutchPrice(row: AuctionRow, currentBlock: number): bigint | null {
  if (
    !row.startPrice || !row.floorPrice ||
    row.priceDecayBlocks == null || !row.priceDecayAmount
  ) return null;

  const effectiveBlock = Math.min(currentBlock, row.endBlock);
  if (effectiveBlock < row.startBlock) return BigInt(row.startPrice);

  const elapsed = BigInt(effectiveBlock - row.startBlock);
  const steps   = elapsed / BigInt(row.priceDecayBlocks);
  const decayed = steps * BigInt(row.priceDecayAmount);
  const price   = BigInt(row.startPrice) - decayed;
  const floor   = BigInt(row.floorPrice);
  return price > floor ? price : floor;
}

function toMetadata(row: AuctionMetadataRow | null): AuctionMetadata | null {
  if (!row) return null;
  return {
    hash:        row.hash,
    ipfsCid:     row.ipfsCid,
    name:        row.name,
    description: row.description,
    website:     row.website   ?? null,
    logoIpfs:    row.logoIpfs  ?? null,
    twitter:     row.twitter   ?? null,
    discord:     row.discord   ?? null,
  };
}

function progressPct(committed: string, supply: string): number {
  const s = BigInt(supply);
  if (s === 0n) return 0;
  return Math.min(100, Number((BigInt(committed) * 100n) / s));
}

// ── Public mappers ────────────────────────────────────────────────────────────

export function toAuctionView(
  row:       AuctionRow,
  ctx:       BlockContext,
  metaRow:   AuctionMetadataRow | null,
  tokenInfo: TokenInfo | null,
): AuctionView {
  return {
    id:                 row.id,
    type:               row.type as AuctionType,
    status:             computeStatus(row, ctx.currentBlock),
    programId:          row.programId,
    creator:            row.creator,
    metadataHash:       row.metadataHash    ?? null,
    metadata:           toMetadata(metaRow),
    saleTokenId:        row.saleTokenId,
    saleTokenSymbol:    tokenInfo?.symbol   ?? null,
    saleTokenDecimals:  tokenInfo?.decimals ?? null,
    supply:             BigInt(row.supply),
    totalCommitted:     BigInt(row.totalCommitted),
    progressPct:        progressPct(row.totalCommitted, row.supply),
    currentPrice:       computeDutchPrice(row, ctx.currentBlock),
    clearingPrice:      bigOrNull(row.clearingPrice),
    startBlock:         row.startBlock,
    endBlock:           row.endBlock,
    endedAtBlock:       row.endedAtBlock    ?? null,
    estimatedStart:     estimateTime(row.startBlock, ctx),
    estimatedEnd:       estimateTime(row.endBlock,   ctx),
    gateMode:           gateMode(row.gateMode),
    vestEnabled:        row.vestEnabled,
    vestCliffBlocks:    row.vestCliffBlocks,
    vestEndBlocks:      row.vestEndBlocks,
    creatorRevenue:     bigOrNull(row.creatorRevenue),
    protocolFee:        bigOrNull(row.protocolFee),
    referralBudget:     bigOrNull(row.referralBudget),
    feeBps:             row.feeBps,
    closerReward:       BigInt(row.closerReward),
  };
}

export function toAuctionListItem(
  row:       AuctionRow,
  ctx:       BlockContext,
  metaRow:   AuctionMetadataRow | null,
  tokenInfo: TokenInfo | null,
): AuctionListItem {
  return {
    id:              row.id,
    type:            row.type as AuctionType,
    status:          computeStatus(row, ctx.currentBlock),
    creator:         row.creator,
    name:            metaRow?.name          ?? null,
    logoIpfs:        metaRow?.logoIpfs      ?? null,
    metadataHash:    row.metadataHash       ?? null,
    saleTokenId:     row.saleTokenId,
    saleTokenSymbol: tokenInfo?.symbol      ?? null,
    supply:          BigInt(row.supply),
    progressPct:     progressPct(row.totalCommitted, row.supply),
    currentPrice:    computeDutchPrice(row, ctx.currentBlock),
    clearingPrice:   bigOrNull(row.clearingPrice),
    startBlock:      row.startBlock,
    endBlock:        row.endBlock,
    estimatedEnd:    estimateTime(row.endBlock, ctx),
    vestEnabled:     row.vestEnabled,
    gateMode:        gateMode(row.gateMode),
  };
}
