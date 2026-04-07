import { getRegistrySlot } from '../registry';
import type { StepProps } from './types';

export function PricingStep({ form, onChange }: StepProps) {
  const slot = getRegistrySlot(form.auctionType);

  if (!slot) {
    return (
      <p className="text-sm text-muted-foreground">
        Select an auction type in Step 1 first.
      </p>
    );
  }

  const value = form.pricing ?? slot.defaultPricing;
  const { PricingStep: TypePricingStep } = slot;

  return (
    <TypePricingStep
      value={value}
      onChange={(next) => onChange({ pricing: next })}
      supply={form.supply ? BigInt(form.supply) : undefined}
      saleTokenDecimals={form.tokenDecimals}
    />
  );
}
