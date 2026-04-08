/**
 * Collapsible simulator shell — collapsed by default, shown only when auction is Active.
 * Renders the type-specific simulator from the registry.
 */

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { AuctionStatus } from '@fairdrop/types/domain';
import type { AuctionView } from '@fairdrop/types/domain';
import { getRegistrySlot } from '../registry';

interface Props {
  auction: AuctionView;
}

export function AuctionSimulator({ auction }: Props) {
  const [open, setOpen] = useState(false);

  const slot = getRegistrySlot(auction.type);
  if (!slot?.simulatorComponent || auction.status !== AuctionStatus.Active) return null;

  const Simulator = slot.simulatorComponent;

  return (
    <div className="rounded-xl border border-border/60 bg-background/50">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3.5 py-2.5 text-sm font-medium text-foreground/90 transition-colors hover:text-foreground"
      >
        <span>Estimate my allocation</span>
        {open
          ? <ChevronUp  className="size-4 text-muted-foreground" />
          : <ChevronDown className="size-4 text-muted-foreground" />}
      </button>

      {open && (
        <div className="border-t border-border/50 px-3.5 pb-3.5 pt-3">
          <Simulator auction={auction} />
        </div>
      )}
    </div>
  );
}
