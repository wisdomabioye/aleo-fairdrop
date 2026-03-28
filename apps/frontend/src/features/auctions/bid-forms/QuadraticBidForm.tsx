import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { Button, Input, Label, Spinner, Switch } from '@/components';
import { formatMicrocredits } from '@fairdrop/sdk/credits';
import { parseTokenAmount } from '@fairdrop/sdk/format';
import { useConfirmedSequentialTx } from '@/shared/hooks/useConfirmedSequentialTx';
import { TX_DEFAULT_FEE } from '@/env';
import type { BidFormProps } from './types';

/** Quadratic bid: enter vote quantity; payment = qty * currentPrice. */
export function QuadraticBidForm({ auction, protocolConfig, onBidSuccess }: BidFormProps) {
  const { connected, executeTransaction } = useWallet();
  const [searchParams] = useSearchParams();

  const decimals = auction.saleTokenDecimals ?? 0;
  const saleScale = auction.saleScale;
  const currentPrice = auction.currentPrice ?? 0n;

  const [qtyInput, setQtyInput] = useState('');
  const [usePrivate, setUsePrivate] = useState(false);
  const [codeId, setCodeId] = useState(searchParams.get('ref') ?? '');

  const qtyRaw = parseTokenAmount(qtyInput, decimals);
  const qtyHuman = saleScale > 0n ? qtyRaw / saleScale : 0n;
  const payment = qtyHuman * currentPrice;
  const protocolFee = payment * BigInt(protocolConfig.feeBps) / 10_000n;

  const bidSteps = [
    {
      label: 'Cast votes',
      execute: async () => {
        const hasRef = codeId.trim().length > 0;
        const fn = hasRef
          ? (usePrivate ? 'place_bid_private_ref' : 'place_bid_public_ref')
          : (usePrivate ? 'place_bid_private' : 'place_bid_public');

        const inputs: string[] = [
          auction.id,
          `${qtyRaw}u128`,
          `${payment}u64`,
          ...(hasRef ? [codeId.trim()] : []),
        ];

        const result = await executeTransaction({
          program: auction.programId,
          function: fn,
          inputs,
          fee: TX_DEFAULT_FEE,
          privateFee: false,
        });

        return result?.transactionId;
      },
    },
  ];

  const {
    done: bidDone,
    busy: bidBusy,
    isWaiting: bidWaiting,
    error: bidError,
    advance: placeBid,
  } = useConfirmedSequentialTx(bidSteps);

  useEffect(() => {
    if (bidDone) {
      setQtyInput('');
      onBidSuccess?.();
    }
  }, [bidDone]);

  const isDisabled = !connected || bidBusy || bidWaiting || !qtyRaw;

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Each token = 1 vote. Smaller contributions receive proportionally more voting weight.
      </p>

      <div className="space-y-1.5">
        <Label htmlFor="quad-qty">Votes (tokens)</Label>
        <Input
          id="quad-qty"
          inputMode="numeric"
          placeholder="0"
          value={qtyInput}
          onChange={(e) => setQtyInput(e.target.value)}
        />
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">Use private credits</span>
        <Switch checked={usePrivate} onCheckedChange={setUsePrivate} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="quad-ref">Referral code (optional)</Label>
        <Input
          id="quad-ref"
          placeholder="code_id field"
          value={codeId}
          onChange={(e) => setCodeId(e.target.value)}
        />
      </div>

      {payment > 0n && (
        <div className="rounded-md border border-border bg-muted/40 p-3 text-xs space-y-1">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Payment</span>
            <span>{formatMicrocredits(payment)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              Protocol fee ({protocolConfig.feeBps / 100}%)
            </span>
            <span>−{formatMicrocredits(protocolFee)}</span>
          </div>
        </div>
      )}

      <Button
        type="button"
        className="w-full"
        disabled={isDisabled}
        onClick={() => void placeBid()}
      >
        {bidBusy ? (
          <>
            <Spinner className="mr-2 h-3 w-3" />
            Authorizing…
          </>
        ) : bidWaiting ? (
          <>
            <Spinner className="mr-2 h-3 w-3" />
            Confirming…
          </>
        ) : (
          'Cast Votes'
        )}
      </Button>

      {bidError && <p className="text-xs text-destructive">{bidError.message}</p>}
    </div>
  );
}