/** Value shapes for each auction type's pricing step (Step 3 of the create wizard). */

export interface DutchPricingValues {
  startPrice:       string; // ALEO (6 decimals)
  floorPrice:       string; // ALEO
  priceDecayBlocks: string; // integer — blocks per decay step
  priceDecayAmount: string; // ALEO — price drop per step
}

export interface SealedPricingValues extends DutchPricingValues {
  /** Blocks after startBlock when the commit window closes. */
  commitEndBlockOffset: string;
}

export interface RaisePricingValues {
  raiseTarget: string; // ALEO — total credits required for success
}

export interface AscendingPricingValues {
  floorPrice:      string; // ALEO — starting (lowest) price
  ceilingPrice:    string; // ALEO — maximum price cap
  priceRiseBlocks: string; // integer — blocks per rise step
  priceRiseAmount: string; // ALEO — price increase per step
}

export interface LbpPricingValues {
  startWeight:  string; // integer bps (0–10000)
  endWeight:    string; // integer bps
  swapFeeBps:   string; // integer bps
  initialPrice: string; // ALEO
}

export interface QuadraticPricingValues {
  matchingPool:           string; // ALEO — creator's matching fund (0 = none)
  contributionCap:        string; // ALEO — max per bidder (0 = unlimited)
  matchingDeadlineOffset: string; // integer — blocks from startBlock
}

export interface PricingStepProps<T> {
  value:    T;
  onChange: (next: T) => void;
  /** Raw sale token supply from Step 2 (base units). Used for implied price preview. */
  supply?:  bigint;
}
