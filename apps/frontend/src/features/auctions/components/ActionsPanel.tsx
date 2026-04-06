import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import {
  AlertTriangle,
  ArrowRight,
  Gavel,
  Send,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, Button } from '@/components';
import { formatMicrocredits } from '@fairdrop/sdk/credits';
import { AuctionStatus, AuctionType } from '@fairdrop/types/domain';
import type { AuctionView } from '@fairdrop/types/domain';
import { AppRoutes } from '@/config';
import { closeAuction, pushReferralBudget } from '@fairdrop/sdk/transactions';
import { useConfirmedSequentialTx, type SequentialStep } from '@/shared/hooks/useConfirmedSequentialTx';
import { parseExecutionError } from '@/shared/utils/errors';
import { cn } from '@/lib/utils';
import type { TxSpec } from '@fairdrop/sdk/transactions';

interface ActionsPanelProps {
  auction: AuctionView;
  blockHeight: number | undefined;
}

type ActionItem = {
  key: string;
  label: string;
  pendingLabel: string;
  description?: string;
  icon: LucideIcon;
  variant?: 'outline' | 'destructive';
  onClick: () => void;
};

function ActionButton({
  item,
  disabled,
  loading,
}: {
  item: ActionItem;
  disabled: boolean;
  loading: boolean;
}) {
  const Icon = item.icon;

  return (
    <Button
      className={cn(
        'h-auto w-full justify-start rounded-xl px-3 py-2 text-left whitespace-normal',
        item.variant !== 'destructive' && 'border-sky-500/10 bg-background/60 hover:bg-background/80'
      )}
      variant={item.variant ?? 'outline'}
      size="sm"
      disabled={disabled || loading}
      onClick={item.onClick}
    >
      <span className="flex w-full min-w-0 items-start gap-2.5">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg border border-current/10 bg-current/5">
          <Icon className="size-3.5" />
        </span>

        <span className="min-w-0 flex-1 whitespace-normal">
          <span className="block whitespace-normal text-sm font-medium break-words">
            {loading ? item.pendingLabel : item.label}
          </span>
          {item.description ? (
            <span className="mt-0.5 block whitespace-normal break-words text-xs leading-5 font-normal text-muted-foreground">
              {item.description}
            </span>
          ) : null}
        </span>

        <ArrowRight className="mt-1 size-3.5 shrink-0 opacity-60" />
      </span>
    </Button>
  );
}

export function ActionsPanel({ auction, blockHeight }: ActionsPanelProps) {
  const { connected, address, executeTransaction } = useWallet();

  const [activeKey,   setActiveKey]   = useState<string | null>(null);
  const [pendingStep, setPendingStep] = useState<SequentialStep | null>(null);

  const tx = useConfirmedSequentialTx(pendingStep ? [pendingStep] : []);

  // Trigger advance() after pendingStep state + stepsRef are both updated (post-render)
  useEffect(() => {
    if (pendingStep) tx.advance();
  }, [pendingStep]); // eslint-disable-line react-hooks/exhaustive-deps

  // Release the active button once the action settles (confirmed or failed)
  useEffect(() => {
    if (tx.done || tx.error) setActiveKey(null);
  }, [tx.done, tx.error]);

  const isCreator = connected && address === auction.creator;
  const liveEndBlock = auction.type === AuctionType.Ascending
    ? (auction.effectiveEndBlock ?? auction.endBlock)
    : auction.endBlock;
  const pastEnd   = blockHeight != null && blockHeight > liveEndBlock;

  const canClose =
    auction.status === AuctionStatus.Ended || auction.status === AuctionStatus.Clearing;
  
  const canSlash =
    auction.type === AuctionType.Sealed && pastEnd && auction.status === AuctionStatus.Ended;

  const canPushReferral =
    auction.status === AuctionStatus.Cleared &&
    auction.referralBudget != null &&
    auction.referralBudget > 0n;

  if (!canClose && !canSlash && !canPushReferral) return null;

  function runAction(key: string, label: string, spec: TxSpec) {
    if (tx.busy || tx.isWaiting) return;
    tx.reset();
    setActiveKey(key);
    setPendingStep({
      label,
      execute: async () => {
        const result = await executeTransaction({ ...spec, inputs: spec.inputs as string[] });
        return result?.transactionId;
      },
    });
  }

  const anyBusy  = tx.busy || tx.isWaiting;
  const errorMsg = tx.error ? parseExecutionError(tx.error) : null;

  const actions: ActionItem[] = [];

  if (canClose) {
    const label = isCreator ? 'Close Auction' : 'Claim Closer Reward';
    actions.push({
      key:          'close',
      label:        isCreator
        ? 'Close Auction'
        : `Claim Reward · ${formatMicrocredits(auction.closerReward)}`,
      pendingLabel: 'Submitting…',
      description:  isCreator
        ? 'Finalize this auction and progress settlement.'
        : 'Close the auction and receive the closer reward.',
      icon:    Gavel,
      onClick: () => runAction('close', label, closeAuction(auction)),
    });
  }

  if (canPushReferral) {
    actions.push({
      key:          'push-referral',
      label:        'Push Referral Budget',
      pendingLabel: 'Submitting…',
      description:  'Move referral budget into the distribution flow.',
      icon:    Send,
      onClick: () => runAction('push-referral', 'Push referral budget', pushReferralBudget(auction)),
    });
  }

  return (
    <Card className="border-sky-500/10 bg-gradient-surface shadow-xs ring-1 ring-white/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Actions</CardTitle>
      </CardHeader>

      <CardContent className="space-y-2.5">
        {!connected ? (
          <div className="flex items-start gap-2 rounded-lg border border-border/70 bg-background/70 px-3 py-2 text-xs text-muted-foreground">
            <Wallet className="mt-0.5 size-3.5 shrink-0" />
            <p>Connect a wallet to execute available auction actions.</p>
          </div>
        ) : null}

        <div className="space-y-2">
          {actions.map((item) => (
            <ActionButton
              key={item.key}
              item={item}
              disabled={!connected || anyBusy}
              loading={activeKey === item.key && anyBusy}
            />
          ))}
        </div>

        {canSlash ? (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/12 bg-amber-500/6 px-3 py-2 text-xs text-muted-foreground">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
            <p>
              Slash unrevealed bids is available from the{' '}
              <Link to={AppRoutes.earnings} className="underline underline-offset-4">
                Earnings
              </Link>{' '}
              page.
            </p>
          </div>
        ) : null}

        {errorMsg ? (
          <div className="rounded-lg border border-destructive/15 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {errorMsg}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
