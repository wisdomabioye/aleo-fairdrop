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

  // Gate
  gate: '/gate/:id',

  // Token tools
  tokenLaunch:  '/token-launch',
  tokenManager: '/token-manager',
  shield:       '/shield',

  // Admin
  admin: '/admin',

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

/** Build a concrete gate URL for an auction. */
export function gateUrl(id: string): string {
  return `/gate/${id}`;
}
