import 'dotenv/config'
import { createDb }                  from '@fairdrop/database';
import { env }                        from './env.js';
import { AleoRpcClient }              from './client/rpc.js';
import { initChain }                  from './lib/chain.js';
import { PollLoop }                   from './core/poll.js';
import { bootstrapProtocolConfig }    from './handlers/config.js';
import { createLogger }               from './logger.js';

const log = createLogger('indexer');

const db  = createDb(env.databaseUrl);
const rpc = new AleoRpcClient(env.aleoRpcUrl);
initChain(rpc);

log.info('starting', { network: env.aleoNetwork, rpc: env.aleoRpcUrl });

await bootstrapProtocolConfig(db, rpc);

const loop = new PollLoop(db, rpc);
await loop.start();
