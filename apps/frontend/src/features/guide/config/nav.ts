export interface NavItem {
  label:    string;
  path:     string;
  children?: NavItem[];
}

export const GUIDE_NAV: NavItem[] = [
  { label: 'Overview', path: '' },

  {
    label: 'Auction types',
    path:  'auctions',
    children: [
      { label: 'Overview',   path: 'auctions' },
      { label: 'Dutch',      path: 'auctions/dutch' },
      { label: 'Sealed',     path: 'auctions/sealed' },
      { label: 'Raise',      path: 'auctions/raise' },
      { label: 'Ascending',  path: 'auctions/ascending' },
      { label: 'LBP',        path: 'auctions/lbp' },
      { label: 'Quadratic',  path: 'auctions/quadratic' },
    ],
  },

  {
    label: 'Creating an auction',
    path:  'creating',
    children: [
      { label: 'Overview',          path: 'creating' },
      { label: '1 — Type',          path: 'creating/01-type' },
      { label: '2 — Token',         path: 'creating/02-token' },
      { label: '3 — Pricing',       path: 'creating/03-pricing' },
      { label: '4 — Timing',        path: 'creating/04-timing' },
      { label: '5 — Gate & Vest',   path: 'creating/05-gate-vest' },
      { label: '6 — Referral',      path: 'creating/06-referral' },
      { label: '7 — Metadata',      path: 'creating/07-metadata' },
      { label: '8 — Review',        path: 'creating/08-review' },
    ],
  },

  {
    label: 'Placing bids',
    path:  'bidding',
    children: [
      { label: 'Overview',   path: 'bidding' },
      { label: 'Dutch',      path: 'bidding/dutch' },
      { label: 'Sealed',     path: 'bidding/sealed' },
      { label: 'Raise',      path: 'bidding/raise' },
      { label: 'Ascending',  path: 'bidding/ascending' },
      { label: 'LBP',        path: 'bidding/lbp' },
      { label: 'Quadratic',  path: 'bidding/quadratic' },
    ],
  },

  {
    label: 'Claiming',
    path:  'claiming',
    children: [
      { label: 'Overview',         path: 'claiming' },
      { label: 'Claim tokens',     path: 'claiming/claim' },
      { label: 'Sealed — reveal',  path: 'claiming/sealed-reveal' },
      { label: 'Vesting release',  path: 'claiming/vesting' },
    ],
  },

  {
    label: 'Earning',
    path:  'earnings',
    children: [
      { label: 'Overview',   path: 'earnings' },
      { label: 'Close',      path: 'earnings/close' },
      { label: 'Slash',      path: 'earnings/slash' },
      { label: 'Referral',   path: 'earnings/referral' },
    ],
  },
];
