import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { Button, Input, Label, Spinner, Switch } from '@/components';
import { formatMicrocredits, aleoToMicro } from '@fairdrop/sdk/credits';
import { useConfirmedSequentialTx } from '@/shared/hooks/useConfirmedSequentialTx';
import { TX_DEFAULT_FEE } from '@/env';
import type { BidFormProps } from './types';

/** LBP bid: payment amount drives the bonding curve swap. */
export function LbpBidForm({ auction, protocolConfig, onBidSuccess }: BidFormProps) {
  const { connected, executeTransaction } = useWallet();
  const [searchParams] = useSearchParams();

  const [payInput, setPayInput] = useState('');
  const [usePrivate, setUsePrivate] = useState(false);
  const [codeId, setCodeId] = useState(searchParams.get('ref') ?? '');

  const payment = aleoToMicro(payInput) ?? 0n;
  const protocolFee = payment * BigInt(protocolConfig.feeBps) / 10_000n;

  const bidSteps = [
    {
      label: 'Place LBP Bid',
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
      setPayInput('');
      onBidSuccess?.();
    }
  }, [bidDone]);

  const isDisabled = !connected || bidBusy || bidWaiting || !payment;

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Price shifts dynamically with token weight. Earlier participation typically yields better prices.
      </p>

      <div className="space-y-1.5">
        <Label htmlFor="lbp-pay">Amount (ALEO)</Label>
        <Input
          id="lbp-pay"
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
        <Label htmlFor="lbp-ref">Referral code (optional)</Label>
        <Input
          id="lbp-ref"
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
          'Swap'
        )}
      </Button>

      {bidError && <p className="text-xs text-destructive">{bidError.message}</p>}
    </div>
  );
}