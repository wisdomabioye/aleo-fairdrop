/**
 * Bigint-safe JSON responder.
 *
 * JSON.stringify throws on bigint values. Hono's c.json() uses JSON.stringify
 * internally, so any response containing bigint fields (supply, totalCommitted,
 * clearingPrice, etc.) would crash at runtime.
 *
 * All routes use json() from here instead of c.json().
 */
import type { Context } from 'hono';
import type { StatusCode } from 'hono/utils/http-status';

function replacer(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? value.toString() : value;
}

export function json<T>(c: Context, data: T, status: StatusCode = 200): Response {
  return new Response(JSON.stringify(data, replacer), {
    status,
    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
  });
}
