import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Db } from '@fairdrop/database';
import { listBidsByAuction } from '../queries/bids.js';
import { getAuction } from '../queries/auctions.js';
import { toBidView } from '../mappers/bid.js';
import { parsePagination, buildPage } from '../lib/pagination.js';
import { json } from '../lib/respond.js';

type Variables = { db: Db };

export const bidsRouter = new Hono<{ Variables: Variables }>();

// GET /auctions/:id/bids
bidsRouter.get('/:id/bids', async (c) => {
  const db        = c.get('db');
  const auctionId = c.req.param('id');
  const q         = c.req.query();

  const auction = await getAuction(db, auctionId);
  if (!auction) throw new HTTPException(404, { message: `Auction ${auctionId} not found` });

  const pag             = parsePagination({ page: q.page, pageSize: q.pageSize });
  const { rows, total } = await listBidsByAuction(db, auctionId, pag);
  const items           = rows.map((r) => toBidView(r, auction));

  return json(c, buildPage(items, total, pag.page, pag.pageSize));
});
