import { ClaimStatus, type BidView } from '@fairdrop/types/domain';
import { AuctionType } from '@fairdrop/types/domain';
import type { BidRow, AuctionRow } from '@fairdrop/database';

function claimStatus(row: BidRow, auction: AuctionRow): ClaimStatus {
  if (row.refunded)             return ClaimStatus.Refunded;
  if (row.claimed)              return ClaimStatus.Claimed;
  if (auction.voided)           return ClaimStatus.Refundable;
  if (auction.cleared)          return ClaimStatus.Claimable;
  return ClaimStatus.Pending;
}

export function toBidView(row: BidRow, auction: AuctionRow): BidView {
  return {
    auctionId:     row.auctionId,
    auctionType:   auction.type as AuctionType,
    quantity:      BigInt(row.quantity),
    paymentAmount: BigInt(row.paymentAmount),
    clearingPrice: row.clearingPrice ? BigInt(row.clearingPrice) : null,
    cost:          row.cost          ? BigInt(row.cost)          : null,
    refund:        row.refund        ? BigInt(row.refund)        : null,
    claimStatus:   claimStatus(row, auction),
    vestEnabled:   auction.vestEnabled,
    placedAtBlock: row.placedAtBlock,
    placedAt:      row.placedAt ?? null,
  };
}
