import { useState, useEffect, useCallback } from 'react';
import { useWallet }           from '@provablehq/aleo-wallet-adaptor-react';
import { Button, Spinner }     from '@/components';
import { formatMicrocredits }  from '@fairdrop/sdk/credits';
import { recField, recU128 }         from '@fairdrop/sdk/parse';
import { computeBidderKey }    from '@fairdrop/sdk/hash';
import { AuctionType }         from '@fairdrop/types/domain';
import type { AuctionView }    from '@fairdrop/types/domain';
import { config }                 from '@/env';
import { slashUnrevealed }        from '@fairdrop/sdk/transactions';
import { parseExecutionError } from '@/shared/utils/errors';
import { 
  ConnectWalletPrompt
} from '@/shared/components/wallet/ConnectWalletPrompt';
import { useTransactionTracker } from '@/providers/transaction-tracker';
import { useBlockHeight }      from '@/shared/hooks/useBlockHeight';
import { auctionsService }     from '@/services/auctions.service';

// ── types ─────────────────────────────────────────────────────────────────────

interface CommitmentRecord {
  raw:           Record<string, unknown>;
  auctionId:     string;
  paymentAmount: bigint;
}

// ── component ─────────────────────────────────────────────────────────────────

export function SlashBidsTab() {
  const { connected, address, requestRecords, executeTransaction } = useWallet();
  const { track }                    = useTransactionTracker();
  const { data: blockHeight = 0 }    = useBlockHeight();

  const [commitments, setCommitments] = useState<CommitmentRecord[]>([]);
  const [auctionMap,  setAuctionMap]  = useState<Record<string, AuctionView>>({});
  const [loading,     setLoading]     = useState(false);
  const [slashing,    setSlashing]    = useState<string | null>(null); // commitment_key
  const [errors,      setErrors]      = useState<Record<string, string>>({});

  const loadData = useCallback(async () => {
    if (!connected) return;
    setLoading(true);
    try {
      const recs = await (requestRecords as (p: string) => Promise<Record<string, unknown>[]>)(
        config.programs.sealed.programId,
      );
      const parsed: CommitmentRecord[] = (recs ?? []).map((rec) => ({
        raw:           rec,
        auctionId:     recField(rec, 'auction_id'),
        paymentAmount: recU128(rec, 'payment_amount'),
      }));
      setCommitments(parsed);

      const uniqueIds = [...new Set(parsed.map((c) => c.auctionId))];
      const details   = await Promise.all(
        uniqueIds.map((id) => auctionsService.get(id).catch(() => null)),
      );
      const map: Record<string, AuctionView> = {};
      details.forEach((d) => { if (d) map[d.id] = d; });
      setAuctionMap(map);
    } catch {
      setCommitments([]);
    } finally {
      setLoading(false);
    }
  }, [connected]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadData(); }, [loadData]);

  const slashable = commitments.filter((c) => {
    const a = auctionMap[c.auctionId];
    return a && a.type === AuctionType.Sealed && blockHeight > a.endBlock;
  });

  async function handleSlash(c: CommitmentRecord) {
    if (!address) return;
    const auction = auctionMap[c.auctionId];
    if (!auction) return;

    const slashBps = auction.params.type === AuctionType.Sealed
      ? parseInt(String(auction.params.slash_reward_bps))
      : 0;

    const commitmentKey = computeBidderKey(address, c.auctionId);
    setErrors((e) => ({ ...e, [commitmentKey]: '' }));
    setSlashing(commitmentKey);

    try {
      const spec = slashUnrevealed(commitmentKey, c.auctionId, c.paymentAmount, slashBps);
      const result = await executeTransaction({ ...spec, inputs: spec.inputs as string[] });
      if (result?.transactionId) track(result.transactionId, 'Slash unrevealed');
    } catch (err) {
      setErrors((e) => ({ ...e, [commitmentKey]: parseExecutionError(err) }));
    } finally {
      setSlashing(null);
    }
  }

  if (!connected) {
    return (
      <ConnectWalletPrompt message="Connect your wallet to see slashable commitments." />
    );
  }

  if (loading) {
    return <div className="flex justify-center py-8"><Spinner className="h-6 w-6" /></div>;
  }

  if (slashable.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        No unrevealed commitments eligible for slashing.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {slashable.map((c) => {
        const auction   = auctionMap[c.auctionId]!;
        const slashBps  = auction.params.type === AuctionType.Sealed
          ? parseInt(String(auction.params.slash_reward_bps))
          : 0;
        const reward    = (c.paymentAmount * BigInt(slashBps)) / 10000n;
        const commitKey = address ? computeBidderKey(address, c.auctionId) : '';
        const isBusy    = slashing === commitKey;

        return (
          <div
            key={`${c.auctionId}-${c.paymentAmount}`}
            className="flex items-center justify-between rounded-md border border-border px-4 py-3 text-sm gap-3"
          >
            <div className="min-w-0 space-y-0.5">
              <p className="font-medium truncate">
                {auction.metadata?.name ?? `${c.auctionId.slice(0, 14)}…`}
              </p>
              <p className="text-xs text-muted-foreground">
                Bid: {formatMicrocredits(c.paymentAmount)} · Reward: {formatMicrocredits(reward)}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <Button
                size="sm"
                variant="outline"
                disabled={!!slashing}
                onClick={() => handleSlash(c)}
              >
                {isBusy
                  ? <><Spinner className="mr-2 h-3 w-3" />Submitting…</>
                  : `Slash & Earn ${formatMicrocredits(reward)}`}
              </Button>
              {commitKey && errors[commitKey] && (
                <p className="text-xs text-destructive">{errors[commitKey]}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
