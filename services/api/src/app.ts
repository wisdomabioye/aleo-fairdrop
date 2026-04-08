import { Hono } from 'hono';
import type { Db } from '@fairdrop/database';
import { dbMiddleware }   from './middleware/db.js';
import { corsMiddleware } from './middleware/cors.js';
import { errorHandler }   from './middleware/error.js';
import { auctionsRouter } from './routes/auctions.js';
import { usersRouter }    from './routes/users.js';
import { tokensRouter }   from './routes/tokens.js';
import { metadataRouter } from './routes/metadata.js';
import { indexerRouter }  from './routes/indexer.js';
import { configRouter }   from './routes/config.js';
import { creatorsRouter }   from './routes/creators.js';
import { dashboardRouter }  from './routes/dashboard.js';

type Variables = { db: Db };

export function createApp(db: Db) {
  const app = new Hono<{ Variables: Variables }>();

  // Global middleware
  app.use('*', corsMiddleware());
  app.use('*', dbMiddleware(db));
  app.onError(errorHandler);

  // Health check
  app.get('/health', (c) => c.json({ status: 'ok' }));

  // Routes
  app.route('/auctions', auctionsRouter);
  app.route('/users',    usersRouter);
  app.route('/creators',   creatorsRouter);
  app.route('/dashboard',  dashboardRouter);
  app.route('/tokens',   tokensRouter);
  app.route('/metadata', metadataRouter);
  app.route('/indexer',  indexerRouter);
  app.route('/config',   configRouter);

  return app;
}
