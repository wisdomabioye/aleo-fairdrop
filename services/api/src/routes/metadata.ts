import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { toFieldLiteral } from '@fairdrop/sdk/format';
import type { Db } from '@fairdrop/database';
import type { MetadataCreateRequest, MetadataCreateResponse, LogoUploadResponse, MetadataResponse } from '@fairdrop/types/api';
import { insertMetadata, getMetadataByHash } from '../queries/metadata.js';
import { createPinataClient } from '../lib/ipfs.js';
import { computeMetadataHash } from '../lib/hash.js';
import { json } from '../lib/respond.js';
import { env } from '../env.js';

type Variables = { db: Db };

export const metadataRouter = new Hono<{ Variables: Variables }>();

const ipfs = createPinataClient(env.pinataJwt);

// ── Validation helpers ────────────────────────────────────────────────────────

function assertStr(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new HTTPException(400, { message: `${field} is required` });
  }
  const trimmed = value.trim();
  if (trimmed.length > max) {
    throw new HTTPException(400, { message: `${field} must be ${max} characters or fewer` });
  }
  return trimmed;
}

function assertOptStr(value: unknown, field: string, max: number): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') throw new HTTPException(400, { message: `${field} must be a string` });
  const trimmed = value.trim();
  if (trimmed.length > max) {
    throw new HTTPException(400, { message: `${field} must be ${max} characters or fewer` });
  }
  return trimmed || undefined;
}

function assertUrl(value: string | undefined, field: string): string | undefined {
  if (!value) return undefined;
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') {
      throw new HTTPException(400, { message: `${field} must be an http(s) URL` });
    }
  } catch {
    throw new HTTPException(400, { message: `${field} must be a valid URL` });
  }
  return value;
}

function assertIpfsCid(value: string | undefined, field: string): string | undefined {
  if (!value) return undefined;
  // CIDv0 starts with 'Qm', CIDv1 starts with 'bafy' or 'bafk'
  if (!/^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{58,})$/.test(value)) {
    throw new HTTPException(400, { message: `${field} must be a valid IPFS CID` });
  }
  return value;
}

// ── POST /metadata ────────────────────────────────────────────────────────────

metadataRouter.post('/', async (c) => {
  const db = c.get('db');

  let body: MetadataCreateRequest;
  try {
    body = await c.req.json<MetadataCreateRequest>();
  } catch {
    throw new HTTPException(400, { message: 'Invalid JSON body' });
  }

  const name           = assertStr(body.name,        'name',        100);
  const description    = assertStr(body.description, 'description', 1000);
  const website        = assertUrl(assertOptStr(body.website,        'website',        200), 'website');
  const logo_ipfs      = assertIpfsCid(assertOptStr(body.logo_ipfs,  'logo_ipfs',      100), 'logo_ipfs');
  const twitter        = assertOptStr(body.twitter,        'twitter',        50);
  const discord        = assertOptStr(body.discord,        'discord',        50);
  const credential_url = assertUrl(assertOptStr(body.credential_url, 'credential_url', 300), 'credential_url');

  // Canonical object — sorted keys, trimmed values — this exact shape is hashed and pinned.
  // No auction_id: metadata is content-addressed; the auction→metadata join is done
  // via auctions.metadata_hash = auction_metadata.hash on-chain and in the database.
  const canonical: Record<string, unknown> = {
    name,
    description,
    ...(website        ? { website }        : {}),
    ...(logo_ipfs      ? { logo_ipfs }      : {}),
    ...(twitter        ? { twitter }        : {}),
    ...(discord        ? { discord }        : {}),
    ...(credential_url ? { credential_url } : {}),
  };

  const [hash, ipfsCid] = await Promise.all([
    computeMetadataHash(canonical),
    ipfs.pin(canonical, `fairdrop-metadata-${name.slice(0, 40)}`),
  ]);
  const metadataHash = toFieldLiteral(hash)

  await insertMetadata(db, {
    hash: metadataHash,
    ipfsCid,
    name,
    description,
    website:       website        ?? null,
    logoIpfs:      logo_ipfs      ?? null,
    twitter:       twitter        ?? null,
    discord:       discord        ?? null,
    credentialUrl: credential_url ?? null,
    rawJson:       canonical,
    pinnedAt:      new Date(),
  });

  const response: MetadataCreateResponse = {
    metadata_hash: metadataHash,
    ipfs_cid:      ipfsCid,
  };

  return json(c, response, 201);
});

// ── POST /metadata/logo ───────────────────────────────────────────────────────

metadataRouter.post('/logo', async (c) => {
  let formData: FormData;
  try {
    formData = await c.req.formData();
  } catch {
    throw new HTTPException(400, { message: 'Expected multipart/form-data body' });
  }

  const file = formData.get('logo');
  if (!(file instanceof File)) {
    throw new HTTPException(400, { message: '"logo" file field is required' });
  }

  const MAX_BYTES = 2 * 1024 * 1024; // 2 MB
  if (file.size > MAX_BYTES) {
    throw new HTTPException(400, { message: 'Logo must be 2 MB or smaller' });
  }
  if (!file.type.startsWith('image/')) {
    throw new HTTPException(400, { message: 'Logo must be an image file' });
  }

  const blob   = new Blob([await file.arrayBuffer()], { type: file.type });
  const ipfsCid = await ipfs.pinFile(blob, file.name || 'logo');

  const response: LogoUploadResponse = { ipfs_cid: ipfsCid };
  return json(c, response, 201);
});

// ── GET /metadata/:hash ───────────────────────────────────────────────────────

metadataRouter.get('/:hash', async (c) => {
  const db   = c.get('db');
  const hash = c.req.param('hash');

  const row = await getMetadataByHash(db, hash);
  if (!row) throw new HTTPException(404, { message: `Metadata hash ${hash} not found` });

  const response: MetadataResponse = {
    hash:          row.hash,
    ipfsCid:       row.ipfsCid,
    name:          row.name,
    description:   row.description,
    website:       row.website       ?? null,
    logoIpfs:      row.logoIpfs      ?? null,
    twitter:       row.twitter       ?? null,
    discord:       row.discord       ?? null,
    credentialUrl: row.credentialUrl ?? null,
  };

  return json(c, response);
});
