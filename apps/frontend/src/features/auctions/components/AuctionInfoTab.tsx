import { ExternalLink } from 'lucide-react';
import { Card, CardContent, InfoRow, CopyField } from '@/components';
import { formatMicrocredits } from '@fairdrop/sdk/credits';
import { AuctionType } from '@fairdrop/types/domain';
import type { AuctionView, ProtocolConfig } from '@fairdrop/types/domain';
import { IPFS_GATEWAY } from '@/env';
import { formatAmount } from '@fairdrop/sdk/format';

interface AuctionInfoTabProps {
  auction:        AuctionView;
  protocolConfig: ProtocolConfig | undefined;
}

export function AuctionInfoTab({ auction, protocolConfig }: AuctionInfoTabProps) {
  return (
    <Card>
      <CardContent className="pt-4 space-y-2">
        <CopyField label="Auction ID" value={auction.id} />

        <div className="divide-y divide-border">
          <InfoRow label="Sale token"   value={auction.saleTokenSymbol ?? auction.saleTokenId} />
          <InfoRow label="Supply"       value={formatAmount(auction.supply, auction.saleTokenDecimals as number)} />
          <InfoRow label="Start block"  value={auction.startBlock.toLocaleString()} />
          <InfoRow label="End block"    value={auction.endBlock.toLocaleString()} />
          {auction.estimatedStart && (
            <InfoRow
              label="Est. start"
              value={auction.estimatedStart.toLocaleString(undefined, {
                dateStyle: 'medium', timeStyle: 'short',
              })}
            />
          )}
          {auction.estimatedEnd && (
            <InfoRow
              label="Est. end"
              value={auction.estimatedEnd.toLocaleString(undefined, {
                dateStyle: 'medium', timeStyle: 'short',
              })}
            />
          )}
          <InfoRow label="Gate"         value={auction.gateMode} />
          <InfoRow
            label="Vesting"
            value={
              auction.vestEnabled
                ? `Yes (cliff ${auction.vestCliffBlocks} blocks, duration ${auction.vestEndBlocks} blocks)`
                : 'No'
            }
          />
          <InfoRow label="Protocol fee" value={`${auction.feeBps / 100}%`} />
          <InfoRow label="Closer reward" value={formatMicrocredits(auction.closerReward)} />

          {auction.type === AuctionType.Sealed && protocolConfig && (
            <InfoRow
              label="Slash reward"
              value={`${protocolConfig.slashRewardBps / 100}% of collateral`}
            />
          )}

          {auction.referralBudget != null && auction.referralBudget > 0n && (
            <InfoRow
              label="Referral budget"
              value={formatMicrocredits(auction.referralBudget)}
            />
          )}

          {auction.metadata?.ipfsCid && (
            <InfoRow
              label="Metadata"
              value={
                <a
                  href={`${IPFS_GATEWAY}/${auction.metadata.ipfsCid}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-primary underline"
                >
                  IPFS <ExternalLink className="size-3" />
                </a>
              }
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
