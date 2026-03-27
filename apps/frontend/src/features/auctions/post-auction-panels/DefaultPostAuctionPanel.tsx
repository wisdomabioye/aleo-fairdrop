import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { Spinner } from '@/components';
import { AuctionStatus } from '@fairdrop/types/domain';
import { ConnectWalletPrompt } from '@/shared/components/wallet/ConnectWalletPrompt';
import { BidClaimRow } from '../../claim/components/BidClaimRow';
import { useAuctionBids } from '../hooks/useAuctionBids';
import type { PostAuctionPanelProps } from './types';

/**
 * Universal post-auction action panel.
 *
 * Status routing:
 *   Ended / Clearing  → waiting message (close_auction not yet called)
 *   Cleared           → scan wallet → claim / claim_vested rows
 *   Voided            → scan wallet → claim_voided / claim_commit_voided rows
 *
 * BidClaimRow.resolveAction handles all the action logic:
 *   - Cleared  + bid         → claim (or claim_vested if vestEnabled)
 *   - Voided   + bid         → claim_voided
 *   - Voided   + commitment  → claim_commit_voided  (sealed only)
 */
export function DefaultPostAuctionPanel({ auction }: PostAuctionPanelProps) {
  const { connected } = useWallet();

  const isSettling =
    auction.status === AuctionStatus.Ended ||
    auction.status === AuctionStatus.Clearing;

  const scannable =
    auction.status === AuctionStatus.Cleared ||
    auction.status === AuctionStatus.Voided;

  const { records, loading } = useAuctionBids(auction.id, auction.programId, scannable);

  // ── Ended / Clearing: no bidder action yet ─────────────────────────────────
  if (isSettling) {
    return (
      <div className="rounded-lg border border-border/70 bg-background/70 px-3 py-2 text-xs text-muted-foreground">
        Auction ended — waiting to be finalized. Claim will be available once closed.
      </div>
    );
  }

  // ── Cleared / Voided: need wallet ──────────────────────────────────────────
  if (!connected) {
    return (
      <ConnectWalletPrompt
        message={
          auction.status === AuctionStatus.Cleared
            ? 'Connect your wallet to claim your tokens.'
            : 'Connect your wallet to claim your refund.'
        }
      />
    );
  }

  if (loading) {
    return <div className="flex justify-center py-4"><Spinner className="h-5 w-5" /></div>;
  }

  if (records.length === 0) {
    return (
      <div className="rounded-lg border border-border/70 bg-background/70 px-3 py-2 text-xs text-muted-foreground">
        {auction.status === AuctionStatus.Cleared
          ? 'No claimable records found in your wallet for this auction.'
          : 'No refundable records found in your wallet for this auction.'}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {records.map((record, i) => (
        <BidClaimRow key={`${record.kind}-${i}`} record={record} auction={auction} />
      ))}
    </div>
  );
}
