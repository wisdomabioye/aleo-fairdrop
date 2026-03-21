import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.js';

/**
 * Create a Drizzle database client.
 *
 * @param connectionString — postgres:// URL, typically from DATABASE_URL env var.
 *
 * @example
 * ```ts
 * import { createDb } from '@fairdrop/database/client'
 * const db = createDb(process.env.DATABASE_URL!)
 * ```
 */
export function createDb(connectionString: string) {
  if (!connectionString) {
    throw new Error('DATABASE_URL is required but was not provided');
  }
  const sql = postgres(connectionString);
  return drizzle(sql, { schema });
}

export type Db = ReturnType<typeof createDb>;
