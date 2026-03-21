/**
 * Typed shapes for the Aleo REST API responses.
 *
 * Derived from the @provablehq/sdk docs and block structure examples.
 * Verify these against a live node before trusting every field name.
 */

export interface AleoBlock {
  block_hash:    string;
  previous_hash: string;
  header: {
    metadata: {
      height:    number;
      timestamp: number;
      round:     number;
    };
  };
  /** Confirmed transactions in this block. */
  transactions: ConfirmedTransaction[];
}

export interface ConfirmedTransaction {
  /** Confirmed transaction ID (wraps the inner transaction + fee). */
  id:          string;
  status:      'accepted' | 'rejected';
  /** 'execute' | 'deploy' | 'fee' */
  type:        string;
  index:       number;
  transaction: AleoTransaction;
  /** Finalize (mapping) operations recorded for this transaction. */
  finalize:    FinalizeOperation[];
}

export interface AleoTransaction {
  id:         string;
  type:       string;
  execution?: {
    transitions:        AleoTransition[];
    global_state_root:  string;
    proof:              string;
  };
  deployment?: unknown;
}

export interface AleoTransition {
  /** Transition ID (as1...). Used for idempotency. */
  id:       string;
  /** Program ID, e.g. "fairdrop_dutch.aleo" */
  program:  string;
  /** Function name, e.g. "create_auction" */
  function: string;
  inputs:   TransitionValue[];
  outputs:  TransitionValue[];
  /** Transition public key (ephemeral). */
  tpk:      string;
  tcm:      string;
}

export interface TransitionValue {
  /** "public" | "private" | "record" | "external_record" | "constant" */
  type: string;
  id:   string;
  /**
   * Plaintext Leo value for public/constant inputs.
   * Absent (undefined) for private/record inputs — only commitment is on-chain.
   */
  value?: string;
}

/**
 * A single finalize (mapping) operation recorded in a block.
 *
 * NOTE: The Aleo REST API may return key_id/value_id (hashes) rather than
 * plaintext key/value. If so, use getMappingValue() for plaintext reads.
 * The exact format should be verified against a live testnet node.
 */
export interface FinalizeOperation {
  type:        string;     // "update_key_value" | "insert_key_value" | "remove_key_value" | ...
  mapping_id?: string;
  index?:      number;
  key_id?:     string;
  value_id?:   string;
  /** Plaintext key — only present if node exposes it (not guaranteed). */
  key?:        string;
  /** Plaintext value — only present if node exposes it (not guaranteed). */
  value?:      string;
}
