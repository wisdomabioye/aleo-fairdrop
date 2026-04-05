/** Default transaction fee in microcredits (0.3 ALEO). */
export const DEFAULT_TX_FEE = 300_000;

/**
 * Minimal transaction spec returned by all builders.
 * Structurally compatible with TransactionOptions from @provablehq/aleo-types.
 *
 * inputs is (string | Record<string, unknown>)[] to accommodate wallet record
 * objects (e.g. the token record in create_auction). The wallet adapter accepts
 * record objects at runtime despite @provablehq/aleo-types typing inputs as string[].
 */
export interface TxSpec {
  program:    string;
  function:   string;
  inputs:     (string | Record<string, unknown>)[];
  fee:        number;
  privateFee: boolean;
}

/** Minimal bid/commitment record needed by claim builders. */
export interface ClaimRecord {
  /** Raw wallet record string — wallet adapter handles serialization at runtime. */
  raw:       string;
  /** Program that issued this record (matches auction.programId). */
  programId: string;
}
