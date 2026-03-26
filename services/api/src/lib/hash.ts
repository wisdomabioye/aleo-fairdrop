/**
 * Metadata hash computation.
 *
 * Produces a deterministic field-compatible hash of the canonical metadata JSON.
 * Algorithm: SHA-256(canonical JSON bytes) → BigInt → mod BLS12-377 scalar field order
 *            → zero-padded hex string.
 *
 * Why not literal BHP256 from Leo?
 * BHP256::hash_to_field operates on Leo struct types, not arbitrary byte arrays.
 * Replicating it server-side would require WASM and a Leo-typed representation of
 * the metadata. Since the contract stores the hash opaquely (no on-chain recompute),
 * any deterministic field-valued hash works — the server is the authority.
 *
 * Verification: fetch IPFS content → canonicalize → computeMetadataHash → compare
 * to auctions.metadata_hash. The algorithm is open and documented here.
 */

/** BLS12-377 scalar field order. */
const FIELD_ORDER = 8444461749428370424248824938781546531375899335154063827935233455917409239041n;

/**
 * Canonical JSON serialisation — deterministic key order, no extra whitespace.
 * This is the string that gets hashed.
 */
export function canonicalJson(obj: Record<string, unknown>): string {
  return JSON.stringify(obj, Object.keys(obj).sort());
}

/**
 * Compute a field-valued hash of a metadata object.
 * Returns the field as a decimal string (no "field" suffix) — matches
 * Leo's field literal format after stripping the suffix.
 */
export async function computeMetadataHash(obj: Record<string, unknown>): Promise<string> {
  const bytes  = new TextEncoder().encode(canonicalJson(obj));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const arr    = new Uint8Array(digest);
  const big    = arr.reduce((acc, byte) => (acc << 8n) | BigInt(byte), 0n);
  return (big % FIELD_ORDER).toString();
}
