import type { MiddlewareHandler } from 'hono';
import type { Db } from '@fairdrop/database';

/**
 * Injects the shared Drizzle db instance into every request context.
 * Routes access it via c.get('db') — no module-level globals.
 */
export function dbMiddleware(db: Db): MiddlewareHandler {
  return async (c, next) => {
    c.set('db', db);
    await next();
  };
}
