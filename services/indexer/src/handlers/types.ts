import type { Db }            from '@fairdrop/database';
import type { AleoRpcClient } from '../client/rpc.js';
import type { AleoTransition } from '../types/aleo.js';

/** Passed to every transition handler. */
export interface TransitionContext {
  db:          Db;
  rpc:         AleoRpcClient;
  transition:  AleoTransition;
  blockHeight: number;
  timestamp:   Date;
  txId:        string;
}
