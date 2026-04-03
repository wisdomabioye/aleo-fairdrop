import type { Address } from './scalars';

/**
 * The raw encrypted form of a Leo record as returned by the Aleo RPC / wallet.
 * Must be decrypted with the owner's view key before the plaintext fields are readable.
 */
export interface RecordCiphertext {
  /** Globally unique record commitment (serial number after spend). */
  commitment: string;
  /** AES-GCM ciphertext of the record plaintext. */
  ciphertext: string;
  /** Program that defines this record type (e.g. "fairdrop_dutch_v2.aleo"). */
  programId: string;
  /** Record struct name within the program (e.g. "Bid"). */
  recordName: string;
}

/**
 * A decrypted Leo record.
 * T is the plaintext struct shape (e.g. DutchBid, ParticipationReceipt).
 *
 * Records are single-spend UTXOs — once `spent` is true the record is
 * consumed on-chain and cannot be used in a transition input again.
 */
export interface DecodedRecord<T> {
  /** The decrypted owner address. */
  owner: Address;
  /** Decrypted plaintext data fields. */
  data: T;
  /** Original ciphertext (needed to construct transition inputs). */
  ciphertext: RecordCiphertext;
  /** True if this record has been spent (serial number nullified on-chain). */
  spent: boolean;
}
