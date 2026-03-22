function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val || val.trim() === '') {
    throw new Error(`[api] Missing required env var: ${name}`);
  }
  return val.trim();
}

function requireInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  if (isNaN(n) || n <= 0) throw new Error(`[api] ${name} must be a positive integer, got: "${raw}"`);
  return n;
}

export const env = {
  databaseUrl: requireEnv('DATABASE_URL'),
  port:        requireInt('PORT', 3001),
  /** Defaults to '*' in development; set explicitly in production. */
  corsOrigin:  process.env['CORS_ORIGIN']?.trim() || '*',
  aleoRpcUrl:  requireEnv('ALEO_RPC_URL'),
  pinataJwt:   requireEnv('PINATA_JWT'),
} as const;
