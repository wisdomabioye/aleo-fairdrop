import { CREDITS_RESERVED_TOKEN_ID } from '@fairdrop/sdk/credits';

/** Minimum token shape required for display in TokenChip, PoolStatsCard, etc. */
export interface TokenDisplay {
  tokenId:  string;
  symbol:   string;
  name:     string;
  decimals: number;
  logoUrl:  string | null;
  verified: boolean;
}

/** Pinned tokens always shown at the top of the token picker. */
export const WELL_KNOWN_TOKENS: TokenDisplay[] = [
  {
    tokenId:  CREDITS_RESERVED_TOKEN_ID,
    symbol:   'ALEO',
    name:     'Aleo Credits',
    decimals: 6,
    logoUrl:  null,
    verified: true,
  },
];
