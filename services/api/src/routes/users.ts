import { Hono } from 'hono';
import type { Db } from '@fairdrop/database';
import type { UserProfileResponse } from '@fairdrop/types/api';
import {
  getUserReputation,
  getFilledAuctionCount,
  getUserReferralCodes,
  listAuctionsByCreator,
} from '../queries/users.js';
import { getBlockContext } from '../queries/auctions.js';
import { getMetadataByHashes } from '../queries/metadata.js';
import { getTokensBatch } from '../lib/tokens.js';
import { toAuctionListItem } from '../mappers/auction.js';
import { parsePagination, buildPage } from '../lib/pagination.js';
import { json } from '../lib/respond.js';
import { env } from '../env.js';

type Variables = { db: Db };

export const usersRouter = new Hono<{ Variables: Variables }>();

// GET /users/:address
usersRouter.get('/:address', async (c) => {
  const db      = c.get('db');
  const address = c.req.param('address');

  const [rep, filled] = await Promise.all([
    getUserReputation(db, address),
    getFilledAuctionCount(db, address),
  ]);

  const totalAuctions = rep?.auctionCount ?? 0;

  const profile: UserProfileResponse = {
    address,
    totalAuctions,
    filledAuctions: filled,
    fillRate:       totalAuctions > 0 ? filled / totalAuctions : null,
  };

  return json(c, profile);
});

// GET /users/:address/auctions
usersRouter.get('/:address/auctions', async (c) => {
  const db      = c.get('db');
  const address = c.req.param('address');
  const q       = c.req.query();

  const pag = parsePagination({ page: q.page, pageSize: q.pageSize });

  const [{ rows, total }, ctx] = await Promise.all([
    listAuctionsByCreator(db, address, pag),
    getBlockContext(db),
  ]);

  const [metadataMap, tokenInfoMap] = await Promise.all([
    getMetadataByHashes(db, rows.map((r) => r.metadataHash).filter((h): h is string => h != null)),
    getTokensBatch(db, env.aleoRpcUrl, [...new Set(rows.map((r) => r.saleTokenId))]),
  ]);

  const items = rows.map((r) =>
    toAuctionListItem(
      r,
      ctx,
      metadataMap.get(r.metadataHash ?? '') ?? null,
      tokenInfoMap.get(r.saleTokenId)       ?? null,
    ),
  );

  return json(c, buildPage(items, total, pag.page, pag.pageSize));
});

// GET /users/:address/referral-codes
usersRouter.get('/:address/referral-codes', async (c) => {
  const db      = c.get('db');
  const address = c.req.param('address');
  const codes   = await getUserReferralCodes(db, address);
  return json(c, { items: codes });
});
