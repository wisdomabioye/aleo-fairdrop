/**
 * URL sanitization — strips non-https URLs from user-supplied strings.
 *
 * Used for displaying creator-provided website / social links from auction metadata.
 * Allowlist: https only. Returns null for http, protocol-relative, or invalid URLs.
 */

const ALLOWED_PROTOCOLS = ['https:'];

/**
 * Sanitize a user-supplied URL string.
 * Returns the URL if it uses an allowed protocol; null otherwise.
 *
 * @example sanitizeExternalUrl("https://example.com") → "https://example.com"
 * @example sanitizeExternalUrl("http://example.com")  → null
 * @example sanitizeExternalUrl("javascript:alert(1)") → null
 */
export function sanitizeExternalUrl(raw: string | null | undefined): string | null {
  if (!raw || !raw.trim()) return null;
  try {
    const parsed = new URL(raw.trim());
    return ALLOWED_PROTOCOLS.includes(parsed.protocol) ? raw.trim() : null;
  } catch {
    return null;
  }
}
