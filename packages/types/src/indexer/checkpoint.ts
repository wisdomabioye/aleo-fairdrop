/** Indexer synchronisation status. */
export enum SyncStatus {
  /** Indexer is fully caught up to chain tip. */
  Synced   = 'synced',
  /** Indexer is behind chain tip and actively catching up. */
  Syncing  = 'syncing',
  /** Indexer has not yet started or encountered a fatal error. */
  Offline  = 'offline',
}

/** Persisted indexer checkpoint — stored in DB after each processed block. */
export interface IndexerCheckpoint {
  programId:        string;
  lastBlockHeight:  number;
  lastBlockHash:    string;
  lastProcessedAt:  Date;
  status:           SyncStatus;
  /** Blocks behind chain tip. 0 when synced. */
  lag:              number;
}
