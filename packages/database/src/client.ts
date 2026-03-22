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

/**
 * Drizzle transaction instance — same query API as Db, scoped to a transaction.
 * Derived from Db so it can never drift from the actual transaction callback type.
 *
 * Usage: accept `Db | DbTx` when a function may be called both inside and
 * outside a transaction (e.g. transition handlers).
 */
export type DbTx = Parameters<Parameters<Db['transaction']>[0]>[0];
