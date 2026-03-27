import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  InfoRow,
  AuctionStatusBadge,
} from '@/components';
import { AuctionStatus } from '@fairdrop/types/domain';
import type { AuctionView } from '@fairdrop/types/domain';
import { AUCTION_REGISTRY } from '@/features/auctions/registry';

interface Props {
  auction:     AuctionView;
  blockHeight: number | undefined;
}

function buildTimingLabel(auction: AuctionView, block: number): string {
  switch (auction.status) {
    case AuctionStatus.Upcoming: {
      const left = auction.startBlock - block;
      return `Starts in ~${left.toLocaleString()} blocks (block ${auction.startBlock.toLocaleString()})`;
    }
    case AuctionStatus.Active: {
      const left = auction.endBlock - block;
      return `Ends in ~${left.toLocaleString()} blocks (block ${auction.endBlock.toLocaleString()})`;
    }
    case AuctionStatus.Ended:
    case AuctionStatus.Clearing:
      return `Ended at block ~${auction.endBlock.toLocaleString()} — awaiting finalization`;
    default:
      return auction.endedAtBlock != null
        ? `Finalized at block ${auction.endedAtBlock.toLocaleString()}`
        : `End block: ${auction.endBlock.toLocaleString()}`;
  }
}

export function AuctionOverviewCard({ auction, blockHeight }: Props) {
  const slot   = AUCTION_REGISTRY[auction.type];
  const timing = buildTimingLabel(auction, blockHeight ?? 0);

  return (
    <Card className="border-sky-500/10 bg-gradient-surface shadow-xs ring-1 ring-white/5">
      <CardHeader className="pb-0">
        <CardTitle className="text-sm font-semibold">Overview</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 pt-3">
        <InfoRow
          label="Type"
          value={
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${slot?.color ?? 'bg-muted text-muted-foreground'}`}>
              {slot?.label ?? auction.type}
            </span>
          }
        />
        <InfoRow label="Status" value={<AuctionStatusBadge status={auction.status} showIcon={false} />} />
        <InfoRow label="Timing" value={<span className="text-right text-xs text-muted-foreground">{timing}</span>} />
        {auction.estimatedEnd && (
          <InfoRow
            label="Est. end"
            value={<span className="text-xs text-muted-foreground">{auction.estimatedEnd.toLocaleString()}</span>}
          />
        )}
        <InfoRow
          label="Program"
          value={<span className="max-w-[16rem] truncate font-mono text-xs text-muted-foreground">{auction.programId}</span>}
        />
      </CardContent>
    </Card>
  );
}
