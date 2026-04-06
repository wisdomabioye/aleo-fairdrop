import { Hono }          from 'hono';
import { issuerAddress } from '../signing.js';

export const keysRouter = new Hono();

keysRouter.get('/', (c) => c.json({ address: issuerAddress() }));
