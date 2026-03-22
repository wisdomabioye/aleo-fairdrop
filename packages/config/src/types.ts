export type Network = 'testnet' | 'mainnet';

export interface ProgramEntry {
  programId:      string;
  programAddress: string;  // aleo1... address derived from programId — fill in programs.json
  salt?:          string;  // present for auction programs; absent for utilities
}

export interface Programs {
  dutch:     ProgramEntry;
  sealed:    ProgramEntry;
  raise:     ProgramEntry;
  ascending: ProgramEntry;
  lbp:       ProgramEntry;
  quadratic: ProgramEntry;
  config:    ProgramEntry;
  gate:      ProgramEntry;
  proof:     ProgramEntry;
  ref:       ProgramEntry;
  vest:      ProgramEntry;
}

export interface Accounts {
  protocolTreasury: string;
  feeCollector:     string;
  opsMultisig:      string;
}

export interface FairdropConfig {
  network:     Network;
  rpcUrl:      string;
  explorerUrl: string; // base URL for transaction links: `${explorerUrl}/${txId}`
  programs:    Programs;
  accounts:    Accounts;
}

/** Env vars accepted by defineConfig — callers supply from their own env source. */
export interface ConfigEnv {
  /** 'testnet' | 'mainnet' */
  network: string | undefined;
  /** Aleo node RPC endpoint URL. */
  rpcUrl: string | undefined;
}
