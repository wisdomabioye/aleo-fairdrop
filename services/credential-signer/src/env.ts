import type { CheckStrategy } from './check/loader.js';

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val || val.trim() === '') {
    throw new Error(`[credential-signer] Missing required env var: ${name}`);
  }
  return val.trim();
}

function optionalEnv(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

function requireInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  if (isNaN(n) || n <= 0) throw new Error(`[credential-signer] ${name} must be a positive integer, got: "${raw}"`);
  return n;
}

function requireStrategy(): CheckStrategy {
  const raw = requireEnv('CHECK_STRATEGY');
  const valid: CheckStrategy[] = ['custom', 'allowlist', 'webhook', 'token-gate'];
  if (!valid.includes(raw as CheckStrategy)) {
    throw new Error(`[credential-signer] CHECK_STRATEGY must be one of: ${valid.join(', ')}`);
  }
  return raw as CheckStrategy;
}

export const env = {
  issuerPrivateKey:   requireEnv('ISSUER_PRIVATE_KEY'),
  aleoRpcUrl:         requireEnv('ALEO_RPC_URL'),
  checkStrategy:      requireStrategy(),
  port:               requireInt('PORT', 3002),
  credentialTtlBlocks: requireInt('CREDENTIAL_TTL_BLOCKS', 5760),
  corsOrigin:         process.env['CORS_ORIGIN']?.trim() || '*',

  // Strategy-specific (loaded only when relevant strategy is active)
  customModule:      optionalEnv('CHECK_MODULE'),
  allowlistSource:   optionalEnv('ALLOWLIST_SOURCE'),
  webhookUrl:        optionalEnv('WEBHOOK_URL'),
  tokenGateId:       optionalEnv('TOKEN_GATE_TOKEN_ID'),
  tokenGateMin:      (() => {
    const v = optionalEnv('TOKEN_GATE_MIN_BALANCE');
    return v ? BigInt(v) : undefined;
  })(),
} as const;
