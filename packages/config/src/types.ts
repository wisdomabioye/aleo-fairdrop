export type Network = 'testnet' | 'mainnet';

export interface ProgramEntry {
  programId:      string;
  programAddress: string | null;  // aleo1... address derived from programId — fill in programs.json
  upgradeKey:     string;  // contract_key in fairdrop_multisig_v1.aleo::approve_upgrade
  salt?:          string;  // present for auction programs; absent for utilities
}

export interface Programs {
  multisig:  ProgramEntry;
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
  fairswap:      ProgramEntry;
}

export interface Accounts {
  defaultAdminAddress: string;
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
