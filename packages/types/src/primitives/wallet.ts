/**
 * Wallet record types for @provablehq wallet adapter v3.
 *
 * requestRecords(programId, true) returns WalletRecord[] where each entry has
 * recordName, recordPlaintext, spent, commitment, etc.
 * Parse fields via parsePlaintext(entry.recordPlaintext) from @fairdrop/sdk/parse.
 */

/**
 * Raw record object returned by requestRecords(programId, true) in wallet adapter v3.
 */
export interface WalletRecord {
  commitment:        string;
  tag:               string;
  recordName:        string;
  recordPlaintext:   string;
  recordCiphertext:  string;
  programName:       string;
  /** Encrypted field element — NOT the bech32 address. Parse owner from recordPlaintext. */
  owner:             string;
  spent:             boolean;
  blockHeight:       number;
  blockTimestamp:    number;
  transactionId:     string;
  functionName:      string;
  outputIndex:       number;
  transitionId:      string;
  transitionIndex:   number;
  transactionIndex:  number;
  sender:            string;
}

/**
 * Raw record object returned by requestRecords() without includePlaintext.
 * Fields may be nested under `.data` or flat at the root (adapter v3 legacy).
 */
export type WalletRawRecord = Record<string, unknown>;

/**
 * Runtime-parsed Token record from token_registry.aleo.
 * Field names are snake_case to match the on-chain struct.
 * Produced by useTokenRecords.
 */
export interface WalletTokenRecord {
  /** Commitment (record ID). */
  id:           string;
  /** Registered token ID (field string). */
  token_id:     string;
  /** Token balance in the token's smallest unit (parsed from u128). */
  amount:       bigint;
  /** Whether external authorization is required for transfers. */
  external_authorization_required: boolean;
  /** Block height until which the token is authorized (u32::MAX = no expiry). */
  authorized_until: number;
  /** Whether this record has already been spent. */
  spent:        boolean;
  /** Original record plaintext string — pass as transition input. */
  _record:      string;
}

/**
 * Runtime-parsed Bid record from any fairdrop auction program.
 * Field names match BaseBid — snake_case.
 * Amounts are bigint (parsed from U128 strings), not branded string types.
 * Produced by useBidRecords.
 */
export interface WalletBidRecord {
  /** Commitment (record ID). */
  id:             string;
  /** Program this record belongs to (e.g. "fairdrop_dutch_v3.aleo"). */
  programId:      string;
  /** Auction this bid belongs to (field string). */
  auction_id:     string;
  /** Effective bid quantity (parsed from u128). */
  quantity:       bigint;
  /** Payment amount locked in microcredits (parsed from u128). */
  payment_amount: bigint;
  /** Whether this record has already been spent. */
  spent:          boolean;
  /** Original record plaintext string — pass as transition input. */
  _record:        string;
}

/**
 * Private Commitment record — issued at commit_bid, consumed at reveal_bid.
 * The `commitment` field = BHP256(CommitRevealKey { quantity, nonce, bidder }).
 * Field names match SealedCommitment — snake_case.
 */
export interface WalletSealedCommitment {
  /** Commitment (record ID). */
  id:             string;
  /** Program this record belongs to (e.g. "fairdrop_dutch_v3.aleo"). */
  programId:      string;
  /** Auction this bid belongs to (field string). */
  auction_id:     string;
  /** Effective bid quantity (parsed from u128). */
  quantity:       bigint;
  /** Payment amount locked in microcredits (parsed from u128). */
  payment_amount: bigint;
  /** Whether this record has already been spent. */
  spent:          boolean;
  /** Original record plaintext string — pass as transition input. */
  _record:        string;
  commitment:     string;
  nonce: string
}

/**
 * Runtime-parsed LpToken record from fairswap_dex_v3.aleo.
 * Produced by useLpTokenRecords after parsing the U128 amount to bigint.
 */
export interface WalletLpRecord {
  /** Raw record plaintext — used as unique key AND as transition input. */
  id:       string;
  /** Pool key (field string with "field" suffix — matches LpToken.pool_key). */
  poolKey:  string;
  /** LP token balance (parsed from U128 string via BigInt(record.amount)). */
  amount:   bigint;
  /** Whether this record has already been spent. */
  spent:    boolean;
  /** Original record plaintext string — pass as transition input. */
  _record:  string;
}

/**
 * Runtime-parsed private credits record from credits.aleo.
 * Produced by useCreditRecords.
 */
export interface WalletCreditRecord {
  /** Commitment (record ID). */
  id:           string;
  /** Balance in microcredits (u64 on-chain, represented as bigint). */
  microcredits: bigint;
  /** Whether this record has already been spent. */
  spent:        boolean;
  /** Original record plaintext string — pass as transition input. */
  _record:      string;
}
