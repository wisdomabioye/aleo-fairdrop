/**
 * DB row types inferred directly from the Drizzle schema.
 * These are the single source of truth — they cannot drift from the schema.
 *
 * Select = what you get back from a query.
 * Insert = what you pass to db.insert() — optional fields have defaults or are nullable.
 */
import { type InferSelectModel, type InferInsertModel } from 'drizzle-orm';
import type {
  auctions,
  auctionMetadata,
  bids,
  vesting,
  userReputation,
  creatorNonces,
  referralCodes,
  referralAttributions,
  indexerCheckpoints,
  indexerTransitions,
  protocolConfig,
} from './schema/index';

// Auctions
export type AuctionRow    = InferSelectModel<typeof auctions>;
export type NewAuction    = InferInsertModel<typeof auctions>;

// Auction metadata
export type AuctionMetadataRow = InferSelectModel<typeof auctionMetadata>;
export type NewAuctionMetadata = InferInsertModel<typeof auctionMetadata>;

// Bids & vesting
export type BidRow        = InferSelectModel<typeof bids>;
export type NewBid        = InferInsertModel<typeof bids>;
export type VestingRow    = InferSelectModel<typeof vesting>;
export type NewVesting    = InferInsertModel<typeof vesting>;

// Users
export type UserReputationRow = InferSelectModel<typeof userReputation>;
export type NewUserReputation = InferInsertModel<typeof userReputation>;
export type CreatorNonceRow   = InferSelectModel<typeof creatorNonces>;
export type NewCreatorNonce   = InferInsertModel<typeof creatorNonces>;

// Referrals
export type ReferralCodeRow        = InferSelectModel<typeof referralCodes>;
export type NewReferralCode        = InferInsertModel<typeof referralCodes>;
export type ReferralAttributionRow = InferSelectModel<typeof referralAttributions>;
export type NewReferralAttribution = InferInsertModel<typeof referralAttributions>;

// Indexer
export type IndexerCheckpointRow = InferSelectModel<typeof indexerCheckpoints>;
export type NewIndexerCheckpoint = InferInsertModel<typeof indexerCheckpoints>;
export type IndexerTransitionRow = InferSelectModel<typeof indexerTransitions>;
export type NewIndexerTransition = InferInsertModel<typeof indexerTransitions>;

// Protocol config (single-row; indexed from fairdrop_config.aleo)
export type ProtocolConfigRow = InferSelectModel<typeof protocolConfig>;
export type NewProtocolConfig  = InferInsertModel<typeof protocolConfig>;
