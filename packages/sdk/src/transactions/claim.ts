/**
 * Transaction builders for bid claim transitions.
 *
 * Each auction type has a distinct claim input layout (D11 pattern):
 *   Dutch / Sealed   — (bid, clearing_price, sale_token_id, sale_scale)
 *   Ascending / LBP  — (bid, sale_token_id)
 *   Raise            — (bid, total_payments, raise_target, supply, sale_token_id, sale_scale)
 *   Quadratic        — (bid, total_sqrt_weight, supply, sale_token_id)
 *
 * claim_vested appends (ended_at_block, cliff_blocks, vest_end_blocks) to each.
 *
 * Quadratic claim requires `totalSqrtWeight` — the accumulated sqrt_weights[auctionId]
 * value. Fetch it with fetchSqrtWeights() from @fairdrop/sdk/chain before calling.
 */

import type { AuctionView } from '@fairdrop/types/domain';
import { AuctionType } from '@fairdrop/types/domain';
import type { RaiseAuctionConfig } from '@fairdrop/types/contracts/auctions';
import { DEFAULT_TX_FEE, type ClaimRecord, type TxSpec } from './_types';

type RaiseParams = Pick<RaiseAuctionConfig, 'raise_target'>;

// ── claim ─────────────────────────────────────────────────────────────────────

/**
 * claim — settled auction; delivers sale tokens to the bidder.
 *
 * @param record          - Bid/commitment record from the user's wallet.
 * @param auction         - View of the cleared auction.
 * @param totalSqrtWeight - Required for Quadratic: on-chain sqrt_weights[auctionId].
 * @param fee             - Transaction fee in microcredits (default 0.3 ALEO).
 */
export function claimBid(
  record:           ClaimRecord,
  auction:          AuctionView,
  totalSqrtWeight?: bigint,
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

    case AuctionType.Raise: {
      const { raise_target } = auction.params as RaiseParams;
      inputs = [
        record.raw,
        `${auction.totalPayments}u128`,
        `${raise_target}u128`,
        `${auction.supply}u128`,
        auction.saleTokenId,
        `${auction.saleScale}u128`,
      ];
      break;
    }

    case AuctionType.Quadratic:
      if (totalSqrtWeight === undefined) {
        throw new Error('claimBid: totalSqrtWeight is required for Quadratic auctions');
      }
      inputs = [
        record.raw,
        `${totalSqrtWeight}u128`,
        `${auction.supply}u128`,
        auction.saleTokenId,
      ];
      break;
  }

  return { program: record.programId, function: 'claim', inputs, fee, privateFee: false };
}

// ── claim_vested ──────────────────────────────────────────────────────────────

/**
 * claim_vested — settled auction with vesting; issues a VestedAllocation record.
 *
 * @param record          - Bid/commitment record from the user's wallet.
 * @param auction         - View of the cleared auction (vestEnabled must be true).
 * @param totalSqrtWeight - Required for Quadratic: on-chain sqrt_weights[auctionId].
 * @param fee             - Transaction fee in microcredits (default 0.3 ALEO).
 */
export function claimVested(
  record:           ClaimRecord,
  auction:          AuctionView,
  totalSqrtWeight?: bigint,
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

    case AuctionType.Raise: {
      const { raise_target } = auction.params as RaiseParams;
      inputs = [
        record.raw,
        `${auction.totalPayments}u128`,
        `${raise_target}u128`,
        `${auction.supply}u128`,
        auction.saleTokenId,
        `${auction.saleScale}u128`,
        endedAt, cliff, vestEnd,
      ];
      break;
    }

    case AuctionType.Quadratic:
      if (totalSqrtWeight === undefined) {
        throw new Error('claimVested: totalSqrtWeight is required for Quadratic auctions');
      }
      inputs = [
        record.raw,
        `${totalSqrtWeight}u128`,
        `${auction.supply}u128`,
        auction.saleTokenId,
        endedAt, cliff, vestEnd,
      ];
      break;
  }

  return { program: record.programId, function: 'claim_vested', inputs, fee, privateFee: false };
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
