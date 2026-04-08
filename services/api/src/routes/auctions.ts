import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Db } from '@fairdrop/database';
import type { AuctionListParams } from '@fairdrop/types/api';
import { AuctionType, AuctionStatus, GateMode } from '@fairdrop/types/domain';
import { listAuctions, getAuction, getBlockContext } from '../queries/auctions.js';
import { getMetadataByHash, getMetadataByHashes } from '../queries/metadata.js';
import { getCreatorReputation, getCreatorReputationBatch } from '../queries/creators.js';
import { toAuctionView, toAuctionListItem } from '../mappers/auction.js';
import { getToken, getTokensBatch } from '../lib/tokens.js';
import { parsePagination, buildPage } from '../lib/pagination.js';
import { json } from '../lib/respond.js';
import { env } from '../env.js';

type Variables = { db: Db };

export const auctionsRouter = new Hono<{ Variables: Variables }>();

// GET /auctions
auctionsRouter.get('/', async (c) => {
  const db = c.get('db');
  const q  = c.req.query();

  // Validate enum params to prevent invalid values reaching statusCondition / queries.
  if (q.type   && !Object.values(AuctionType).includes(q.type as AuctionType)) {
    throw new HTTPException(400, { message: `Invalid type: ${q.type}` });
  }
  if (q.status && !Object.values(AuctionStatus).includes(q.status as AuctionStatus)) {
    throw new HTTPException(400, { message: `Invalid status: ${q.status}` });
  }

  const params: AuctionListParams = {
    type:     q.type     as AuctionType    | undefined,
    status:   q.status   as AuctionStatus  | undefined,
    creator:  q.creator  as string         | undefined,
    token:    q.token    as string         | undefined,
    sort:     q.sort     as AuctionListParams['sort'] | undefined,
    order:    q.order    as 'asc' | 'desc' | undefined,
    page:     q.page     ? Number(q.page)     : undefined,
    pageSize: q.pageSize ? Number(q.pageSize) : undefined,
  };

  const pag = parsePagination(params);

  // Fetch block context first — used for both exact status filtering and mapping
  const ctx = await getBlockContext(db);

  const { rows, total } = await listAuctions(db, params, ctx.currentBlock, pag);

  const [metadataMap, tokenInfoMap, creatorRepMap] = await Promise.all([
    getMetadataByHashes(db, rows.map((r) => r.metadataHash).filter((h): h is string => h != null)),
    getTokensBatch(db, env.aleoRpcUrl, [...new Set(rows.map((r) => r.saleTokenId))]),
    getCreatorReputationBatch(db, [...new Set(rows.map((r) => r.creator))]),
  ]);

  const items = rows.map((r) =>
    toAuctionListItem(
      r,
      ctx,
      metadataMap.get(r.metadataHash ?? '') ?? null,
      tokenInfoMap.get(r.saleTokenId)       ?? null,
      creatorRepMap.get(r.creator)          ?? null,
    ),
  );

  return json(c, buildPage(items, total, pag.page, pag.pageSize));
});

// GET /auctions/filters
auctionsRouter.get('/filters', (c) => {
  return json(c, {
    types:     Object.values(AuctionType),
    statuses:  Object.values(AuctionStatus),
    gateModes: Object.values(GateMode),
    vestOnly:  false,
  });
});

// GET /auctions/:id
auctionsRouter.get('/:id', async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');

  const [row, ctx] = await Promise.all([
    getAuction(db, id),
    getBlockContext(db),
  ]);

  if (!row) throw new HTTPException(404, { message: `Auction ${id} not found` });

  const [metaRow, tokenInfo, creatorRep] = await Promise.all([
    row.metadataHash ? getMetadataByHash(db, row.metadataHash) : Promise.resolve(null),
    getToken(db, env.aleoRpcUrl, row.saleTokenId),
    getCreatorReputation(db, row.creator),
  ]);

  return json(c, toAuctionView(row, ctx, metaRow, tokenInfo, creatorRep));
});
