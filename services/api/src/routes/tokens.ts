import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Db } from '@fairdrop/database';
import type { TokenMetadata } from '@fairdrop/types/domain';
import { parseStruct, parseU8, parseU128, parseAddress, parseBool } from '@fairdrop/sdk/parse';
import { decodeTokenString, setTokenCache } from '../lib/token-cache.js';
import { json } from '../lib/respond.js';
import { env } from '../env.js';

type Variables = { db: Db };

export const tokensRouter = new Hono<{ Variables: Variables }>();

// GET /tokens/:id/metadata
tokensRouter.get('/:id/metadata', async (c) => {
  const tokenId = c.req.param('id');

  const url = `${env.aleoRpcUrl}/programs/program/token_registry.aleo/mapping/registered_tokens/${tokenId}field`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });

  if (res.status === 404) throw new HTTPException(404, { message: `Token ${tokenId} not found` });
  if (!res.ok) throw new HTTPException(502, { message: `RPC error ${res.status}` });

  const raw = (await res.json()) as string;
  const f   = parseStruct(raw);

  // Parse once and warm the cache so getTokenInfoBatch hits on the next auction list request.
  const symbol   = decodeTokenString(f['symbol']!);
  const decimals = parseU8(f['decimals']!);
  setTokenCache(tokenId, { symbol, decimals });

  const token: TokenMetadata = {
    tokenId,
    name:                  decodeTokenString(f['name']!),
    symbol,
    decimals,
    totalSupply:           BigInt(parseU128(f['supply']!)),
    maxSupply:             BigInt(parseU128(f['max_supply']!)),
    admin:                 parseAddress(f['admin']!),
    externalAuthorization: parseBool(f['external_authorization']!),
    logoUrl:     null,
    description: null,
    website:     null,
    tags:        [],
    verified:    false,
  };

  return json(c, token);
});
