# fairdrop_ref_v3.aleo

Referral system. Auction creators can allocate a referral budget (`referral_budget`) at auction creation. Referrers earn a commission (in BPS) on each bid placed with their code.

Referral codes are scoped per auction and owned by an address. `credit_commission` is called after `close_auction` to distribute earned commissions from the referral reserve. Codes are non-transferable and expire with the auction.

The referral budget is part of the total creator revenue split — it does not add cost to bidders.
