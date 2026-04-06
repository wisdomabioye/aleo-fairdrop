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
  floorPrice:       string; // ALEO — starting (lowest) price
  ceilingPrice:     string; // ALEO — maximum price cap
  priceRiseBlocks:  string; // integer — blocks per rise step
  priceRiseAmount:  string; // ALEO — price increase per step
  extensionWindow:  string; // integer — blocks before end that trigger extension ('' or '0' = disabled)
  extensionBlocks:  string; // integer — blocks added per qualifying bid
  maxEndBlock:      string; // integer — absolute block height hard cap
}

export interface LbpPricingValues {
  /** Maximum price per token at auction start (supply full, t=0). ALEO units. */
  startPrice: string;
  /** Minimum price per token regardless of supply or time. ALEO units. Must be < startPrice. */
  floorPrice: string;
}

export interface QuadraticPricingValues {
  /** Minimum total credits required for the auction to clear. ALEO units. */
  raiseTarget: string;
}

export interface PricingStepProps<T> {
  value:    T;
  onChange: (next: T) => void;
  /** Raw sale token supply from Step 2 (base units). Used for implied price preview. */
  supply?:           bigint;
  /** Sale token decimals from Step 2. Used to normalise supply for price previews. */
  saleTokenDecimals?: number;
}
