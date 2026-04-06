import { Hono }                    from 'hono';
import { corsMiddleware }          from './middleware/cors.js';
import { errorHandler }            from './middleware/error.js';
import { keysRouter }              from './routes/keys.js';
import { buildCredentialsRouter }  from './routes/credentials.js';
import type { CheckFn }            from './check/types.js';

export function createApp(checkFn: CheckFn) {
  const app = new Hono();

  app.use('*', corsMiddleware());
  app.onError(errorHandler);

  app.get('/health', (c) => c.json({ status: 'ok' }));
  app.route('/public-key',   keysRouter);
  app.route('/credentials',  buildCredentialsRouter(checkFn));

  return app;
}
