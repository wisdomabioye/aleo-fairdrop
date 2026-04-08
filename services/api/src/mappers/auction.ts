import {
  AuctionType, AuctionStatus, GateMode,
  computeTier,
  type AuctionView, type AuctionListItem, type AuctionMetadata,
  type RaiseMechanismFields, type CreatorReputationResponse,
} from '@fairdrop/types/domain';
import { buildAuctionParams } from '@fairdrop/sdk/parse';
import type { AuctionRow, AuctionMetadataRow, CreatorReputationRow } from '@fairdrop/database';
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
  if (row.status === 'voided')       return AuctionStatus.Voided;
  if (row.status === 'cleared')      return AuctionStatus.Cleared;
  if (row.startBlock > currentBlock) return AuctionStatus.Upcoming;
  if (row.supplyMet)                 return AuctionStatus.Clearing;
  const liveEndBlock = row.type === AuctionType.Ascending
    ? (row.effectiveEndBlock ?? row.endBlock)
    : row.endBlock;
  if (liveEndBlock < currentBlock)   return AuctionStatus.Ended;
  return AuctionStatus.Active;
}

function estimateTime(targetBlock: number, ctx: BlockContext): Date | null {
  if (!ctx.lastProcessedAt || ctx.currentBlock === 0) return null;
  const diff = targetBlock - ctx.currentBlock;
  return new Date(ctx.lastProcessedAt.getTime() + diff * BLOCK_TIME_MS);
}

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

// ── Per-concern helpers ───────────────────────────────────────────────────────

function toRaiseFields(
  row:                 AuctionRow,
  isContributionType:  boolean,
  raiseTargetStr:      string,
): RaiseMechanismFields | undefined {
  if (!isContributionType) return undefined;
  return {
    raiseTarget:     BigInt(raiseTargetStr),
    fillMinBps:      row.fillMinBps ?? 0,
    effectiveSupply: row.effectiveSupply != null ? BigInt(row.effectiveSupply) : null,
  };
}

function toTimingFields(
  row: AuctionRow,
  ctx: BlockContext,
): Pick<AuctionView, 'startBlock' | 'endBlock' | 'endedAtBlock' | 'effectiveEndBlock' | 'estimatedStart' | 'estimatedEnd'> {
  return {
    startBlock:        row.startBlock,
    endBlock:          row.endBlock,
    endedAtBlock:      row.endedAtBlock      ?? null,
    effectiveEndBlock: row.effectiveEndBlock ?? null,
    estimatedStart:    estimateTime(row.startBlock, ctx),
    estimatedEnd:      estimateTime(row.effectiveEndBlock ?? row.endBlock, ctx),
  };
}

function toRevenueFields(
  row: AuctionRow,
): Pick<AuctionView, 'creatorRevenue' | 'protocolFee' | 'referralBudget' | 'supplyMet' | 'feeBps' | 'closerReward'> {
  return {
    creatorRevenue:  bigOrNull(row.creatorRevenue),
    protocolFee:     bigOrNull(row.protocolFee),
    referralBudget:  bigOrNull(row.referralBudget),
    supplyMet:       row.supplyMet,
    feeBps:          row.feeBps,
    closerReward:    BigInt(row.closerReward),
  };
}

function toCreatorStats(rep: CreatorReputationRow | null): CreatorReputationResponse | null {
  if (!rep) return null;
  return {
    address:            rep.address,
    auctionsRun:        rep.auctionsRun,
    filledAuctions:     rep.filledAuctions,
    volumeMicrocredits: rep.volume,
    fillRate:           rep.auctionsRun > 0 ? rep.filledAuctions / rep.auctionsRun : 0,
    tier:               computeTier(rep.auctionsRun, rep.filledAuctions),
  };
}

// ── Public mappers ────────────────────────────────────────────────────────────

export function toAuctionView(
  row:        AuctionRow,
  ctx:        BlockContext,
  metaRow:    AuctionMetadataRow | null,
  tokenInfo:  TokenInfo | null,
  creatorRep: CreatorReputationRow | null = null,
): AuctionView {
  const isContributionType = row.type === AuctionType.Raise || row.type === AuctionType.Quadratic;
  const raiseTargetStr     = row.raiseTarget ?? '0';

  return {
    id:                row.id,
    type:              row.type as AuctionType,
    status:            computeStatus(row, ctx.currentBlock),
    programId:         row.programId,
    creator:           row.creator,
    metadataHash:      row.metadataHash ?? null,
    metadata:          toMetadata(metaRow),
    saleTokenId:       row.saleTokenId,
    saleTokenSymbol:   tokenInfo?.symbol   ?? null,
    saleTokenDecimals: tokenInfo?.decimals ?? null,
    saleScale:         BigInt(row.saleScale ?? '1'),
    supply:            BigInt(row.supply),
    totalCommitted:    BigInt(row.totalCommitted),
    totalPayments:     BigInt(row.totalPayments),
    minBidAmount:      BigInt(row.minBidAmount ?? 0),
    maxBidAmount:      BigInt(row.maxBidAmount ?? 0),
    raise:             toRaiseFields(row, isContributionType, raiseTargetStr),
    progressPct:       progressPct(
      isContributionType ? row.totalPayments : row.totalCommitted,
      isContributionType ? raiseTargetStr    : row.supply,
    ),
    currentPrice:      computeCurrentPrice(row, ctx.currentBlock),
    clearingPrice:     bigOrNull(row.clearingPrice),
    gateMode:          gateMode(row.gateMode),
    vestEnabled:       row.vestEnabled,
    vestCliffBlocks:   row.vestCliffBlocks,
    vestEndBlocks:     row.vestEndBlocks,
    params:            buildAuctionParams(row),
    creatorReputation: toCreatorStats(creatorRep),
    bidCount:   row.bidCount,
    sqrtWeight: row.sqrtWeight ?? null,
    ...toTimingFields(row, ctx),
    ...toRevenueFields(row),
  };
}

export function toAuctionListItem(
  row:       AuctionRow,
  ctx:       BlockContext,
  metaRow:   AuctionMetadataRow | null,
  tokenInfo: TokenInfo | null,
  creatorRep: CreatorReputationRow | null = null,
): AuctionListItem {
  const isContributionType = row.type === AuctionType.Raise || row.type === AuctionType.Quadratic;
  const raiseTargetStr     = row.raiseTarget ?? '0';

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
    progressPct:     progressPct(
      isContributionType ? row.totalPayments : row.totalCommitted,
      isContributionType ? raiseTargetStr    : row.supply,
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
    creatorTier:       toCreatorStats(creatorRep)?.tier ?? null,
    bidCount:          row.bidCount,
  };
}
