import { Link } from 'react-router-dom';
import { ExternalLink, Lock } from 'lucide-react';
import { Button } from '@/components';
import { formatMicrocredits } from '@fairdrop/sdk/credits';
import { stripVisibility } from '@fairdrop/sdk/parse';
import type { WalletSealedCommitment } from '@fairdrop/types/primitives';
import { auctionDetailUrl } from '@/config';

interface CommitmentRowProps {
  commitment: WalletSealedCommitment;
}

export function CommitmentRow({ commitment }: CommitmentRowProps) {
  const auctionId = stripVisibility(commitment.auction_id);
  const shortId   = auctionId.length > 30 ? `${auctionId.slice(0, 30)}…` : auctionId;

  return (
    <div className={`flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
      commitment.spent
        ? 'border-border/30 bg-background/20 opacity-55'
        : 'border-purple-500/20 bg-purple-500/5 hover:bg-purple-500/8'
    }`}>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/10 px-2 py-0.5 text-[10px] font-medium text-purple-700 dark:text-purple-300">
            <Lock className="size-2.5" />
            Unrevealed
          </span>
          {commitment.spent && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              Spent
            </span>
          )}
        </div>
        <p className="font-mono text-[11px] text-muted-foreground truncate">{shortId}</p>
        <p className="text-xs text-muted-foreground">
          Qty:{' '}
          <span className="font-medium text-foreground">{commitment.quantity.toLocaleString()}</span>
          <span className="mx-1.5 opacity-40">·</span>
          Locked:{' '}
          <span className="font-medium text-foreground">{formatMicrocredits(commitment.payment_amount)}</span>
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
