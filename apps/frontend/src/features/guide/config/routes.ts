// Each key matches a URL segment relative to /guide.
// Values are raw markdown strings imported via Vite's ?raw suffix.
// Populated in GuidePage via a static import map — Vite resolves these at build time.

import overviewMd        from '@guide/00-overview.md?raw';

import auctionsReadme    from '@guide/auctions/README.md?raw';
import dutchMd           from '@guide/auctions/dutch.md?raw';
import sealedMd          from '@guide/auctions/sealed.md?raw';
import raiseMd           from '@guide/auctions/raise.md?raw';
import ascendingMd       from '@guide/auctions/ascending.md?raw';
import lbpMd             from '@guide/auctions/lbp.md?raw';
import quadraticMd       from '@guide/auctions/quadratic.md?raw';

import creatingReadme    from '@guide/creating/README.md?raw';
import creating01        from '@guide/creating/01-type.md?raw';
import creating02        from '@guide/creating/02-token.md?raw';
import creating03        from '@guide/creating/03-pricing.md?raw';
import creating04        from '@guide/creating/04-timing.md?raw';
import creating05        from '@guide/creating/05-gate-vest.md?raw';
import creating06        from '@guide/creating/06-referral.md?raw';
import creating07        from '@guide/creating/07-metadata.md?raw';
import creating08        from '@guide/creating/08-review.md?raw';

import biddingReadme     from '@guide/bidding/README.md?raw';
import biddingDutch      from '@guide/bidding/dutch.md?raw';
import biddingSealed     from '@guide/bidding/sealed.md?raw';
import biddingRaise      from '@guide/bidding/raise.md?raw';
import biddingAscending  from '@guide/bidding/ascending.md?raw';
import biddingLbp        from '@guide/bidding/lbp.md?raw';
import biddingQuadratic  from '@guide/bidding/quadratic.md?raw';

import claimingReadme    from '@guide/claiming/README.md?raw';
import claimingClaim     from '@guide/claiming/claim.md?raw';
import claimingSealed    from '@guide/claiming/sealed-reveal.md?raw';
import claimingVesting   from '@guide/claiming/vesting.md?raw';

import earningsReadme    from '@guide/earnings/README.md?raw';
import earningsClose     from '@guide/earnings/close.md?raw';
import earningsSlash     from '@guide/earnings/slash.md?raw';
import earningsReferral  from '@guide/earnings/referral.md?raw';

export const GUIDE_ROUTES: Record<string, string> = {
  '':                   overviewMd,

  'auctions':           auctionsReadme,
  'auctions/dutch':     dutchMd,
  'auctions/sealed':    sealedMd,
  'auctions/raise':     raiseMd,
  'auctions/ascending': ascendingMd,
  'auctions/lbp':       lbpMd,
  'auctions/quadratic': quadraticMd,

  'creating':              creatingReadme,
  'creating/01-type':      creating01,
  'creating/02-token':     creating02,
  'creating/03-pricing':   creating03,
  'creating/04-timing':    creating04,
  'creating/05-gate-vest': creating05,
  'creating/06-referral':  creating06,
  'creating/07-metadata':  creating07,
  'creating/08-review':    creating08,

  'bidding':            biddingReadme,
  'bidding/dutch':      biddingDutch,
  'bidding/sealed':     biddingSealed,
  'bidding/raise':      biddingRaise,
  'bidding/ascending':  biddingAscending,
  'bidding/lbp':        biddingLbp,
  'bidding/quadratic':  biddingQuadratic,

  'claiming':               claimingReadme,
  'claiming/claim':         claimingClaim,
  'claiming/sealed-reveal': claimingSealed,
  'claiming/vesting':       claimingVesting,

  'earnings':           earningsReadme,
  'earnings/close':     earningsClose,
  'earnings/slash':     earningsSlash,
  'earnings/referral':  earningsReferral,
};
