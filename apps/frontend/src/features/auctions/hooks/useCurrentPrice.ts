import type { AuctionView } from '@fairdrop/types/domain';

/**
 * Returns the current price for an auction, updated per block.
 *
 * Currently passes through the server-computed `currentPrice` from AuctionView.
 * Full client-side curve recomputation (Dutch step-down, Ascending step-up)
 * will be enabled in a follow-up once mechanism-specific config fields
 * (startPrice, decayBlocks, decayAmount, etc.) are included in AuctionView.
 */
export function useCurrentPrice(
  auction: AuctionView | undefined,
  _blockHeight: number | undefined,
): bigint | null {
  return auction?.currentPrice ?? null;
}
