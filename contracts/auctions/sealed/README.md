# fairdrop_sealed.aleo

Sealed-bid auction. Bids are committed privately; the clearing price is determined after the reveal phase ends. Bidders who bid at or above the clearing price win; others are refunded.

Differs from Dutch in that price is discovered bottom-up from revealed bids rather than top-down from a starting price. Suitable when demand is unknown and price discovery matters more than speed.

## Status

Design complete. Implementation pending.
