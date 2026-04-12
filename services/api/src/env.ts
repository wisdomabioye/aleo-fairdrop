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
  /** Comma-separated origins. Defaults to '*' in development. e.g. "https://app.example.com,https://admin.example.com" */
  corsOrigins: (() => {
    const raw = process.env['CORS_ORIGIN']?.trim();
    if (!raw) return '*' as const;
    const origins = raw.split(',').map(s => s.trim()).filter(Boolean);
    return origins.length === 1 ? origins[0]! : origins;
  })(),
  aleoRpcUrl:  requireEnv('ALEO_RPC_URL'),
  pinataJwt:   requireEnv('PINATA_JWT'),
} as const;
