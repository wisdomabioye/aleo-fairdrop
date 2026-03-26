/**
 * Token struct parsers — shared between indexer (Node) and frontend (browser).
 *
 * Returns types from @fairdrop/types/domain/token — no local redefinition.
 *
 * ASCII encoding: token_registry.aleo packs name and symbol as u128 values
 * using big-endian ASCII (max 16 chars). asciiToU128 / u128ToAscii handle
 * encoding and decoding.
 */

import type { TokenInfo } from '@fairdrop/types/domain';
import { parseStruct, parseAddress, parseU8, parseU32, parseBool, stripSuffix, stripVisibility } from './leo';

// ── ASCII / u128 codec ────────────────────────────────────────────────────────

/**
 * Encode a human-readable ASCII string to the u128 big-endian format used by
 * token_registry.aleo for name and symbol fields.
 *
 * Max 16 characters (16 bytes × 8 bits = 128 bits).
 * Only printable ASCII (1-127) is allowed.
 *
 * @example asciiToU128("pALEO") → 482131854671n
 */
export function asciiToU128(str: string): bigint {
  if (str.length === 0) throw new Error('Name/symbol cannot be empty.');
  if (str.length > 16) throw new Error('Max 16 characters.');
  let result = 0n;
  for (const char of str) {
    const code = char.charCodeAt(0);
    if (code <= 0 || code >= 128) throw new Error(`Non-ASCII character: "${char}"`);
    result = (result << 8n) | BigInt(code);
  }
  return result;
}

/**
 * Decode a u128 ASCII-packed name or symbol back to a human-readable string.
 *
 * token_registry.aleo packs ASCII characters into a u128 value big-endian:
 *   "pALEO" → 0x70414c454f → 482131854671n
 *
 * Verified: u128ToAscii(482131854671n) === "pALEO"
 */
export function u128ToAscii(value: bigint): string {
  if (value === 0n) return '';
  const bytes: number[] = [];
  let v = value;
  while (v > 0n) {
    bytes.unshift(Number(v & 0xffn));
    v >>= 8n;
  }
  return bytes
    .filter((b) => b > 0 && b < 128)
    .map((b) => String.fromCharCode(b))
    .join('');
}

// ── Struct parsers ─────────────────────────────────────────────────────────────

/**
 * Parse a TokenMetadata struct string from token_registry.aleo/registered_tokens.
 * Returns TokenInfo from @fairdrop/types/domain — no local type definition.
 */
export function parseTokenInfo(raw: string): TokenInfo {
  const p = parseStruct(raw);

  const nameRaw   = BigInt(stripSuffix(stripVisibility(p['name']   ?? '0')));
  const symbolRaw = BigInt(stripSuffix(stripVisibility(p['symbol'] ?? '0')));

  return {
    tokenId:               p['token_id'],
    name:                  u128ToAscii(nameRaw),
    symbol:                u128ToAscii(symbolRaw),
    decimals:              parseU8(p['decimals'] ?? '0u8'),
    totalSupply:           BigInt(stripSuffix(stripVisibility(p['supply']     ?? '0'))),
    maxSupply:             BigInt(stripSuffix(stripVisibility(p['max_supply'] ?? '0'))),
    admin:                 parseAddress(p['admin'] ?? ''),
    externalAuthorizationRequired: parseBool(p['external_authorization_required'] ?? 'false'),
  };
}

/**
 * Parse a raw on-chain Balance struct from token_registry.aleo.
 * Returns a plain object — callers enrich it with symbol/decimals from the registry.
 */
export interface RawTokenBalance {
  tokenId:         string;
  account:         string;
  amount:          bigint;
  authorizedUntil: number;
}

export function parseRawTokenBalance(raw: string): RawTokenBalance {
  const p = parseStruct(raw);
  return {
    tokenId:         p['token_id'],
    account:         parseAddress(p['account'] ?? ''),
    amount:          BigInt(stripSuffix(stripVisibility(p['balance'] ?? '0'))),
    authorizedUntil: parseU32(p['authorized_until'] ?? '0u32'),
  };
}
