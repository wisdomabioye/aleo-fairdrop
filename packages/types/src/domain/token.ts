/**
 * Domain-level token types.
 * Derived from token_registry.aleo on-chain data + optional off-chain metadata.
 */

/** On-chain token registration data from token_registry.aleo/TokenMetadata. */
export interface TokenInfo {
  tokenId:      string;  // field as hex string
  name:         string;  // UTF-8 decoded from u128
  symbol:       string;  // UTF-8 decoded from u128
  decimals:     number;
  totalSupply:  bigint;
  maxSupply:    bigint;
  admin:        string;  // address
  externalAuthorizationRequired: boolean;
}

/**
 * Extended token info including optional off-chain enrichment
 * (logo, description, website) from the metadata service.
 */
export interface TokenMetadata extends TokenInfo {
  logoUrl:     string | null;
  description: string | null;
  website:     string | null;
  tags:        string[];
  verified:    boolean;  // verified by Fairdrop team
}

/** Token balance entry for a wallet (public registry balance). */
export interface TokenBalance {
  tokenId: string;
  symbol:  string;
  amount:  bigint;
  decimals: number;
}

/**
 * Token role assignment from token_registry.aleo/roles mapping.
 * Key: BHP256(TokenOwner{account, token_id}).
 */
export interface TokenRole {
  account:  string;
  tokenId:  string;
  role:     number;  // 1=Minter, 2=Burner, 3=SupplyManager, etc.
}

/** Known role constants from token_registry.aleo. */
export const TOKEN_ROLE = {
  Minter:        1,
  Burner:        2,
  SupplyManager: 3,
} as const;

export type TokenRoleValue = typeof TOKEN_ROLE[keyof typeof TOKEN_ROLE];
