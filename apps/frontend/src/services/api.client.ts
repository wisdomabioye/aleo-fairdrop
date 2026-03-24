import { API_URL } from '@/env';

/** Convert a plain object to a URL query string (skips null/undefined values). */
export function toQueryString(params: Record<string, unknown>): string {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== null && v !== undefined && v !== '',
  );
  return new URLSearchParams(
    entries.map(([k, v]) => [k, String(v)]),
  ).toString();
}

/**
 * Typed fetch wrapper for the Fairdrop API.
 * Throws on non-2xx responses with the JSON error body when available.
 */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${API_URL}${path}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  });

  if (!res.ok) {
    let message = `API error ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string; message?: string };
      message = body.error ?? body.message ?? message;
    } catch { /* non-JSON body — keep default message */ }
    throw new Error(message);
  }

  return res.json() as Promise<T>;
}
