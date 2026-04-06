import { Hono }           from 'hono';
import { HTTPException }  from 'hono/http-exception';
import { isValidField }   from '@fairdrop/sdk/parse';
import { getAleoClient }  from '@fairdrop/sdk/client';
import { env }                   from '../env.js';
import { verifyWalletOwnership } from '../verification.js';
import { issueCredential }       from '../signing.js';
import type { CheckFn }          from '../check/types.js';

// ── Rate limiter ──────────────────────────────────────────────────────────────
// One credential per (holderAddress, auctionId) per window.

const RATE_WINDOW_MS = 60_000; // 1 minute per (address, auctionId)

const rateMap = new Map<string, number>();

function isRateLimited(address: string, auctionId: string): boolean {
  const key  = `${address}:${auctionId}`;
  const last = rateMap.get(key) ?? 0;
  const now  = Date.now();
  if (now - last < RATE_WINDOW_MS) return true;
  rateMap.set(key, now);
  setTimeout(() => rateMap.delete(key), RATE_WINDOW_MS);
  return false;
}

// ── Request validation ────────────────────────────────────────────────────────

interface IssueRequestBody {
  auctionId:       string;
  holderAddress:   string;
  walletSignature: string;
}

function validateBody(body: unknown): IssueRequestBody {
  if (
    typeof body !== 'object' ||
    body === null ||
    typeof (body as Record<string, unknown>)['auctionId']       !== 'string' ||
    typeof (body as Record<string, unknown>)['holderAddress']    !== 'string' ||
    typeof (body as Record<string, unknown>)['walletSignature']  !== 'string'
  ) {
    throw new HTTPException(400, { message: 'auctionId, holderAddress, and walletSignature are required' });
  }

  const { auctionId, holderAddress, walletSignature } = body as IssueRequestBody;

  if (!isValidField(auctionId)) {
    throw new HTTPException(400, { message: 'Invalid auctionId' });
  }
  if (!holderAddress.startsWith('aleo1')) {
    throw new HTTPException(400, { message: 'Invalid holderAddress' });
  }

  return { auctionId, holderAddress, walletSignature };
}

// ── Router factory ────────────────────────────────────────────────────────────

export function buildCredentialsRouter(checkFn: CheckFn) {
  const router = new Hono();

  router.post('/issue', async (c) => {
    const body = validateBody(await c.req.json());
    const { auctionId, holderAddress, walletSignature } = body;

    // Rate limit before any expensive work
    if (isRateLimited(holderAddress, auctionId)) {
      throw new HTTPException(429, { message: 'Too many requests — try again shortly' });
    }

    // Layer 1 — prove the requester controls holderAddress
    try {
      verifyWalletOwnership(holderAddress, auctionId, walletSignature);
    } catch {
      throw new HTTPException(401, { message: 'Wallet signature verification failed' });
    }

    // Layer 2 — creator's access check
    const allowed = await checkFn(holderAddress, auctionId);
    if (!allowed) {
      throw new HTTPException(403, { message: 'Address not authorized for this auction' });
    }

    const currentBlock = await getAleoClient().getLatestHeight();
    const expiry       = Number(currentBlock) + env.credentialTtlBlocks;
    const credential   = issueCredential(holderAddress, auctionId, expiry);

    return c.json(credential);
  });

  return router;
}
