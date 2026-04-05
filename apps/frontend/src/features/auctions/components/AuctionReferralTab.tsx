import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Gift } from 'lucide-react';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { Button, Spinner, Card, CardContent, CardHeader, CardTitle, CopyField } from '@/components';
import { Badge } from '@/components/ui/badge';
import { formatMicrocredits } from '@fairdrop/sdk/credits';
import { AuctionStatus } from '@fairdrop/types/domain';
import type { AuctionView } from '@fairdrop/types/domain';
import { AppRoutes } from '@/config';
import { createReferralCode } from '@fairdrop/sdk/transactions';
import { useMyReferralCode } from '@/shared/hooks/useMyReferralCode';
import { useProtocolConfig } from '@/shared/hooks/useProtocolConfig';
import { useConfirmedSequentialTx } from '@/shared/hooks/useConfirmedSequentialTx';
import { parseExecutionError } from '@/shared/utils/errors';

interface AuctionReferralTabProps {
  auction: AuctionView;
}

export function AuctionReferralTab({ auction }: AuctionReferralTabProps) {
  const { connected, executeTransaction } = useWallet();
  const { data: pc } = useProtocolConfig();
  const { codeId, checking, refetch: refetchCode } = useMyReferralCode(auction.id);

  // referralBudget is null until cleared — use protocol maxReferralBps to determine eligibility
  const hasReferralProgram  = (pc?.maxReferralBps ?? 0) > 0;
  const isEarlyEnough =
    auction.status === AuctionStatus.Upcoming || auction.status === AuctionStatus.Active;
  const canCreate = isEarlyEnough && hasReferralProgram;

  const shareUrl    = `${window.location.origin}/auctions/${auction.id}`;
  const referralUrl = codeId ? `${shareUrl}?ref=${codeId}` : null;

  // Commission rate the referrer will receive (protocol max)
  const commissionPct = pc ? `${(pc.maxReferralBps / 100).toFixed(2)}%` : null;

  // After clearing, show the actual paid-out budget if available
  const clearedBudget =
    auction.referralBudget != null && auction.referralBudget > 0n
      ? formatMicrocredits(auction.referralBudget)
      : null;

  const badgeLabel = clearedBudget
    ?? (commissionPct ? `up to ${commissionPct} commission` : null);

  const description = canCreate
    ? 'Earn a commission on every bid placed through your referral link.'
    : !hasReferralProgram
    ? 'No referral program configured for this auction.'
    : clearedBudget
    ? `${clearedBudget} referral pool distributed. Check Earnings to claim commissions.`
    : 'Referral codes can only be created before the auction ends.';

  const tx = useConfirmedSequentialTx([{
    label: 'Create referral code',
    execute: async () => {
      if (!pc) throw new Error('Protocol config not loaded');
      const spec = createReferralCode(auction.id, pc.maxReferralBps);
      const result = await executeTransaction({ ...spec, inputs: spec.inputs as string[] });
      return result?.transactionId;
    },
  }]);

  // Poll for the new ReferralCode record after the tx confirms.
  // The wallet may need a few seconds to index the record, so we retry with back-off.
  useEffect(() => {
    if (!tx.done) return;
    let cancelled = false;
    const poll = async () => {
      for (const delay of [2000, 4000, 6000, 8000]) {
        await new Promise((r) => setTimeout(r, delay));
        if (cancelled) return;
        await refetchCode();
        if (cancelled) return;
      }
    };
    void poll();
    return () => { cancelled = true; };
  }, [tx.done]); // eslint-disable-line react-hooks/exhaustive-deps

  const busy     = tx.busy || tx.isWaiting;
  const errorMsg = tx.error ? parseExecutionError(tx.error) : '';

  return (
    <Card className="border-sky-500/10 bg-gradient-surface shadow-xs ring-1 ring-white/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Referral</CardTitle>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* ── Referral code ─────────────────────────────────────────────────── */}
        <div className="rounded-xl border border-sky-500/10 bg-background/60 px-3 py-2.5">
          <div className="flex items-start gap-2.5">
            <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-sky-500/12 bg-sky-500/8 text-sky-600 dark:text-sky-300">
              <Gift className="size-4" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-foreground">Referral commission</p>
                {badgeLabel ? (
                  <Badge
                    variant="outline"
                    className="h-5 rounded-full border-sky-500/14 bg-sky-500/8 px-1.5 text-[10px] font-medium text-sky-700 dark:text-sky-300"
                  >
                    {badgeLabel}
                  </Badge>
                ) : null}
              </div>

              <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>

              {!connected ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Connect your wallet to create a referral code.
                </p>
              ) : checking ? (
                <div className="mt-2"><Spinner className="h-3 w-3" /></div>
              ) : referralUrl ? (
                <div className="mt-2 space-y-2">
                  <CopyField label="Your referral link" value={referralUrl} truncate={false} />
                  <Link
                    to={AppRoutes.referral}
                    className="inline-flex items-center gap-1 text-xs font-medium text-foreground transition-colors hover:text-primary"
                  >
                    Manage commissions
                    <ArrowRight className="size-3.5" />
                  </Link>
                </div>
              ) : tx.done ? (
                <div className="mt-2 flex items-center gap-2">
                  <Spinner className="h-3 w-3" />
                  <span className="text-xs text-muted-foreground">Fetching your referral link…</span>
                </div>
              ) : canCreate ? (
                <div className="mt-2 space-y-1.5">
                  {errorMsg ? <p className="text-xs text-destructive">{errorMsg}</p> : null}
                  <Button size="sm" disabled={busy || !pc} onClick={() => tx.advance()}>
                    {busy ? (
                      <><Spinner className="mr-2 h-3 w-3" />{tx.isWaiting ? 'Confirming…' : 'Creating…'}</>
                    ) : (
                      'Create Referral Link'
                    )}
                  </Button>
                </div>
              ) : (
                <Link
                  to={AppRoutes.referral}
                  className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-foreground transition-colors hover:text-primary"
                >
                  View referral page
                  <ArrowRight className="size-3.5" />
                </Link>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
