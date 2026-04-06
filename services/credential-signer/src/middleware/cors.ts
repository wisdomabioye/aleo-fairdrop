import { cors } from 'hono/cors';
import { env }  from '../env.js';

export function corsMiddleware() {
  return cors({
    origin:        env.corsOrigin,
    allowMethods:  ['GET', 'POST', 'OPTIONS'],
    allowHeaders:  ['Content-Type'],
    exposeHeaders: [],
    maxAge:        600,
    credentials:   false,
  });
}
