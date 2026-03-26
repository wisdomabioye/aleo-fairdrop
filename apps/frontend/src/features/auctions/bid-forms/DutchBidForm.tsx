import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { Button, Input, Label, Spinner, Switch } from '@/components';
import { formatMicrocredits } from '@fairdrop/sdk/credits';
import { parseTokenAmount } from '@fairdrop/sdk/format';
import { useConfirmedSequentialTx } from '@/shared/hooks/useConfirmedSequentialTx';
import { TX_DEFAULT_FEE } from '@/env';
import type { BidFormProps } from './types';

export function DutchBidForm({ auction, protocolConfig }: BidFormProps) {
  const { connected, executeTransaction } = useWallet();
  const [searchParams] = useSearchParams();

  const decimals      = auction.saleTokenDecimals ?? 0;
  const saleScale     = BigInt(auction.saleScale);
  const currentPrice = BigInt(auction.currentPrice ?? 0)

  const [qtyInput,   setQtyInput]   = useState('');
  const [usePrivate, setUsePrivate] = useState(false);
  const [codeId,     setCodeId]     = useState(searchParams.get('ref') ?? '');

  const qtyRaw      = parseTokenAmount(qtyInput, decimals);
  const qtyHuman    = saleScale > 0n ? qtyRaw / saleScale : 0n;
  const payment     = qtyHuman * currentPrice;
  const protocolFee = payment * BigInt(protocolConfig.feeBps) / 10_000n;
  const referralCut = codeId.trim()
    ? protocolFee * BigInt(protocolConfig.referralPoolBps) / 10_000n
    : 0n;


  const bidSteps = [{
    label: 'Place Dutch Bid',
    execute: async () => {      
      const hasRef = codeId.trim().length > 0;
      const fn = hasRef
        ? (usePrivate ? 'place_bid_private_ref' : 'place_bid_public_ref')
        : (usePrivate ? 'place_bid_private'     : 'place_bid_public');

      const inputs: string[] = [
        auction.id,
        `${qtyRaw}u128`,
        `${payment}u64`,
        ...(hasRef ? [`${codeId.trim()}`] : []),
      ];

      const result = await executeTransaction({
        program:  auction.programId,
        function: fn,
        inputs,
        fee: TX_DEFAULT_FEE,
        privateFee: false
      });

      return result?.transactionId;
    },
  }];

  const { 
    // done: bidDone, 
    busy: bidBusy, 
    isWaiting: bidWaiting,
    error: bidError, 
    advance: placeBid 
  } = useConfirmedSequentialTx(bidSteps);

  const isDisabled = !connected || bidBusy || bidWaiting || !qtyRaw || !currentPrice;

  return (
    <div className="space-y-4">
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

      <Button
        type="button"
        className="w-full"
        disabled={isDisabled}
        onClick={() => void placeBid()}
      >
        {bidBusy
          ? <><Spinner className="mr-2 h-3 w-3" />Authorizing…</>
          : bidWaiting
            ? <><Spinner className="mr-2 h-3 w-3" />Confirming…</>
            : 'Place bid'}
      </Button>
      {bidError && <p className="text-destructive">{bidError.message}</p>}
    </div>
  );
}
