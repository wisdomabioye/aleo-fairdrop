import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Db } from '@fairdrop/database';
import type { AuctionListParams } from '@fairdrop/types/api';
import { AuctionType, AuctionStatus, GateMode } from '@fairdrop/types/domain';
import { listAuctions, getAuction, getBlockContext } from '../queries/auctions.js';
import { getMetadataByHash, getMetadataByHashes } from '../queries/metadata.js';
import { toAuctionView, toAuctionListItem } from '../mappers/auction.js';
import { getTokenInfo, getTokenInfoBatch } from '../lib/token-cache.js';
import { parsePagination, buildPage } from '../lib/pagination.js';
import { json } from '../lib/respond.js';
import { env } from '../env.js';

type Variables = { db: Db };

export const auctionsRouter = new Hono<{ Variables: Variables }>();

// GET /auctions
auctionsRouter.get('/', async (c) => {
  const db = c.get('db');
  const q  = c.req.query();

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

  const { page, pageSize } = parsePagination(params);

  // Fetch block context first — used for both exact status filtering and mapping
  const ctx = await getBlockContext(db);

  const { rows, total } = await listAuctions(db, params, ctx.currentBlock);

  const [metadataMap, tokenInfoMap] = await Promise.all([
    getMetadataByHashes(db, rows.map((r) => r.metadataHash).filter((h): h is string => h != null)),
    getTokenInfoBatch(env.aleoRpcUrl, [...new Set(rows.map((r) => r.saleTokenId))]),
  ]);

  const items = rows.map((r) =>
    toAuctionListItem(
      r,
      ctx,
      metadataMap.get(r.metadataHash ?? '') ?? null,
      tokenInfoMap.get(r.saleTokenId)       ?? null,
    ),
  );

  return json(c, buildPage(items, total, page, pageSize));
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

  const [metaRow, tokenInfo] = await Promise.all([
    row.metadataHash ? getMetadataByHash(db, row.metadataHash) : Promise.resolve(null),
    getTokenInfo(env.aleoRpcUrl, row.saleTokenId),
  ]);

  return json(c, toAuctionView(row, ctx, metaRow, tokenInfo));
});
