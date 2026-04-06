import { resolve } from 'node:path';
import { buildAllowlistCheck } from './allowlist.js';
import { buildWebhookCheck }   from './webhook.js';
import { buildTokenGateCheck } from './token-gate.js';
import type { CheckFn } from './types.js';

export type CheckStrategy = 'custom' | 'allowlist' | 'webhook' | 'token-gate';

interface LoaderOptions {
  strategy:       CheckStrategy;
  customModule?:  string;
  allowlistSource?: string;
  webhookUrl?:    string;
  tokenGateId?:   string;
  tokenGateMin?:  bigint;
}

async function loadCustom(modulePath: string): Promise<CheckFn> {
  const resolved = resolve(process.cwd(), modulePath);
  const mod = await import(resolved) as { default: CheckFn };

  if (typeof mod.default !== 'function') {
    throw new Error(`[loader] Custom module at "${modulePath}" must export a default function`);
  }

  return mod.default;
}

export async function loadCheckFn(opts: LoaderOptions): Promise<CheckFn> {
  switch (opts.strategy) {
    case 'custom': {
      if (!opts.customModule) throw new Error('[loader] CHECK_MODULE is required for custom strategy');
      return loadCustom(opts.customModule);
    }

    case 'allowlist': {
      if (!opts.allowlistSource) throw new Error('[loader] ALLOWLIST_SOURCE is required for allowlist strategy');
      return buildAllowlistCheck(opts.allowlistSource);
    }

    case 'webhook': {
      if (!opts.webhookUrl) throw new Error('[loader] WEBHOOK_URL is required for webhook strategy');
      return buildWebhookCheck(opts.webhookUrl);
    }

    case 'token-gate': {
      if (!opts.tokenGateId)  throw new Error('[loader] TOKEN_GATE_TOKEN_ID is required for token-gate strategy');
      if (!opts.tokenGateMin) throw new Error('[loader] TOKEN_GATE_MIN_BALANCE is required for token-gate strategy');
      return buildTokenGateCheck(opts.tokenGateId, opts.tokenGateMin);
    }
  }
}
