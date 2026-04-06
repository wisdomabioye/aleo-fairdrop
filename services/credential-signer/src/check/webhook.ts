import type { CheckFn } from './types.js';

interface WebhookRequest {
  address:   string;
  auctionId: string;
}

interface WebhookResponse {
  allowed: boolean;
  reason?: string;
}

export function buildWebhookCheck(webhookUrl: string): CheckFn {
  return async (address, auctionId) => {
    const body: WebhookRequest = { address, auctionId };

    const res = await fetch(webhookUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`[webhook] check endpoint returned ${res.status}`);
    }

    const data = await res.json() as WebhookResponse;
    return data.allowed;
  };
}
