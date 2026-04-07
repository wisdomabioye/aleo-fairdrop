import {
  AuctionType, AuctionStatus, GateMode,
  type AuctionView, type AuctionListItem, type AuctionMetadata, type AuctionParams,
} from '@fairdrop/types/domain';
import { asU128 } from '@fairdrop/types/primitives';
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
  // DB status encodes the terminal on-chain states; computed states depend on block height.
  if (row.status === 'voided')       return AuctionStatus.Voided;
  if (row.status === 'cleared')      return AuctionStatus.Cleared;
  if (row.startBlock > currentBlock) return AuctionStatus.Upcoming;
  if (row.supplyMet)                 return AuctionStatus.Clearing;
  // For ascending auctions use effectiveEndBlock (may be extended beyond endBlock).
  const liveEndBlock = row.type === AuctionType.Ascending
    ? (row.effectiveEndBlock ?? row.endBlock)
    : row.endBlock;
  if (liveEndBlock < currentBlock)   return AuctionStatus.Ended;
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
    row.startPrice == null || row.floorPrice == null ||
    row.priceDecayBlocks == null || row.priceDecayAmount == null
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

/**
 * Compute the current Ascending auction price at the given block.
 * Returns null for non-Ascending auctions or before price fields are set.
 */
function computeAscendingPrice(row: AuctionRow, currentBlock: number): bigint | null {

  if (
    row.floorPrice == null || row.ceilingPrice == null ||
    row.priceRiseBlocks == null || row.priceRiseAmount == null
  ) return null;

  const effectiveBlock = Math.min(currentBlock, row.effectiveEndBlock ?? row.endBlock);
  if (effectiveBlock < row.startBlock) return BigInt(row.floorPrice);

  const elapsed  = BigInt(effectiveBlock - row.startBlock);
  const steps    = elapsed / BigInt(row.priceRiseBlocks);
  const risen    = steps * BigInt(row.priceRiseAmount);
  const price    = BigInt(row.floorPrice) + risen;
  const ceiling  = BigInt(row.ceilingPrice);
  return price < ceiling ? price : ceiling;
}

/** Dispatch to the correct price function based on auction type. */
function computeCurrentPrice(row: AuctionRow, currentBlock: number): bigint | null {
  if (row.type === AuctionType.Ascending) return computeAscendingPrice(row, currentBlock);
  return computeDutchPrice(row, currentBlock);
}

function toMetadata(row: AuctionMetadataRow | null): AuctionMetadata | null {
  if (!row) return null;
  return {
    hash:          row.hash,
    ipfsCid:       row.ipfsCid,
    name:          row.name,
    description:   row.description,
    website:       row.website       ?? null,
    logoIpfs:      row.logoIpfs      ?? null,
    twitter:       row.twitter       ?? null,
    discord:       row.discord       ?? null,
    credentialUrl: row.credentialUrl ?? null,
  };
}

function progressPct(committed: string, supply: string): number {
  const s = BigInt(supply);
  if (s === 0n) return 0;
  return Math.min(100, Number((BigInt(committed) * 100n) / s));
}

// ── Params builder ────────────────────────────────────────────────────────────

/**
 * Build the discriminated AuctionParams from the DB row.
 * Flat price columns cover Dutch/Ascending/Raise/Sealed.
 * LBP and Quadratic mechanism fields live only in configJson.
 */
function buildParams(row: AuctionRow): AuctionParams {
  const cfg = (row.configJson ?? {}) as Record<string, unknown>;

  switch (row.type as AuctionType) {
    case AuctionType.Dutch:
      return {
        type:        AuctionType.Dutch,
        start_price:        asU128(row.startPrice!),
        floor_price:        asU128(row.floorPrice!),
        price_decay_blocks: row.priceDecayBlocks!,
        price_decay_amount: asU128(row.priceDecayAmount!),
      };

    case AuctionType.Sealed:
      return {
        type:             AuctionType.Sealed,
        start_price:        asU128(row.startPrice!),
        floor_price:        asU128(row.floorPrice!),
        price_decay_blocks: row.priceDecayBlocks!,
        price_decay_amount: asU128(row.priceDecayAmount!),
        commit_end_block:   Number(cfg.commit_end_block ?? 0),
        slash_reward_bps:   Number(cfg.slash_reward_bps ?? 0),
      };

    case AuctionType.Raise:
      return {
        type:         AuctionType.Raise,
        raise_target: asU128(row.raiseTarget ?? '0'),
      };

    case AuctionType.Ascending:
      return {
        type:              AuctionType.Ascending,
        floor_price:       asU128(row.floorPrice!),
        ceiling_price:     asU128(row.ceilingPrice!),
        price_rise_blocks: row.priceRiseBlocks!,
        price_rise_amount: asU128(row.priceRiseAmount!),
        extension_window:  row.extensionWindow  ?? 0,
        extension_blocks:  row.extensionBlocks  ?? 0,
        max_end_block:     row.maxEndBlock       ?? 0,
      };

    case AuctionType.Lbp:
      return {
        type:          AuctionType.Lbp,
        start_weight:  Number(cfg.start_weight ?? 0),
        end_weight:    Number(cfg.end_weight   ?? 0),
        swap_fee_bps:  Number(cfg.swap_fee_bps ?? 0),
        initial_price: asU128(String(cfg.initial_price ?? '0')),
      };

    case AuctionType.Quadratic:
      return {
        type:              AuctionType.Quadratic,
        matching_pool:     asU128(String(cfg.matching_pool     ?? '0')),
        contribution_cap:  asU128(String(cfg.contribution_cap  ?? '0')),
        matching_deadline: Number(cfg.matching_deadline ?? 0),
      };

    default: {
      const _exhaustive: never = row.type as never;
      throw new Error(`[buildParams] unhandled AuctionType: ${_exhaustive}`);
    }
  }
}

// ── Public mappers ────────────────────────────────────────────────────────────

export function toAuctionView(
  row:       AuctionRow,
  ctx:       BlockContext,
  metaRow:   AuctionMetadataRow | null,
  tokenInfo: TokenInfo | null,
): AuctionView {
  const auctionParams = buildParams(row);
  // Both Raise and Quadratic measure progress as payments-toward-raise_target.
  const isPaymentsType = row.type === AuctionType.Raise || row.type === AuctionType.Quadratic;
  const raiseTarget    = auctionParams.type === AuctionType.Raise ? auctionParams.raise_target : (row.raiseTarget ?? '0');

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
    saleScale:          BigInt(row.saleScale ?? '1'),
    supply:             BigInt(row.supply),
    totalCommitted:     BigInt(row.totalCommitted),
    totalPayments:     BigInt(row.totalPayments),
    minBidAmount:       BigInt(row.minBidAmount ?? 0),
    maxBidAmount:       BigInt(row.maxBidAmount ?? 0),
    effectiveSupply:    row.effectiveSupply != null ? BigInt(row.effectiveSupply) : null,
    fillMinBps:         row.fillMinBps ?? null,
    raiseTarget:        bigOrNull(row.raiseTarget),
    progressPct:        progressPct(
      isPaymentsType ? row.totalPayments : row.totalCommitted,
      isPaymentsType ? raiseTarget       : row.supply
    ),
    currentPrice:       computeCurrentPrice(row, ctx.currentBlock),
    clearingPrice:      bigOrNull(row.clearingPrice),
    startBlock:         row.startBlock,
    endBlock:           row.endBlock,
    endedAtBlock:       row.endedAtBlock       ?? null,
    effectiveEndBlock:  row.effectiveEndBlock  ?? null,
    estimatedStart:     estimateTime(row.startBlock, ctx),
    estimatedEnd:       estimateTime(row.effectiveEndBlock ?? row.endBlock, ctx),
    gateMode:           gateMode(row.gateMode),
    vestEnabled:        row.vestEnabled,
    vestCliffBlocks:    row.vestCliffBlocks,
    vestEndBlocks:      row.vestEndBlocks,
    creatorRevenue:     bigOrNull(row.creatorRevenue),
    protocolFee:        bigOrNull(row.protocolFee),
    referralBudget:     bigOrNull(row.referralBudget),
    feeBps:             row.feeBps,
    closerReward:       BigInt(row.closerReward),
    params:             auctionParams,
  };
}

export function toAuctionListItem(
  row:       AuctionRow,
  ctx:       BlockContext,
  metaRow:   AuctionMetadataRow | null,
  tokenInfo: TokenInfo | null,
): AuctionListItem {
  const auctionParams = buildParams(row);
  const isPaymentsType = row.type === AuctionType.Raise || row.type === AuctionType.Quadratic;
  const raiseTarget    = auctionParams.type === AuctionType.Raise ? auctionParams.raise_target : (row.raiseTarget ?? '0');

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
    progressPct:        progressPct(
      isPaymentsType ? row.totalPayments : row.totalCommitted,
      isPaymentsType ? raiseTarget       : row.supply
    ),
    currentPrice:    computeCurrentPrice(row, ctx.currentBlock),
    clearingPrice:   bigOrNull(row.clearingPrice),
    raiseTarget:     bigOrNull(row.raiseTarget),
    startBlock:        row.startBlock,
    endBlock:          row.endBlock,
    commitEndBlock:    row.commitEndBlock    ?? null,
    effectiveEndBlock: row.effectiveEndBlock ?? null,
    estimatedEnd:      estimateTime(row.effectiveEndBlock ?? row.endBlock, ctx),
    vestEnabled:       row.vestEnabled,
    gateMode:          gateMode(row.gateMode),
  };
}
