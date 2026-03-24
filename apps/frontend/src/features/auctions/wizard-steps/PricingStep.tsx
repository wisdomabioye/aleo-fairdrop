import { AuctionType } from '@fairdrop/types/domain';
import { DutchPricingStep } from '../pricing-steps/DutchPricingStep';
import { SealedPricingStep } from '../pricing-steps/SealedPricingStep';
import { RaisePricingStep } from '../pricing-steps/RaisePricingStep';
import { AscendingPricingStep } from '../pricing-steps/AscendingPricingStep';
import { LbpPricingStep } from '../pricing-steps/LbpPricingStep';
import { QuadraticPricingStep } from '../pricing-steps/QuadraticPricingStep';
import { DEFAULT_PRICING } from './types';
import type { StepProps } from './types';
import type {
  DutchPricingValues,
  SealedPricingValues,
  RaisePricingValues,
  AscendingPricingValues,
  LbpPricingValues,
  QuadraticPricingValues,
} from '../pricing-steps/types';

export function PricingStep({ form, onChange }: StepProps) {
  const { auctionType, pricing } = form;

  if (!auctionType) {
    return (
      <p className="text-sm text-muted-foreground">
        Select an auction type in Step 1 first.
      </p>
    );
  }

  // Initialise pricing defaults when the type just changed and pricing is null
  const value = pricing ?? DEFAULT_PRICING[auctionType];

  function handleChange<T>(next: T) {
    onChange({ pricing: next as typeof pricing });
  }

  const supply = form.supply ? BigInt(form.supply) : undefined;

  switch (auctionType) {
    case AuctionType.Dutch:
      return (
        <DutchPricingStep
          value={value as DutchPricingValues}
          onChange={handleChange}
          supply={supply}
        />
      );
    case AuctionType.Sealed:
      return (
        <SealedPricingStep
          value={value as SealedPricingValues}
          onChange={handleChange}
          supply={supply}
        />
      );
    case AuctionType.Raise:
      return (
        <RaisePricingStep
          value={value as RaisePricingValues}
          onChange={handleChange}
          supply={supply}
        />
      );
    case AuctionType.Ascending:
      return (
        <AscendingPricingStep
          value={value as AscendingPricingValues}
          onChange={handleChange}
          supply={supply}
        />
      );
    case AuctionType.Lbp:
      return (
        <LbpPricingStep
          value={value as LbpPricingValues}
          onChange={handleChange}
          supply={supply}
        />
      );
    case AuctionType.Quadratic:
      return (
        <QuadraticPricingStep
          value={value as QuadraticPricingValues}
          onChange={handleChange}
          supply={supply}
        />
      );
    default:
      return null;
  }
}
