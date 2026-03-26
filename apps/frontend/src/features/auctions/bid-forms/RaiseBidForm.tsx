import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { Button, Input, Label, Switch } from '@/components';
import { formatMicrocredits, aleoToMicro } from '@fairdrop/sdk/credits';
import { useTransactionStore } from '@/stores/transaction.store';
import { parseExecutionError } from '@/shared/utils/errors';
import { TX_DEFAULT_FEE } from '@/env';
import type { BidFormProps } from './types';

/** Raise bid: payment amount only — allocation is pro-rata at close. */
export function RaiseBidForm({ auction, protocolConfig, lagBlocks }: BidFormProps) {
  const { connected, executeTransaction } = useWallet();
  const { setTx } = useTransactionStore();
  const [searchParams] = useSearchParams();

  const [payInput,   setPayInput]   = useState('');
  const [usePrivate, setUsePrivate] = useState(false);
  const [codeId,     setCodeId]     = useState(searchParams.get('ref') ?? '');
  const [txError,    setTxError]    = useState<string | null>(null);
  const [loading,    setLoading]    = useState(false);

  const payment     = aleoToMicro(payInput) ?? 0n;
  const protocolFee = payment * BigInt(protocolConfig.feeBps) / 10_000n;

  const isDisabled = lagBlocks > 10 || !connected || loading || !payment;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isDisabled) return;
    setTxError(null);
    setLoading(true);
    try {
      const hasRef = codeId.trim().length > 0;
      const fn = hasRef
        ? (usePrivate ? 'place_bid_private_ref' : 'place_bid_public_ref')
        : (usePrivate ? 'place_bid_private'     : 'place_bid_public');

      const inputs: string[] = [
        auction.id,
        `${payment}u64`,
        ...(hasRef ? [`${codeId.trim()}`] : []),
      ];

      const result = await executeTransaction({
        program: auction.programId, 
        function: fn, 
        inputs, 
        fee: TX_DEFAULT_FEE,
        privateFee: false
      });
      if (result?.transactionId) {
        setTx(result.transactionId, 'Place bid');
        setPayInput('');
      }
    } catch (err) {
      setTxError(parseExecutionError(err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {lagBlocks > 10 && (
        <p className="rounded-md bg-yellow-500/10 px-3 py-2 text-xs text-yellow-600 dark:text-yellow-400">
          Indexer is {lagBlocks} blocks behind — bidding is temporarily disabled.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Contribute any amount ≥ minimum. Tokens distributed pro-rata if the raise target is met.
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="raise-pay">Amount (ALEO)</Label>
        <Input id="raise-pay" inputMode="decimal" placeholder="0.0"
          value={payInput} onChange={(e) => setPayInput(e.target.value)} />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">Use private credits</span>
        <Switch checked={usePrivate} onCheckedChange={setUsePrivate} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="raise-ref">Referral code (optional)</Label>
        <Input id="raise-ref" placeholder="code_id field"
          value={codeId} onChange={(e) => setCodeId(e.target.value)} />
      </div>
      {payment > 0n && (
        <div className="rounded-md border border-border bg-muted/40 p-3 text-xs space-y-1">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Payment</span>
            <span>{formatMicrocredits(payment)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Protocol fee ({protocolConfig.feeBps / 100}%)</span>
            <span>−{formatMicrocredits(protocolFee)}</span>
          </div>
        </div>
      )}
      {txError && <p className="text-xs text-destructive">{txError}</p>}
      <Button type="submit" className="w-full" disabled={isDisabled}>
        {loading ? 'Submitting…' : 'Contribute'}
      </Button>
    </form>
  );
}
