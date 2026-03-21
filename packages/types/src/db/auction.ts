/**
 * Database row shapes for the auctions table.
 * These mirror the DB schema exactly — no computed or derived fields.
 * Numeric on-chain values are stored as strings (bigint-safe).
 */
export interface AuctionRow {
  /** auction_id field as hex string — primary key. */
  id:              string;
  type:            string;    // AuctionType
  programId:       string;    // e.g. 'fairdrop_dutch.aleo'
  creator:         string;    // address

  // Token
  saleTokenId:     string;
  paymentTokenId:  string;

  // Supply
  supply:          string;    // u128 as decimal string
  totalCommitted:  string;
  totalPayments:   string;

  // Status (denormalised for query performance)
  status:          string;    // AuctionStatus
  supplyMet:       boolean;
  cleared:         boolean;
  voided:          boolean;

  // Price
  startPrice:      string | null;   // null for non-Dutch types
  floorPrice:      string | null;
  clearingPrice:   string | null;

  // Timing
  startBlock:      number;
  endBlock:        number;
  endedAtBlock:    number | null;

  // Revenue
  creatorRevenue:  string | null;
  protocolFee:     string | null;
  referralBudget:  string | null;

  // Config (JSON snapshot of full on-chain AuctionConfig)
  configJson:      Record<string, unknown>;
  stateJson:       Record<string, unknown>;

  // Protocol params snapshotted at create
  feeBps:          number;
  closerReward:    string;

  // Gate & vesting
  gateMode:        number;
  vestEnabled:     boolean;
  vestCliffBlocks: number;
  vestEndBlocks:   number;

  createdAtBlock:  number;
  createdAt:       Date;
  updatedAt:       Date;
}
