import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { Button, Input, Label, Switch } from '@fairdrop/ui';
import { formatMicrocredits } from '@fairdrop/sdk/credits';
import { parseTokenAmount } from '@fairdrop/sdk/format';
import { useTransactionStore } from '@/stores/transaction.store';
import { parseExecutionError } from '@/shared/utils/errors';
import type { BidFormProps } from './types';

export function DutchBidForm({ auction, protocolConfig, lagBlocks }: BidFormProps) {
  const { connected, executeTransaction } = useWallet();
  const { setTx } = useTransactionStore();
  const [searchParams] = useSearchParams();

  const decimals      = auction.saleTokenDecimals ?? 0;
  const saleScale     = auction.saleScale;
  const currentPrice  = auction.currentPrice ?? 0n;

  const [qtyInput,   setQtyInput]   = useState('');
  const [usePrivate, setUsePrivate] = useState(false);
  const [codeId,     setCodeId]     = useState(searchParams.get('ref') ?? '');
  const [txError,    setTxError]    = useState<string | null>(null);
  const [loading,    setLoading]    = useState(false);

  const qtyRaw      = parseTokenAmount(qtyInput, decimals);
  const qtyHuman    = saleScale > 0n ? qtyRaw / saleScale : 0n;
  const payment     = qtyHuman * currentPrice;
  const protocolFee = payment * BigInt(protocolConfig.feeBps) / 10_000n;
  const referralCut = codeId.trim()
    ? protocolFee * BigInt(protocolConfig.referralPoolBps) / 10_000n
    : 0n;

  const isDisabled = lagBlocks > 10 || !connected || loading || !qtyRaw || !currentPrice;

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
        `${qtyRaw}u128`,
        `${payment}u64`,
        ...(hasRef ? [`${codeId.trim()}field`] : []),
      ];

      const result = await executeTransaction({
        program:  auction.programId,
        function: fn,
        inputs,
        fee: 0.5,
      });

      if (result?.transactionId) {
        setTx(result.transactionId, 'Place bid');
        setQtyInput('');
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

      {/* Quantity */}
      <div className="space-y-1.5">
        <Label htmlFor="dutch-qty">
          Quantity {auction.saleTokenSymbol ? `(${auction.saleTokenSymbol})` : ''}
        </Label>
        <Input
          id="dutch-qty"
          inputMode="decimal"
          placeholder="0"
          value={qtyInput}
          onChange={(e) => setQtyInput(e.target.value)}
        />
      </div>

      {/* Privacy toggle */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">Use private credits</span>
        <Switch checked={usePrivate} onCheckedChange={setUsePrivate} />
      </div>
      {usePrivate && (
        <p className="text-xs text-muted-foreground">
          Your wallet will use a private credits record. No on-chain payment trace.
        </p>
      )}

      {/* Referral code */}
      <div className="space-y-1.5">
        <Label htmlFor="dutch-ref">Referral code (optional)</Label>
        <Input
          id="dutch-ref"
          placeholder="code_id field"
          value={codeId}
          onChange={(e) => setCodeId(e.target.value)}
        />
      </div>

      {/* Fee breakdown */}
      {payment > 0n && (
        <div className="rounded-md border border-border bg-muted/40 p-3 space-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total payment</span>
            <span>{formatMicrocredits(payment)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Protocol fee ({protocolConfig.feeBps / 100}%)</span>
            <span>−{formatMicrocredits(protocolFee)}</span>
          </div>
          {referralCut > 0n && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Referral portion</span>
              <span>{formatMicrocredits(referralCut)}</span>
            </div>
          )}
        </div>
      )}

      {txError && (
        <p className="text-xs text-destructive">{txError}</p>
      )}

      <Button type="submit" className="w-full" disabled={isDisabled}>
        {loading ? 'Submitting…' : 'Place Bid'}
      </Button>
    </form>
  );
}
