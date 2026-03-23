import type { AuctionType } from '@fairdrop/types/domain';
import type {
  DutchPricingValues, SealedPricingValues, RaisePricingValues,
  AscendingPricingValues, LbpPricingValues, QuadraticPricingValues,
} from '../pricing-steps/types';

export type AnyPricingValues =
  | DutchPricingValues
  | SealedPricingValues
  | RaisePricingValues
  | AscendingPricingValues
  | LbpPricingValues
  | QuadraticPricingValues;

export interface WizardForm {
  // Step 1
  auctionType: AuctionType | null;

  // Step 2 — token record + metadata from registry
  tokenRecord:   Record<string, unknown> | null; // opaque wallet record
  saleTokenId:   string;  // e.g. "1234...field"
  supply:        string;  // u128 decimal string from record.amount
  saleScale:     string;  // u128 decimal string (10^decimals)
  tokenSymbol:   string;
  tokenDecimals: number;

  // Step 3 — pricing (type-specific)
  pricing: AnyPricingValues | null;

  // Step 4 — timing
  startBlock:   string; // integer block number
  endBlock:     string;
  minBidAmount: string; // ALEO human units (0 = no minimum)
  maxBidAmount: string; // ALEO human units (0 = no cap)

  // Step 5 — gate & vesting
  gateMode:        0 | 1 | 2; // 0=open 1=merkle 2=credential
  merkleRoot:      string;    // field hex — used when gateMode=1
  issuerAddress:   string;    // aleo1... — used when gateMode=2
  vestEnabled:     boolean;
  vestCliffBlocks: string;    // integer
  vestEndBlocks:   string;

  // Step 6 — referral (display-only, no user input)

  // Step 7 — metadata
  metadataName:        string;
  metadataDescription: string;
  metadataWebsite:     string;
  metadataTwitter:     string;
  metadataDiscord:     string;
  metadataLogoIpfs:    string; // CID set after logo upload
  metadataHash:        string; // BHP256 field hex set after POST /metadata
  metadataIpfsCid:     string; // full metadata CID
}

export const DEFAULT_FORM: WizardForm = {
  auctionType:         null,
  tokenRecord:         null,
  saleTokenId:         '',
  supply:              '',
  saleScale:           '1000000',
  tokenSymbol:         '',
  tokenDecimals:       6,
  pricing:             null,
  startBlock:          '',
  endBlock:            '',
  minBidAmount:        '0',
  maxBidAmount:        '0',
  gateMode:            0,
  merkleRoot:          '0field',
  issuerAddress:       '',
  vestEnabled:         false,
  vestCliffBlocks:     '0',
  vestEndBlocks:       '0',
  metadataName:        '',
  metadataDescription: '',
  metadataWebsite:     '',
  metadataTwitter:     '',
  metadataDiscord:     '',
  metadataLogoIpfs:    '',
  metadataHash:        '0field',
  metadataIpfsCid:     '',
};

/** Default pricing values per auction type — used when switching types. */
export const DEFAULT_PRICING: Record<AuctionType, AnyPricingValues> = {
  dutch:     { startPrice: '', floorPrice: '', priceDecayBlocks: '100', priceDecayAmount: '' },
  sealed:    { startPrice: '', floorPrice: '', priceDecayBlocks: '100', priceDecayAmount: '', commitEndBlockOffset: '' },
  raise:     { raiseTarget: '' },
  ascending: { floorPrice: '', ceilingPrice: '', priceRiseBlocks: '100', priceRiseAmount: '' },
  lbp:       { startWeight: '9000', endWeight: '1000', swapFeeBps: '30', initialPrice: '' },
  quadratic: { matchingPool: '0', contributionCap: '0', matchingDeadlineOffset: '' },
} as Record<AuctionType, AnyPricingValues>;

export interface StepProps {
  form:     WizardForm;
  onChange: (updates: Partial<WizardForm>) => void;
}
