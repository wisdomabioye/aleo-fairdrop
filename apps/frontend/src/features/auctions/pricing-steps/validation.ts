import { parseTokenAmount } from '@fairdrop/sdk/format';
import { AuctionType } from '@fairdrop/types/domain';
import type {
  DutchPricingValues,
  SealedPricingValues,
  RaisePricingValues,
  AscendingPricingValues,
  LbpPricingValues,
  QuadraticPricingValues,
} from './types';
import type { AnyPricingValues } from '../wizard-steps/types';

export function isPricingComplete(type: AuctionType, pricing: AnyPricingValues): boolean {
  switch (type) {
    case AuctionType.Dutch: {
      const p = pricing as DutchPricingValues;
      const start = parseTokenAmount(p.startPrice, 6);
      const floor = parseTokenAmount(p.floorPrice, 6);
      const decay = parseTokenAmount(p.priceDecayAmount, 6);
      return start > 0n && floor > 0n && floor < start && decay > 0n && parseInt(p.priceDecayBlocks) > 0;
    }
    case AuctionType.Sealed: {
      const p = pricing as SealedPricingValues;
      const start = parseTokenAmount(p.startPrice, 6);
      const floor = parseTokenAmount(p.floorPrice, 6);
      const decay = parseTokenAmount(p.priceDecayAmount, 6);
      return (
        start > 0n && floor > 0n && floor < start && decay > 0n &&
        parseInt(p.priceDecayBlocks) > 0 && parseInt(p.commitEndBlockOffset) > 0
      );
    }
    case AuctionType.Raise:
      return parseTokenAmount((pricing as RaisePricingValues).raiseTarget, 6) > 0n;
    case AuctionType.Ascending: {
      const p = pricing as AscendingPricingValues;
      const floor   = parseTokenAmount(p.floorPrice, 6);
      const ceiling = parseTokenAmount(p.ceilingPrice, 6);
      const rise    = parseTokenAmount(p.priceRiseAmount, 6);
      return floor > 0n && ceiling > floor && rise > 0n && parseInt(p.priceRiseBlocks) > 0;
    }
    case AuctionType.Lbp: {
      const p = pricing as LbpPricingValues;
      return parseInt(p.startWeight) > 0 && parseInt(p.endWeight) > 0 && parseTokenAmount(p.initialPrice, 6) > 0n;
    }
    case AuctionType.Quadratic:
      return parseInt((pricing as QuadraticPricingValues).matchingDeadlineOffset) > 0;
    default:
      return false;
  }
}
