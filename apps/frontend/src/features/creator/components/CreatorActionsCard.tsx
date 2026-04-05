import { useState, useMemo, useEffect } from 'react';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { Ban, Coins, Gavel, HandCoins, Send } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Separator,
  Spinner,
  TokenAmountInput,
} from '@/components';
import { formatMicrocredits } from '@fairdrop/sdk/credits';
import { formatAmount, parseTokenAmount } from '@fairdrop/sdk/format';
import { AuctionStatus } from '@fairdrop/types/domain';
import type { AuctionView } from '@fairdrop/types/domain';
import { useConfirmedSequentialTx } from '@/shared/hooks/useConfirmedSequentialTx';
import { parseExecutionError } from '@/shared/utils/errors';
import type { TxSpec } from '@fairdrop/sdk/transactions';
import { closeAuction, cancelAuction, pushReferralBudget, withdrawPayments, withdrawUnsold } from '@fairdrop/sdk/transactions';

interface Props {
  auction:           AuctionView;
  blockHeight:       number | undefined;
  paymentsWithdrawn: bigint;
  unsoldWithdrawn:   bigint;
  onWithdrawDone:    () => void;
}

export function CreatorActionsCard({
  auction,
  blockHeight,
  paymentsWithdrawn,
  unsoldWithdrawn,
  onWithdrawDone,
}: Props) {
  const { connected, address, executeTransaction } = useWallet();

  const isCreator  = connected && address === auction.creator;
  const block      = blockHeight ?? 0;
  const decimals   = auction.saleTokenDecimals ?? 0;
  const symbol     = auction.saleTokenSymbol ?? '';

  const revenue    = BigInt(auction.creatorRevenue ?? 0) ?? 0n;
  const unsold     = BigInt(auction.supply) - BigInt(auction.totalCommitted);
  const revenueLeft = revenue - BigInt(paymentsWithdrawn);
  const unsoldLeft  = unsold  - BigInt(unsoldWithdrawn);

  const isEnded    = auction.status === AuctionStatus.Ended;
  const isClearing = auction.status === AuctionStatus.Clearing;
  const isCleared  = auction.status === AuctionStatus.Cleared;
  const isVoided   = auction.status === AuctionStatus.Voided;
  const isActive   = auction.status === AuctionStatus.Active;
  const isUpcoming = auction.status === AuctionStatus.Upcoming;

  const canClose          = isEnded || isClearing;
  const canWithdrawPay    = isCreator && isCleared && revenueLeft > 0n;
  const canWithdrawUnsold = isCreator && isCleared && unsoldLeft > 0n;
  const canPushReferral   = isCleared && auction.referralBudget != null && auction.referralBudget > 0n;
  const canCancel         = isCreator && (isUpcoming || isActive);

  // Amount inputs
  const [payStr,   setPayStr]   = useState('');
  const [unsoldStr, setUnsoldStr] = useState('');

  const payAmount    = useMemo(() => parseTokenAmount(payStr,   6),       [payStr]);
  const unsoldAmount = useMemo(() => parseTokenAmount(unsoldStr, decimals), [unsoldStr, decimals]);

  const payError = payStr && (payAmount <= 0n || payAmount > revenueLeft)
    ? payAmount <= 0n ? 'Enter a valid amount.' : `Max ${formatMicrocredits(revenueLeft)}.`
    : null;
  const unsoldError = unsoldStr && (unsoldAmount <= 0n || unsoldAmount > unsoldLeft)
    ? unsoldAmount <= 0n ? 'Enter a valid amount.' : `Max ${formatAmount(unsoldLeft, decimals)} ${symbol}.`
    : null;

  // Sequential tx
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [step, setStep] = useState<{ label: string; execute: () => Promise<string | undefined> } | null>(null);
  const tx = useConfirmedSequentialTx(step ? [step] : []);

  function runAction(key: string, label: string, spec: TxSpec) {
    if (tx.busy || tx.isWaiting) return;
    tx.reset();
    setActiveKey(key);
    setStep({
      label,
      execute: async () => {
        const result = await executeTransaction({ ...spec, inputs: spec.inputs as string[] });
        return result?.transactionId;
      },
    });
  }

  useEffect(() => { if (step) void tx.advance(); }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!tx.done && !tx.error) return;
    if (tx.done && (activeKey === 'withdraw-payments' || activeKey === 'withdraw-unsold')) {
      onWithdrawDone();
    }
    setActiveKey(null);
    setStep(null);
  }, [tx.done, tx.error]); // eslint-disable-line react-hooks/exhaustive-deps

  const anyBusy  = tx.busy || tx.isWaiting;
  const errorMsg = tx.error ? parseExecutionError(tx.error) : null;
  const isBusy   = (key: string) => activeKey === key && anyBusy;

  const noActions = !canClose && !canWithdrawPay && !canWithdrawUnsold && !canPushReferral && !canCancel;

  return (
    <Card className="border-sky-500/10 bg-gradient-surface shadow-xs ring-1 ring-white/5">
      <CardHeader className="pb-0">
        <CardTitle className="text-sm font-semibold">Creator Actions</CardTitle>
      </CardHeader>

      <CardContent className="space-y-4 pt-3">
        {!connected && (
          <p className="rounded-lg border border-border/70 bg-background/70 px-3 py-2 text-xs text-muted-foreground">
            Connect your wallet to execute actions.
          </p>
        )}

        {/* Close */}
        {canClose ? (
          <section className="space-y-2">
            <p className="text-xs font-semibold">Close Auction</p>
            <p className="text-[11px] text-muted-foreground">
              {isClearing
                ? 'Supply target met — close to finalize clearing price and enable claims.'
                : 'Auction period ended — close to settle and enable claims.'}
              {' '}Caller earns {formatMicrocredits(auction.closerReward)}.
            </p>
            <Button size="sm" variant="outline" className="w-full border-sky-500/10 bg-background/60 hover:bg-background/80"
              disabled={!connected || anyBusy}
              onClick={() => runAction('close', 'Close auction', closeAuction(auction))}>
              {isBusy('close') ? <><Spinner className="mr-2 size-3" />Submitting…</> : <><Gavel className="mr-2 size-3.5" />Close Auction</>}
            </Button>
          </section>
        ) : (
          <section className="space-y-1">
            <p className="text-xs font-semibold text-muted-foreground">Close Auction</p>
            <p className="text-[11px] text-muted-foreground">
              {isCleared ? 'Already finalized.'
                : isVoided ? 'Auction was cancelled.'
                : block < auction.endBlock
                  ? `Available after block ${auction.endBlock.toLocaleString()} (current: ${block.toLocaleString()}).`
                  : 'Not yet available.'}
            </p>
          </section>
        )}

        <Separator />

        {/* Withdraw Revenue */}
        {isCreator && (
          canWithdrawPay ? (
            <section className="space-y-2">
              <p className="text-xs font-semibold">Withdraw Revenue</p>
              <TokenAmountInput label="Amount" value={payStr} onChange={setPayStr}
                decimals={6} symbol="ALEO" max={revenueLeft} maxLabel="Max remaining"
                placeholder="0.0" error={payError ?? undefined}
                hint={`Available: ${formatMicrocredits(revenueLeft)}`} />
              <Button size="sm" variant="outline" className="w-full border-sky-500/10 bg-background/60 hover:bg-background/80"
                disabled={!connected || anyBusy || payAmount <= 0n || !!payError}
                onClick={() => runAction('withdraw-payments', 'Withdraw revenue', withdrawPayments(auction, payAmount))}>
                {isBusy('withdraw-payments') ? <><Spinner className="mr-2 size-3" />Submitting…</> : <><HandCoins className="mr-2 size-3.5" />Withdraw Revenue</>}
              </Button>
            </section>
          ) : (
            <section className="space-y-1">
              <p className="text-xs font-semibold text-muted-foreground">Withdraw Revenue</p>
              <p className="text-[11px] text-muted-foreground">
                {isCleared && revenueLeft <= 0n ? 'All revenue already withdrawn.' : 'Available after the auction is cleared.'}
              </p>
            </section>
          )
        )}

        {/* Withdraw Unsold */}
        {isCreator && (
          canWithdrawUnsold ? (
            <section className="space-y-2">
              <p className="text-xs font-semibold">Withdraw Unsold Tokens</p>
              <TokenAmountInput label="Amount" value={unsoldStr} onChange={setUnsoldStr}
                decimals={decimals} symbol={symbol || undefined} max={unsoldLeft} maxLabel="Max remaining"
                placeholder="0" error={unsoldError ?? undefined}
                hint={`Available: ${formatAmount(unsoldLeft, decimals)}${symbol ? ` ${symbol}` : ''}`} />
              <Button size="sm" variant="outline" className="w-full border-sky-500/10 bg-background/60 hover:bg-background/80"
                disabled={!connected || anyBusy || unsoldAmount <= 0n || !!unsoldError}
                onClick={() => runAction('withdraw-unsold', 'Withdraw unsold', withdrawUnsold(auction, unsoldAmount))}>
                {isBusy('withdraw-unsold') ? <><Spinner className="mr-2 size-3" />Submitting…</> : <><Coins className="mr-2 size-3.5" />Withdraw Unsold</>}
              </Button>
            </section>
          ) : (
            <section className="space-y-1">
              <p className="text-xs font-semibold text-muted-foreground">Withdraw Unsold Tokens</p>
              <p className="text-[11px] text-muted-foreground">
                {isCleared && unsoldLeft <= 0n ? 'No unsold tokens remaining.'
                  : unsold <= 0n ? 'All tokens were sold — nothing to withdraw.'
                  : 'Available after the auction is cleared.'}
              </p>
            </section>
          )
        )}

        {/* Push Referral Budget */}
        {canPushReferral && (
          <section className="space-y-2">
            <p className="text-xs font-semibold">Push Referral Budget</p>
            <p className="text-[11px] text-muted-foreground">
              Fund the referral reserve with {formatMicrocredits(auction.referralBudget!)} so referrers can claim commissions.
            </p>
            <Button size="sm" variant="outline" className="w-full border-sky-500/10 bg-background/60 hover:bg-background/80"
              disabled={!connected || anyBusy}
              onClick={() => runAction('push-referral', 'Push referral budget', pushReferralBudget(auction))}>
              {isBusy('push-referral') ? <><Spinner className="mr-2 size-3" />Submitting…</> : <><Send className="mr-2 size-3.5" />Push Referral Budget</>}
            </Button>
          </section>
        )}

        {/* Cancel */}
        {canCancel && (
          <>
            <Separator />
            <section className="space-y-2">
              <p className="text-xs font-semibold text-destructive">Cancel Auction</p>
              <p className="text-[11px] text-muted-foreground">
                Cancels the auction and returns unsold supply to you. Existing bidders can claim refunds. Cannot be undone.
              </p>
              <Button size="sm" variant="destructive" className="w-full" disabled={anyBusy}
                onClick={() => runAction('cancel', 'Cancel auction', cancelAuction(auction))}>
                {isBusy('cancel') ? <><Spinner className="mr-2 size-3" />Submitting…</> : <><Ban className="mr-2 size-3.5" />Cancel Auction</>}
              </Button>
            </section>
          </>
        )}

        {noActions && (
          <p className="text-xs text-muted-foreground">No actions available for the current auction state.</p>
        )}

        {errorMsg && (
          <div className="rounded-lg border border-destructive/15 bg-destructive/5 px-3 py-2 text-xs text-destructive">{errorMsg}</div>
        )}
        {tx.done && !errorMsg && (
          <div className="rounded-lg border border-emerald-500/15 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-600 dark:text-emerald-400">
            Transaction confirmed.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
