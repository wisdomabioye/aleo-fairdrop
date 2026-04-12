import type { Db, DbTx }                                from '@fairdrop/database';
import type { AleoRpcClient }                           from '../client/rpc.js';
import type { AleoTransition, FinalizeOperation }       from '../types/aleo.js';

/** Passed to every transition handler. */
export interface TransitionContext {
  /** DbTx when called inside a block transaction; Db when called standalone. */
  db:          Db | DbTx;
  rpc:         AleoRpcClient;
  transition:  AleoTransition;
  blockHeight: number;
  timestamp:   Date;
  txId:        string;
}

/** Resolves an auction_id string from a transition and its finalize ops. Returns null if unresolvable. */
export type AuctionIdExtractor = (
  transition:  AleoTransition,
  finalizeOps: FinalizeOperation[],
) => string | null;

/** Executes business logic for a single auction transition. */
export type TransitionHandlerFn = (ctx: TransitionContext, auctionId: string) => Promise<void>;

/** Auction handler — requires an auction_id to dispatch. */
export interface AuctionHandlerEntry {
  kind:         'auction';
  getAuctionId: AuctionIdExtractor;
  handle:       TransitionHandlerFn;
}

/** Config handler — no entity id needed. */
export interface ConfigHandlerEntry {
  kind:   'config';
  handle: (ctx: TransitionContext) => Promise<void>;
}

export type HandlerEntry = AuctionHandlerEntry | ConfigHandlerEntry;

/** Flat map of transition name → handler entry for one program. Processor dispatches on kind. */
export type ProgramHandlerMap = Record<string, HandlerEntry>;
