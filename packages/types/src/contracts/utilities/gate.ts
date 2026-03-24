/**
 * fairdrop_gate_v1.aleo — TypeScript types.
 *
 * Access control for auction participation.
 * GATE_OPEN (0): anyone may bid.
 * GATE_MERKLE (1): bidder proves membership in a Merkle tree (allow-list).
 * GATE_CREDENTIAL (2): bidder holds a signed credential from a trusted issuer.
 */

import type { Field, Address, U8, Bool } from '../../primitives/scalars';

/** Numeric gate mode values — match Leo constants exactly. */
export const GateModeValue = {
  Open:       0,
  Merkle:     1,
  Credential: 2,
} as const;

export type GateModeValue = typeof GateModeValue[keyof typeof GateModeValue];

/** On-chain gate config stored per auction_id. */
export interface GateConfig {
  gate_mode:   U8;
  merkle_root: Field;   // 0field when gate_mode !== 1
  issuer:      Address; // zero address when gate_mode !== 2
}

/** Input to `register_gate` — called from auction create_auction. */
export interface RegisterGateInput {
  auction_id:  Field;
  gate_mode:   U8;
  merkle_root: Field;
  issuer:      Address;
}

/**
 * Input to `check_admission` — called from all bid transitions.
 * For Merkle gated auctions, a Merkle proof must accompany the call.
 */
export interface CheckAdmissionInput {
  auction_id: Field;
}

/** `verified` mapping value — BHP256(bidder, auction_id) => bool. */
export type VerifiedState = Bool;

