import type { ComponentType } from 'react';
import { AuctionType } from '@fairdrop/types/domain';
import type { AuctionView } from '@fairdrop/types/domain';
import type { BidFormProps }        from './bid-forms/types';
import type { PricePanelProps }     from './price-panels/types';
import type { ProgressPanelProps }  from './progress-panels/types';
import type { PricingStepProps, AnyPricingValues } from './pricing-steps/types';
import type { CreateBase, TxSpec } from '@fairdrop/sdk/transactions';

import { PriceCurveChart }    from './charts/PriceCurveChart';
import { NextPriceDropChip }  from './indicators/NextPriceDropChip';
import { DutchSimulator }     from './simulators/DutchSimulator';
import { SealedSimulator }    from './simulators/SealedSimulator';
import { RaiseSimulator }     from './simulators/RaiseSimulator';
import { LbpSimulator }       from './simulators/LbpSimulator';
import { QuadraticSimulator } from './simulators/QuadraticSimulator';

import { DutchBidForm }     from './bid-forms/DutchBidForm';
import { SealedBidForm }    from './bid-forms/SealedBidForm';
import { RaiseBidForm }     from './bid-forms/RaiseBidForm';
import { AscendingBidForm } from './bid-forms/AscendingBidForm';
import { LbpBidForm }       from './bid-forms/LbpBidForm';
import { QuadraticBidForm } from './bid-forms/QuadraticBidForm';

import { DutchPricePanel }     from './price-panels/DutchPricePanel';
import { SealedPricePanel }    from './price-panels/SealedPricePanel';
import { RaisePricePanel }     from './price-panels/RaisePricePanel';
import { AscendingPricePanel } from './price-panels/AscendingPricePanel';
import { LbpPricePanel }       from './price-panels/LbpPricePanel';
import { QuadraticPricePanel } from './price-panels/QuadraticPricePanel';

import { DefaultProgressPanel }    from './progress-panels/DefaultProgressPanel';
import { RaiseProgressPanel }      from './progress-panels/RaiseProgressPanel';
import { SealedProgressPanel }     from './progress-panels/SealedProgressPanel';
import { AscendingProgressPanel }  from './progress-panels/AscendingProgressPanel';
import { QuadraticProgressPanel }  from './progress-panels/QuadraticProgressPanel';

import {
  DutchPricingStep,
  PricingReviewRows as DutchPricingReviewRows,
  defaultPricing    as dutchDefaultPricing,
  buildWizardInputs as dutchBuildWizardInputs,
} from './pricing-steps/DutchPricingStep';
import {
  SealedPricingStep,
  PricingReviewRows as SealedPricingReviewRows,
  defaultPricing    as sealedDefaultPricing,
  buildWizardInputs as sealedBuildWizardInputs,
} from './pricing-steps/SealedPricingStep';
import {
  RaisePricingStep,
  PricingReviewRows as RaisePricingReviewRows,
  defaultPricing    as raiseDefaultPricing,
  buildWizardInputs as raiseBuildWizardInputs,
} from './pricing-steps/RaisePricingStep';
import {
  AscendingPricingStep,
  PricingReviewRows as AscendingPricingReviewRows,
  defaultPricing    as ascendingDefaultPricing,
  buildWizardInputs as ascendingBuildWizardInputs,
} from './pricing-steps/AscendingPricingStep';
import {
  LbpPricingStep,
  PricingReviewRows as LbpPricingReviewRows,
  defaultPricing    as lbpDefaultPricing,
  buildWizardInputs as lbpBuildWizardInputs,
} from './pricing-steps/LbpPricingStep';
import {
  QuadraticPricingStep,
  PricingReviewRows as QuadraticPricingReviewRows,
  defaultPricing    as quadraticDefaultPricing,
  buildWizardInputs as quadraticBuildWizardInputs,
} from './pricing-steps/QuadraticPricingStep';

export interface AuctionTypeSlot {
  type:          AuctionType;
  label:         string;
  /** Tailwind bg + text color classes for the type badge. */
  color:         string;
  /** One-line mechanism description shown in cards and wizard. */
  description:   string;
  BidForm:       ComponentType<BidFormProps>;
  PricePanel:    ComponentType<PricePanelProps>;
  ProgressPanel: ComponentType<ProgressPanelProps>;
  /** Wizard Step 3 — pricing configuration form for this type. */
  PricingStep:       ComponentType<PricingStepProps<AnyPricingValues>>;
  /** Review step — summarises the pricing config chosen for this type. */
  PricingReviewRows: ComponentType<{ pricing: AnyPricingValues }>;
  /** Default (empty) pricing values shown when this type is first selected. */
  defaultPricing:    AnyPricingValues;
  /**
   * Builds the type-specific `buildCreateAuction` call.
   * Receives the fully-constructed `CreateBase` (all shared fields resolved by the wizard).
   */
  buildWizardInputs: (pricing: AnyPricingValues, base: CreateBase) => TxSpec;

  // ── Analytics & UX surfaces ───────────────────────────────────────────────
  /** Analytics tab — price curve chart, null for types without a price curve. */
  chartComponent:     ComponentType<{ auction: AuctionView }> | null;
  /** Collapsible allocation estimator shown on the detail page. */
  simulatorComponent: ComponentType<{ auction: AuctionView }> | null;
  /** Inline indicator rendered near the bid panel (e.g. next price drop chip). */
  indicatorComponent: ComponentType<{ auction: AuctionView }> | null;

  // ── Capability flags ──────────────────────────────────────────────────────
  /**
   * Participants contribute ALEO credits directly; the bid IS a payment amount
   * rather than a token quantity. True for Raise + Quadratic.
   */
  isContributionType:  boolean;
  /** Auction has a fundraising target amount (Raise + Quadratic). */
  hasRaiseTarget:      boolean;
  /** Supports fill_min_bps partial-fill threshold close (Raise + Quadratic). */
  hasFillThreshold:    boolean;
  /** Can close before end_block when supply is fully met (Dutch, Sealed, Ascending, Raise). */
  supportsEarlyClose:  boolean;
  /** Price changes over time during the auction (Dutch, Sealed, Ascending, LBP). */
  hasPriceCurve:       boolean;
}

export const AUCTION_REGISTRY: Record<AuctionType, AuctionTypeSlot> = {
  [AuctionType.Dutch]: {
    type:                AuctionType.Dutch,
    label:               'Dutch',
    color:               'bg-blue-500/15 text-blue-600 dark:text-blue-400',
    description:         'Price steps down until supply is met — uniform clearing price.',
    BidForm:             DutchBidForm,
    PricePanel:          DutchPricePanel,
    ProgressPanel:       DefaultProgressPanel,
    PricingStep:         DutchPricingStep       as ComponentType<PricingStepProps<AnyPricingValues>>,
    PricingReviewRows:   DutchPricingReviewRows  as ComponentType<{ pricing: AnyPricingValues }>,
    defaultPricing:      dutchDefaultPricing,
    buildWizardInputs:   dutchBuildWizardInputs,
    chartComponent:      PriceCurveChart,
    simulatorComponent:  DutchSimulator,
    indicatorComponent:  NextPriceDropChip,
    isContributionType:  false,
    hasRaiseTarget:      false,
    hasFillThreshold:    false,
    supportsEarlyClose:  true,
    hasPriceCurve:       true,
  },
  [AuctionType.Sealed]: {
    type:                AuctionType.Sealed,
    label:               'Sealed',
    color:               'bg-purple-500/15 text-purple-600 dark:text-purple-400',
    description:         'Commit-reveal: bids hidden on-chain until reveal window.',
    BidForm:             SealedBidForm,
    PricePanel:          SealedPricePanel,
    ProgressPanel:       SealedProgressPanel,
    PricingStep:         SealedPricingStep       as ComponentType<PricingStepProps<AnyPricingValues>>,
    PricingReviewRows:   SealedPricingReviewRows  as ComponentType<{ pricing: AnyPricingValues }>,
    defaultPricing:      sealedDefaultPricing,
    buildWizardInputs:   sealedBuildWizardInputs,
    chartComponent:      null,
    simulatorComponent:  SealedSimulator,
    indicatorComponent:  null,
    isContributionType:  false,
    hasRaiseTarget:      false,
    hasFillThreshold:    false,
    supportsEarlyClose:  true,
    hasPriceCurve:       true,
  },
  [AuctionType.Raise]: {
    type:                AuctionType.Raise,
    label:               'Raise',
    color:               'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
    description:         'Fixed-price community raise — pro-rata distribution.',
    BidForm:             RaiseBidForm,
    PricePanel:          RaisePricePanel,
    ProgressPanel:       RaiseProgressPanel,
    PricingStep:         RaisePricingStep       as ComponentType<PricingStepProps<AnyPricingValues>>,
    PricingReviewRows:   RaisePricingReviewRows  as ComponentType<{ pricing: AnyPricingValues }>,
    defaultPricing:      raiseDefaultPricing,
    buildWizardInputs:   raiseBuildWizardInputs,
    chartComponent:      null,
    simulatorComponent:  RaiseSimulator,
    indicatorComponent:  null,
    isContributionType:  true,
    hasRaiseTarget:      true,
    hasFillThreshold:    true,
    supportsEarlyClose:  true,
    hasPriceCurve:       false,
  },
  [AuctionType.Ascending]: {
    type:                AuctionType.Ascending,
    label:               'Ascending',
    color:               'bg-orange-500/15 text-orange-600 dark:text-orange-400',
    description:         'Price rises over time — early bidders pay less.',
    BidForm:             AscendingBidForm,
    PricePanel:          AscendingPricePanel,
    ProgressPanel:       AscendingProgressPanel,
    PricingStep:         AscendingPricingStep       as ComponentType<PricingStepProps<AnyPricingValues>>,
    PricingReviewRows:   AscendingPricingReviewRows  as ComponentType<{ pricing: AnyPricingValues }>,
    defaultPricing:      ascendingDefaultPricing,
    buildWizardInputs:   ascendingBuildWizardInputs,
    chartComponent:      PriceCurveChart,
    simulatorComponent:  null,
    indicatorComponent:  null,
    isContributionType:  false,
    hasRaiseTarget:      false,
    hasFillThreshold:    false,
    supportsEarlyClose:  true,
    hasPriceCurve:       true,
  },
  [AuctionType.Lbp]: {
    type:                AuctionType.Lbp,
    label:               'LBP',
    color:               'bg-amber-500/15 text-amber-600 dark:text-amber-400',
    description:         'Liquidity bootstrapping pool — weight-decay price discovery.',
    BidForm:             LbpBidForm,
    PricePanel:          LbpPricePanel,
    ProgressPanel:       DefaultProgressPanel,
    PricingStep:         LbpPricingStep       as ComponentType<PricingStepProps<AnyPricingValues>>,
    PricingReviewRows:   LbpPricingReviewRows  as ComponentType<{ pricing: AnyPricingValues }>,
    defaultPricing:      lbpDefaultPricing,
    buildWizardInputs:   lbpBuildWizardInputs,
    chartComponent:      PriceCurveChart,
    simulatorComponent:  LbpSimulator,
    indicatorComponent:  null,
    isContributionType:  false,
    hasRaiseTarget:      false,
    hasFillThreshold:    false,
    supportsEarlyClose:  false,
    hasPriceCurve:       true,
  },
  [AuctionType.Quadratic]: {
    type:                AuctionType.Quadratic,
    label:               'Quadratic',
    color:               'bg-rose-500/15 text-rose-600 dark:text-rose-400',
    description:         'Square-root weighting — smaller voices count more.',
    BidForm:             QuadraticBidForm,
    PricePanel:          QuadraticPricePanel,
    ProgressPanel:       QuadraticProgressPanel,
    PricingStep:         QuadraticPricingStep       as ComponentType<PricingStepProps<AnyPricingValues>>,
    PricingReviewRows:   QuadraticPricingReviewRows  as ComponentType<{ pricing: AnyPricingValues }>,
    defaultPricing:      quadraticDefaultPricing,
    buildWizardInputs:   quadraticBuildWizardInputs,
    chartComponent:      null,
    simulatorComponent:  QuadraticSimulator,
    indicatorComponent:  null,
    isContributionType:  true,
    hasRaiseTarget:      true,
    hasFillThreshold:    true,
    supportsEarlyClose:  false,
    hasPriceCurve:       false,
  },
};

/** Null-safe registry lookup. Returns null for unknown or absent types. */
export function getRegistrySlot(type: AuctionType | null | undefined): AuctionTypeSlot | null {
  if (type == null) return null;
  return AUCTION_REGISTRY[type] ?? null;
}
