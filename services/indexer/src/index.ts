import { createDb }      from '@fairdrop/database';
import { env }            from './env.js';
import { AleoRpcClient }  from './client/rpc.js';
import { PollLoop }       from './core/poll.js';
import { createLogger }   from './logger.js';

const log = createLogger('indexer');

const db  = createDb(env.databaseUrl);
const rpc = new AleoRpcClient(env.aleoRpcUrl);

log.info('starting', { network: env.aleoNetwork, rpc: env.aleoRpcUrl });

const loop = new PollLoop(db, rpc);
await loop.start();
