/**
 * Struct parsers for fairdrop utility contract mapping values.
 * (gate, ref, proof)
 *
 * Types live in @fairdrop/types/contracts/utilities — this file only parses.
 */

import type { GateConfig, ReferralConfig, ReferralRecord, CreatorReputation } from '@fairdrop/types/contracts/utilities';
import { asField, asAddress, asU128, asU64 } from '@fairdrop/types/primitives';
import { parseStruct, parseField, parseAddress, parseU16, parseU128, parseBool } from './leo';

// ── fairdrop_gate_v2.aleo ─────────────────────────────────────────────────────

/**
 * Assemble a GateConfig from three separately-stored mapping values.
 * gate_modes, allowlists, and credential_issuers are individual mappings
 * in fairdrop_gate_v2.aleo — there is no single struct to parseStruct over.
 */
export function assembleGateConfig(
  gateMode:   string | null,
  merkleRoot: string | null,
  issuer:     string | null,
): GateConfig {
  return {
    gate_mode:   gateMode   ? parseInt(gateMode.replace(/u\d+$/, '').trim(), 10) : 0,
    merkle_root: asField(merkleRoot ? parseField(merkleRoot) : '0'),
    issuer:      asAddress(issuer   ? parseAddress(issuer)   : ''),
  };
}

// ── fairdrop_ref_v2.aleo ──────────────────────────────────────────────────────

/** Parse a ReferralConfig struct from registrations[codeId]. */
export function parseReferralConfig(raw: string): ReferralConfig {
  const p = parseStruct(raw);
  return {
    auction_id: asField(parseField(p['auction_id'] ?? '0field')),
    bps:        parseU16(p['bps'] ?? '0u16'),
  };
}

/** Parse a ReferralRecord struct from referral_records[key]. */
export function parseReferralRecord(raw: string): ReferralRecord {
  const p = parseStruct(raw);
  return {
    code_id:        asField(parseField(p['code_id'] ?? '0field')),
    payment_amount: asU128(parseU128(p['payment_amount'] ?? '0u128')),
    credited:       parseBool(p['credited'] ?? 'false'),
  };
}

// ── fairdrop_proof_v2.aleo ────────────────────────────────────────────────────

/**
 * Parse a CreatorStats struct from proof's reputation[creator].
 *
 * Leo field names differ from TypeScript type names:
 *   auctions_run → total_auctions
 *   filled       → filled_auctions
 *   volume       → total_volume
 */
export function parseCreatorReputation(raw: string): CreatorReputation {
  const p = parseStruct(raw);
  return {
    total_auctions:  asU64(parseU128(p['auctions_run'] ?? '0u64')),
    filled_auctions: asU64(parseU128(p['filled']       ?? '0u64')),
    total_volume:    asU128(parseU128(p['volume']       ?? '0u128')),
  };
}
