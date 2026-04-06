import type { ComponentType } from 'react';
import { AuctionType } from '@fairdrop/types/domain';
import type { BidFormProps }      from './bid-forms/types';
import type { PricePanelProps }   from './price-panels/types';
import type { ProgressPanelProps } from './progress-panels/types';

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

import { DefaultProgressPanel }   from './progress-panels/DefaultProgressPanel';
import { RaiseProgressPanel }     from './progress-panels/RaiseProgressPanel';
import { SealedProgressPanel }    from './progress-panels/SealedProgressPanel';
import { AscendingProgressPanel } from './progress-panels/AscendingProgressPanel';

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
}

export const AUCTION_REGISTRY: Record<AuctionType, AuctionTypeSlot> = {
  [AuctionType.Dutch]: {
    type:          AuctionType.Dutch,
    label:         'Dutch',
    color:         'bg-blue-500/15 text-blue-600 dark:text-blue-400',
    description:   'Price steps down until supply is met — uniform clearing price.',
    BidForm:       DutchBidForm,
    PricePanel:    DutchPricePanel,
    ProgressPanel: DefaultProgressPanel,
  },
  [AuctionType.Sealed]: {
    type:          AuctionType.Sealed,
    label:         'Sealed',
    color:         'bg-purple-500/15 text-purple-600 dark:text-purple-400',
    description:   'Commit-reveal: bids hidden on-chain until reveal window.',
    BidForm:       SealedBidForm,
    PricePanel:    SealedPricePanel,
    ProgressPanel: SealedProgressPanel,
  },
  [AuctionType.Raise]: {
    type:          AuctionType.Raise,
    label:         'Raise',
    color:         'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
    description:   'Fixed-price community raise — pro-rata distribution.',
    BidForm:       RaiseBidForm,
    PricePanel:    RaisePricePanel,
    ProgressPanel: RaiseProgressPanel,
  },
  [AuctionType.Ascending]: {
    type:          AuctionType.Ascending,
    label:         'Ascending',
    color:         'bg-orange-500/15 text-orange-600 dark:text-orange-400',
    description:   'Price rises over time — early bidders pay less.',
    BidForm:       AscendingBidForm,
    PricePanel:    AscendingPricePanel,
    ProgressPanel: AscendingProgressPanel,
  },
  [AuctionType.Lbp]: {
    type:          AuctionType.Lbp,
    label:         'LBP (Not Available)',
    color:         'bg-amber-500/15 text-amber-600 dark:text-amber-400',
    description:   'Liquidity bootstrapping pool — weight-decay price discovery.',
    BidForm:       LbpBidForm,
    PricePanel:    LbpPricePanel,
    ProgressPanel: DefaultProgressPanel,
  },
  [AuctionType.Quadratic]: {
    type:          AuctionType.Quadratic,
    label:         'Quadratic (Not Available)',
    color:         'bg-rose-500/15 text-rose-600 dark:text-rose-400',
    description:   'Square-root weighting — smaller voices count more.',
    BidForm:       QuadraticBidForm,
    PricePanel:    QuadraticPricePanel,
    ProgressPanel: DefaultProgressPanel,
  },
};

/** Null-safe registry lookup. */
export function getRegistrySlot(type: AuctionType): AuctionTypeSlot | null {
  return AUCTION_REGISTRY[type] ?? null;
}
