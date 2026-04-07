/**
 * Transaction builders for bid claim transitions.
 *
 * Each auction type has a distinct claim input layout (D11 pattern):
 *   Dutch / Sealed   — (bid, clearing_price, sale_token_id, sale_scale)
 *   Ascending / LBP  — (bid, sale_token_id)
 *   Raise            — (bid, total_payments, effective_supply, sale_token_id)
 *   Quadratic        — (bid, total_sqrt_weight, effective_supply, sale_token_id)
 *
 * claim_vested appends (ended_at_block, cliff_blocks, vest_end_blocks) to each.
 *
 * Raise and Quadratic have dedicated typed functions that enforce:
 *   - auction.raise is non-null (ContributionAuction intersection type)
 *   - totalSqrtWeight is a required parameter for Quadratic (not optional)
 * Fetch totalSqrtWeight with fetchSqrtWeights() from @fairdrop/sdk/chain.
 */

import type { AuctionView, RaiseMechanismFields } from '@fairdrop/types/domain';
import { AuctionType } from '@fairdrop/types/domain';
import { DEFAULT_TX_FEE, type ClaimRecord, type TxSpec } from './_types';

/**
 * Raise or Quadratic auction where `raise` is confirmed non-null.
 * Call sites must assert `auction.raise != null` before casting/passing.
 */
export type ContributionAuction = AuctionView & { raise: RaiseMechanismFields };

// ── claim ─────────────────────────────────────────────────────────────────────

/**
 * claim — Dutch / Sealed / Ascending / LBP only.
 *
 * For Raise use claimRaiseBid; for Quadratic use claimQuadraticBid.
 */
export function claimBid(
  record:  ClaimRecord,
  auction: AuctionView,
  fee = DEFAULT_TX_FEE,
): TxSpec {
  let inputs: string[];

  switch (auction.type) {
    case AuctionType.Dutch:
    case AuctionType.Sealed:
      inputs = [
        record.raw,
        `${auction.clearingPrice!}u128`,
        auction.saleTokenId,
        `${auction.saleScale}u128`,
      ];
      break;

    case AuctionType.Ascending:
    case AuctionType.Lbp:
      inputs = [record.raw, auction.saleTokenId];
      break;

    case AuctionType.Raise:
    case AuctionType.Quadratic:
      throw new Error(
        `claimBid: use claimRaiseBid / claimQuadraticBid for ${auction.type} auctions`,
      );
  }

  return { program: record.programId, function: 'claim', inputs, fee, privateFee: false };
}

/**
 * claimRaiseBid — Raise auction; tokens distributed pro-rata to contributions.
 */
export function claimRaiseBid(
  record:  ClaimRecord,
  auction: ContributionAuction,
  fee = DEFAULT_TX_FEE,
): TxSpec {
  if (auction.raise.effectiveSupply == null) {
    throw new Error('claimRaiseBid: effectiveSupply is null — auction not yet cleared');
  }
  return {
    program: record.programId, function: 'claim', fee, privateFee: false,
    inputs: [
      record.raw,
      `${auction.totalPayments}u128`,
      `${auction.raise.effectiveSupply}u128`,
      auction.saleTokenId,
    ],
  };
}

/**
 * claimQuadraticBid — Quadratic auction; tokens distributed by sqrt-weight.
 *
 * @param totalSqrtWeight - On-chain sqrt_weights[auctionId]. Fetch with
 *   fetchSqrtWeights(auction.id, auction.programId) from @fairdrop/sdk/chain.
 */
export function claimQuadraticBid(
  record:           ClaimRecord,
  auction:          ContributionAuction,
  totalSqrtWeight:  bigint,
  fee = DEFAULT_TX_FEE,
): TxSpec {
  if (auction.raise.effectiveSupply == null) {
    throw new Error('claimQuadraticBid: effectiveSupply is null — auction not yet cleared');
  }
  return {
    program: record.programId, function: 'claim', fee, privateFee: false,
    inputs: [
      record.raw,
      `${totalSqrtWeight}u128`,
      `${auction.raise.effectiveSupply}u128`,
      auction.saleTokenId,
    ],
  };
}

// ── claim_vested ──────────────────────────────────────────────────────────────

/**
 * claimVested — Dutch / Sealed / Ascending / LBP only.
 *
 * For Raise use claimRaiseVested; for Quadratic use claimQuadraticVested.
 */
export function claimVested(
  record:  ClaimRecord,
  auction: AuctionView,
  fee = DEFAULT_TX_FEE,
): TxSpec {
  const endedAt = `${auction.endedAtBlock!}u32`;
  const cliff   = `${auction.vestCliffBlocks}u32`;
  const vestEnd = `${auction.vestEndBlocks}u32`;

  let inputs: string[];

  switch (auction.type) {
    case AuctionType.Dutch:
    case AuctionType.Sealed:
      inputs = [
        record.raw,
        `${auction.clearingPrice!}u128`,
        auction.saleTokenId,
        `${auction.saleScale}u128`,
        endedAt, cliff, vestEnd,
      ];
      break;

    case AuctionType.Ascending:
    case AuctionType.Lbp:
      inputs = [record.raw, auction.saleTokenId, endedAt, cliff, vestEnd];
      break;

    case AuctionType.Raise:
    case AuctionType.Quadratic:
      throw new Error(
        `claimVested: use claimRaiseVested / claimQuadraticVested for ${auction.type} auctions`,
      );
  }

  return { program: record.programId, function: 'claim_vested', inputs, fee, privateFee: false };
}

/**
 * claimRaiseVested — Raise auction with vesting.
 */
export function claimRaiseVested(
  record:  ClaimRecord,
  auction: ContributionAuction,
  fee = DEFAULT_TX_FEE,
): TxSpec {
  if (auction.raise.effectiveSupply == null) {
    throw new Error('claimRaiseVested: effectiveSupply is null — auction not yet cleared');
  }
  const endedAt = `${auction.endedAtBlock!}u32`;
  const cliff   = `${auction.vestCliffBlocks}u32`;
  const vestEnd = `${auction.vestEndBlocks}u32`;
  return {
    program: record.programId, function: 'claim_vested', fee, privateFee: false,
    inputs: [
      record.raw,
      `${auction.totalPayments}u128`,
      `${auction.raise.effectiveSupply}u128`,
      auction.saleTokenId,
      endedAt, cliff, vestEnd,
    ],
  };
}

/**
 * claimQuadraticVested — Quadratic auction with vesting.
 *
 * @param totalSqrtWeight - On-chain sqrt_weights[auctionId]. Fetch with
 *   fetchSqrtWeights(auction.id, auction.programId) from @fairdrop/sdk/chain.
 */
export function claimQuadraticVested(
  record:          ClaimRecord,
  auction:         ContributionAuction,
  totalSqrtWeight: bigint,
  fee = DEFAULT_TX_FEE,
): TxSpec {
  if (auction.raise.effectiveSupply == null) {
    throw new Error('claimQuadraticVested: effectiveSupply is null — auction not yet cleared');
  }
  const endedAt = `${auction.endedAtBlock!}u32`;
  const cliff   = `${auction.vestCliffBlocks}u32`;
  const vestEnd = `${auction.vestEndBlocks}u32`;
  return {
    program: record.programId, function: 'claim_vested', fee, privateFee: false,
    inputs: [
      record.raw,
      `${totalSqrtWeight}u128`,
      `${auction.raise.effectiveSupply}u128`,
      auction.saleTokenId,
      endedAt, cliff, vestEnd,
    ],
  };
}

// ── voided claims ─────────────────────────────────────────────────────────────

/**
 * claim_voided — cancelled auction; refunds a revealed Bid record.
 */
export function claimVoided(record: ClaimRecord, fee = DEFAULT_TX_FEE): TxSpec {
  return {
    program:    record.programId,
    function:   'claim_voided',
    inputs:     [record.raw],
    fee,
    privateFee: false,
  };
}

/**
 * claim_commit_voided — cancelled sealed auction; refunds an unrevealed Commitment record.
 */
export function claimCommitVoided(record: ClaimRecord, fee = DEFAULT_TX_FEE): TxSpec {
  return {
    program:    record.programId,
    function:   'claim_commit_voided',
    inputs:     [record.raw],
    fee,
    privateFee: false,
  };
}
