import { createDb }     from '@fairdrop/database';
import { env }           from './env.js';
import { AleoRpcClient } from './client/rpc.js';
import { PollLoop }      from './core/poll.js';

const db  = createDb(env.databaseUrl);
const rpc = new AleoRpcClient(env.aleoRpcUrl);

console.log(`[indexer] starting — network: ${env.aleoNetwork}, rpc: ${env.aleoRpcUrl}`);

const loop = new PollLoop(db, rpc);
await loop.start();
