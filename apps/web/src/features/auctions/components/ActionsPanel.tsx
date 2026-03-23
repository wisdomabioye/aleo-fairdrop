import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { Card, CardContent, CardHeader, CardTitle, Button } from '@fairdrop/ui';
import { formatMicrocredits } from '@fairdrop/sdk/credits';
import { AuctionStatus, AuctionType } from '@fairdrop/types/domain';
import type { AuctionView } from '@fairdrop/types/domain';
import { routes } from '@/config';
import { useTransactionStore } from '@/stores/transaction.store';
import { parseExecutionError } from '@/shared/utils/errors';

interface ActionsPanelProps {
  auction:     AuctionView;
  blockHeight: number | undefined;
}

export function ActionsPanel({ auction, blockHeight }: ActionsPanelProps) {
  const { connected, address, executeTransaction } = useWallet();
  const { setTx } = useTransactionStore();
  const [actionError, setActionError] = useState<string | null>(null);
  const [loading,     setLoading]     = useState<string | null>(null);

  const isCreator = connected && address === auction.creator;
  const pastEnd   = blockHeight != null && blockHeight > auction.endBlock;

  const canClose =
    auction.status === AuctionStatus.Ended || auction.status === AuctionStatus.Clearing;
  const canCancel =
    isCreator &&
    (auction.status === AuctionStatus.Upcoming || auction.status === AuctionStatus.Active);
  const canSlash =
    auction.type === AuctionType.Sealed && pastEnd && auction.status === AuctionStatus.Ended;
  const canWithdraw =
    isCreator &&
    auction.status === AuctionStatus.Cleared &&
    auction.creatorRevenue != null &&
    auction.creatorRevenue > 0n;
  const canPushReferral =
    auction.status === AuctionStatus.Cleared &&
    auction.referralBudget != null &&
    auction.referralBudget > 0n;

  if (!canClose && !canCancel && !canSlash && !canWithdraw && !canPushReferral) return null;

  async function runAction(label: string, fn: string, inputs: string[], fee = 0.5) {
    setActionError(null);
    setLoading(label);
    try {
      const result = await executeTransaction({
        program: auction.programId,
        function: fn,
        inputs,
        fee,
      });
      if (result?.transactionId) setTx(result.transactionId, label);
    } catch (err) {
      setActionError(parseExecutionError(err));
    } finally {
      setLoading(null);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold">Actions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {canClose && (
          <Button
            className="w-full"
            variant="outline"
            size="sm"
            disabled={!connected || !!loading}
            onClick={() =>
              runAction(
                isCreator ? 'Close auction' : 'Claim closer reward',
                'close_auction',
                [auction.id],
              )
            }
          >
            {loading === 'Close auction' || loading === 'Claim closer reward'
              ? 'Submitting…'
              : isCreator
                ? 'Close Auction'
                : `Claim Closer Reward: ${formatMicrocredits(auction.closerReward)}`}
          </Button>
        )}

        {canWithdraw && (
          <>
            <Button
              className="w-full"
              variant="outline"
              size="sm"
              disabled={!connected || !!loading}
              onClick={() => runAction('Withdraw revenue', 'withdraw_revenue', [auction.id])}
            >
              {loading === 'Withdraw revenue' ? 'Submitting…' : 'Withdraw Revenue'}
            </Button>
            <Button
              className="w-full"
              variant="outline"
              size="sm"
              disabled={!connected || !!loading}
              onClick={() => runAction('Withdraw unsold', 'withdraw_unsold', [auction.id])}
            >
              {loading === 'Withdraw unsold' ? 'Submitting…' : 'Withdraw Unsold'}
            </Button>
          </>
        )}

        {canPushReferral && (
          <Button
            className="w-full"
            variant="outline"
            size="sm"
            disabled={!connected || !!loading}
            onClick={() => runAction('Push referral budget', 'push_referral_budget', [auction.id])}
          >
            {loading === 'Push referral budget' ? 'Submitting…' : 'Push Referral Budget'}
          </Button>
        )}

        {canCancel && (
          <Button
            className="w-full"
            variant="destructive"
            size="sm"
            disabled={!connected || !!loading}
            onClick={() => runAction('Cancel auction', 'cancel_auction', [auction.id])}
          >
            {loading === 'Cancel auction' ? 'Submitting…' : 'Cancel Auction'}
          </Button>
        )}

        {canSlash && (
          <p className="text-xs text-muted-foreground">
            Slash unrevealed bids is available from the{' '}
            <Link to={routes.earnings} className="underline">
              Earnings
            </Link>{' '}
            page.
          </p>
        )}

        {actionError && <p className="text-xs text-destructive">{actionError}</p>}
      </CardContent>
    </Card>
  );
}
