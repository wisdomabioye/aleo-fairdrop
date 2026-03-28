import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { Button } from '@/components';
import { formatMicrocredits } from '@fairdrop/sdk/credits';
import { stripVisibility } from '@fairdrop/sdk/parse';
import type { WalletBidRecord } from '@fairdrop/types/primitives';
import { auctionDetailUrl } from '@/config';

interface BidRowProps {
  bid: WalletBidRecord;
}

export function BidRow({ bid }: BidRowProps) {
  const auctionId = stripVisibility(bid.auction_id);
  const shortId   = auctionId.length > 30 ? `${auctionId.slice(0, 30)}…` : auctionId;

  return (
    <div className={`flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
      bid.spent
        ? 'border-border/30 bg-background/20 opacity-55'
        : 'border-border/70 bg-background/50 hover:bg-background/80'
    }`}>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-1.5">
          <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] font-medium text-sky-700 dark:text-sky-300">
            Bid
          </span>
          {bid.spent && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              Spent
            </span>
          )}
        </div>
        <p className="font-mono text-[11px] text-muted-foreground truncate">{shortId}</p>
        <p className="text-xs text-muted-foreground">
          Qty:{' '}
          <span className="font-medium text-foreground">{bid.quantity.toLocaleString()}</span>
          <span className="mx-1.5 opacity-40">·</span>
          Locked:{' '}
          <span className="font-medium text-foreground">{formatMicrocredits(bid.payment_amount)}</span>
        </p>
      </div>

      <Button asChild variant="ghost" size="sm" className="h-7 shrink-0 px-2 text-xs">
        <Link to={auctionDetailUrl(auctionId)}>
          View <ExternalLink className="ml-1 size-3" />
        </Link>
      </Button>
    </div>
  );
}
