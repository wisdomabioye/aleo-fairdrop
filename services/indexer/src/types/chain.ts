/**
 * Extended on-chain types for the indexer's flat DB write path.
 *
 * FlatAuctionConfig extends BaseAuctionConfig and derives all type-specific
 * optional fields directly from the source contract interfaces — no manual
 * field listing. If a field is added to any type-specific config, it appears
 * here automatically as an optional field, preventing silent drift.
 *
 * FlatAuctionState is an alias for AuctionState — no indexer-specific additions.
 */

import type {
  BaseAuctionConfig,
  AuctionState,
  DutchAuctionConfig,
  SealedAuctionConfig,
  RaiseAuctionConfig,
  AscendingAuctionConfig,
  QuadraticAuctionConfig,
  LbpAuctionConfig
} from '@fairdrop/types/contracts/auctions';

type TypeSpecific<T extends BaseAuctionConfig> = Partial<Omit<T, keyof BaseAuctionConfig>>;

export interface FlatAuctionConfig extends
  BaseAuctionConfig,
  TypeSpecific<DutchAuctionConfig>,
  TypeSpecific<SealedAuctionConfig>,
  TypeSpecific<RaiseAuctionConfig>,
  TypeSpecific<AscendingAuctionConfig>,
  TypeSpecific<LbpAuctionConfig>,
  TypeSpecific<QuadraticAuctionConfig> {}

export type FlatAuctionState = AuctionState;
