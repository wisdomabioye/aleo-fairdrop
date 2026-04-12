import 'dotenv/config'
import { serve }    from '@hono/node-server';
import { createDb } from '@fairdrop/database';
import { env }      from './env.js';
import { createApp } from './app.js';

const db  = createDb(env.databaseUrl);
const app = createApp(db);

console.log(`[api] starting on port ${env.port} — cors: ${Array.isArray(env.corsOrigins) ? env.corsOrigins.join(', ') : env.corsOrigins}`);

serve({ fetch: app.fetch, port: env.port });
