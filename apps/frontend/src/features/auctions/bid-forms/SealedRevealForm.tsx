import { useEffect, useState } from 'react';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { Button, Label, Spinner, Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components';
import { formatMicrocredits } from '@fairdrop/sdk/credits';
import { useConfirmedSequentialTx } from '@/shared/hooks/useConfirmedSequentialTx';
import { useCommitmentRecords } from '@/shared/hooks/useCommitmentRecords';
import type { AuctionView } from '@fairdrop/types/domain';
import { TX_DEFAULT_FEE } from '@/env';

interface Props {
  auction:      AuctionView;
  onBidSuccess?: () => void;
}

export function SealedRevealForm({ auction, onBidSuccess }: Props) {
  const { connected, executeTransaction } = useWallet();
  const [selectedCommitId, setSelectedCommitId] = useState('');

  const { commitmentRecords, loading } = useCommitmentRecords(auction.programId);
  const commitments = commitmentRecords.filter((c) => !c.spent && c.auction_id === auction.id);
  const selectedCommit = commitments.find((c) => c.id === selectedCommitId) ?? null;

  const maxBidAmount = auction.maxBidAmount ?? 0n;

  const bidSteps = [{
    label: 'Reveal bid',
    execute: async () => {
      if (!selectedCommit) throw new Error('Select a commitment record.');
      const result = await executeTransaction({
        program: auction.programId, function: 'reveal_bid',
        inputs: [selectedCommit._record, `${selectedCommit.quantity}u128`, selectedCommit.nonce, `${maxBidAmount}u128`] as string[],
        fee: TX_DEFAULT_FEE, privateFee: false,
      });
      return result?.transactionId;
    },
  }];

  const { done: bidDone, busy: bidBusy, isWaiting: bidWaiting, error: bidError, advance: submitBid, reset: resetBid } =
    useConfirmedSequentialTx(bidSteps);

  useEffect(() => {
    if (!bidDone) return;
    setSelectedCommitId('');
    onBidSuccess?.();
    resetBid();
  }, [bidDone]);

  const isDisabled = !connected || bidBusy || bidWaiting;

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-sky-500/20 bg-sky-500/8 px-3 py-2 text-xs text-sky-600 dark:text-sky-400">
        Reveal phase — select your commitment record. Quantity and nonce are read automatically.
      </div>

      <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-[11px] text-destructive space-y-0.5">
        <p className="font-medium">Reveal before block {auction.endBlock.toLocaleString()}</p>
        <p>
          Failure to reveal within this window results in complete forfeiture of your locked collateral.
          There is no recovery path — unrevealed commitments cannot be refunded.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label>Commitment record</Label>
        {commitments.length > 0 ? (
          <Select value={selectedCommitId} onValueChange={setSelectedCommitId}>
            <SelectTrigger className="h-8 w-full text-xs">
              <SelectValue placeholder={loading ? 'Loading…' : 'Select commitment'} />
            </SelectTrigger>
            <SelectContent>
              {commitments.map((c, i) => (
                <SelectItem key={c.id} value={c.id} className="text-xs">
                  {`Bid ${i + 1} · ${formatMicrocredits(c.payment_amount)} locked`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <p className="text-xs text-muted-foreground">
            {loading ? 'Loading commitment records…' : 'No commitment records found in wallet.'}
          </p>
        )}
        {selectedCommit && (
          <p className="text-[11px] text-muted-foreground">
            Qty: {selectedCommit.quantity.toString()} · Locked: {formatMicrocredits(selectedCommit.payment_amount)}
          </p>
        )}
      </div>

      {!connected && (
        <div className="rounded-lg border border-border/70 bg-background/60 px-3 py-2 text-xs text-muted-foreground">
          Connect wallet to reveal your bid.
        </div>
      )}

      <Button type="button" className="w-full" disabled={isDisabled || !selectedCommit} onClick={() => void submitBid()}>
        {bidBusy ? <><Spinner className="mr-2 h-3 w-3" />Authorizing…</> : bidWaiting ? <><Spinner className="mr-2 h-3 w-3" />Confirming…</> : 'Reveal Bid'}
      </Button>

      {bidError && (
        <div className="rounded-lg border border-destructive/15 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {bidError.message}
        </div>
      )}
    </div>
  );
}
