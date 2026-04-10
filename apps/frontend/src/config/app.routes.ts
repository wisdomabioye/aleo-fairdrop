/**
 * Centralized route path constants.
 * Import from here — never hardcode paths in components.
 */
export const AppRoutes = {
  // Overview
  dashboard: '/',

  // Auctions
  auctions:       '/auctions',
  auctionDetail:  '/auctions/:id',
  createAuction:  '/auctions/new',

  // Creator
  myAuctions:      '/creator',
  creatorAuction:  '/creator/auctions/:auctionId',

  // Bidder
  myBids: '/bids',
  claim:  '/claim',

  // Earnings & referral
  earnings: '/earnings',
  referral: '/referral',
  vesting:  '/vesting',

  // Token tools
  tokenLaunch:    '/token-launch',
  tokenManager:   '/token-manager',
  tokenSplitJoin: '/token-split-join',
  shield:         '/shield',

  // Creator leaderboard / profiles
  creators:      '/creators',
  creatorDetail: '/creators/:address',

  // Admin
  admin: '/admin',

  // Analytics
  analytics: '/analytics',

  // DEX / Exchange
  dex:          '/dex',
  dexLiquidity: '/dex/liquidity',
  dexPoolNew:   '/dex/pool/new',

  // Guides
  guide: '/guide',
} as const;

export type AppRoute = (typeof AppRoutes)[keyof typeof AppRoutes];

/** Build a concrete auction detail URL from an auction ID. */
export function auctionDetailUrl(id: string): string {
  return `/auctions/${id}`;
}

/** Build a concrete creator auction management URL from an auction ID. */
export function creatorAuctionUrl(id: string): string {
  return `/creator/auctions/${id}`;
}

/** Build a creator profile URL from a wallet address. */
export function creatorUrl(address: string): string {
  return `/creators/${address}`;
}

/** Deep link to swap page with pre-selected pair (used from auction pages, token manager). */
export function dexSwapUrl(tokenInId?: string, tokenOutId?: string): string {
  const params = new URLSearchParams();
  if (tokenInId)  params.set('in',  tokenInId);
  if (tokenOutId) params.set('out', tokenOutId);
  const qs = params.size ? `?${params}` : '';
  return `/dex${qs}`;
}
