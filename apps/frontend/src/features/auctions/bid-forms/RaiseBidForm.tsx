import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { Button, Input, Label, Spinner, Switch } from '@/components';
import { formatMicrocredits, aleoToMicro } from '@fairdrop/sdk/credits';
import { useConfirmedSequentialTx } from '@/shared/hooks/useConfirmedSequentialTx';
import { TX_DEFAULT_FEE } from '@/env';
import type { BidFormProps } from './types';

/** Raise bid: payment amount only — allocation is pro-rata at close. */
export function RaiseBidForm({ auction, protocolConfig }: BidFormProps) {
  const { connected, executeTransaction } = useWallet();
  const [searchParams] = useSearchParams();

  const [payInput, setPayInput] = useState('');
  const [usePrivate, setUsePrivate] = useState(false);
  const [codeId, setCodeId] = useState(searchParams.get('ref') ?? '');

  const payment = aleoToMicro(payInput) ?? 0n;
  const protocolFee = payment * BigInt(protocolConfig.feeBps) / 10_000n;

  const bidSteps = useMemo(
    () => [
      {
        label: 'Place raise bid',
        execute: async () => {
          const hasRef = codeId.trim().length > 0;
          const fn = hasRef
            ? (usePrivate ? 'place_bid_private_ref' : 'place_bid_public_ref')
            : (usePrivate ? 'place_bid_private' : 'place_bid_public');

          const inputs: string[] = [
            auction.id,
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
    ],
    [auction.id, auction.programId, codeId, executeTransaction, payment, usePrivate]
  );

  const {
    done: bidDone,
    busy: bidBusy,
    isWaiting: bidWaiting,
    error: bidError,
    advance: placeBid,
  } = useConfirmedSequentialTx(bidSteps);

  useEffect(() => {
    if (bidDone) {
      setPayInput('');
    }
  }, [bidDone]);

  const isDisabled = !connected || bidBusy || bidWaiting || !payment;

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Contribute any amount ≥ minimum. Tokens distributed pro-rata if the raise target is met.
      </p>

      <div className="space-y-1.5">
        <Label htmlFor="raise-pay">Amount (ALEO)</Label>
        <Input
          id="raise-pay"
          inputMode="decimal"
          placeholder="0.0"
          value={payInput}
          onChange={(e) => setPayInput(e.target.value)}
        />
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">Use private credits</span>
        <Switch checked={usePrivate} onCheckedChange={setUsePrivate} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="raise-ref">Referral code (optional)</Label>
        <Input
          id="raise-ref"
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
          'Contribute'
        )}
      </Button>

      {bidError && <p className="text-xs text-destructive">{bidError.message}</p>}
    </div>
  );
}