import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { Button, Input, Label, Spinner, Switch } from '@/components';
import { formatMicrocredits, aleoToMicro } from '@fairdrop/sdk/credits';
import { parseTokenAmount } from '@fairdrop/sdk/format';
import { useConfirmedSequentialTx } from '@/shared/hooks/useConfirmedSequentialTx';
import type { BidFormProps } from './types';
import { TX_DEFAULT_FEE } from '@/env';

/**
 * Sealed bid form.
 *
 * COMMIT phase  (blockHeight ≤ params.commit_end_block):
 *   - Enter quantity + a secret nonce
 *   - Payment (collateral) locked; BHP256(qty, nonce, bidder) sent on-chain
 *
 * REVEAL phase  (params.commit_end_block < blockHeight ≤ endBlock):
 *   - Enter the same quantity + nonce used at commit
 *   - Wallet uses the Commitment record (AutoDecrypt) to reveal
 */
export function SealedBidForm({ auction, blockHeight, protocolConfig, onBidSuccess }: BidFormProps) {
  const { connected, executeTransaction } = useWallet();
  const [searchParams] = useSearchParams();

  const saleScale = auction.saleScale;
  const currentPrice = BigInt(auction.currentPrice ?? 0);

  const commitEndBlock = auction.params.type === 'sealed' ? auction.params.commit_end_block : null;
  const isRevealPhase = commitEndBlock != null
    ? blockHeight > commitEndBlock
    : auction.status === 'ended' || auction.status === 'clearing';

  const [qtyInput, setQtyInput] = useState('');
  const [nonce, setNonce] = useState('');
  const [payInput, setPayInput] = useState('');
  const [usePrivate, setUsePrivate] = useState(false);
  const [codeId, setCodeId] = useState(searchParams.get('ref') ?? '');

  const decimals = auction.saleTokenDecimals ?? 0;
  const qtyRaw = parseTokenAmount(qtyInput, decimals);
  const qtyHuman = saleScale > 0n ? qtyRaw / saleScale : 0n;
  const paymentMicro = aleoToMicro(payInput) ?? (qtyHuman * currentPrice);
  const protocolFee = paymentMicro * BigInt(protocolConfig.feeBps) / 10_000n;

  const bidSteps = useMemo(
    () => [
      {
        label: isRevealPhase ? 'Reveal bid' : 'Commit bid',
        execute: async () => {
          if (isRevealPhase) {
            const result = await executeTransaction({
              program: auction.programId,
              function: 'reveal_bid',
              inputs: [
                `${qtyRaw}u128`,
                `${nonce}`,
                `${auction.supply}u128`,
              ],
              fee: TX_DEFAULT_FEE,
              privateFee: false,
            });

            return result?.transactionId;
          }

          const hasRef = codeId.trim().length > 0;
          const fn = hasRef
            ? (usePrivate ? 'commit_bid_private_ref' : 'commit_bid_public_ref')
            : (usePrivate ? 'commit_bid_private' : 'commit_bid_public');

          const result = await executeTransaction({
            program: auction.programId,
            function: fn,
            inputs: [
              auction.id,
              `${qtyRaw}u128`,
              `${nonce}`,
              `${paymentMicro}u64`,
              ...(hasRef ? [codeId.trim()] : []),
            ],
            fee: TX_DEFAULT_FEE,
            privateFee: false,
          });

          return result?.transactionId;
        },
      },
    ],
    [
      auction.id,
      auction.programId,
      auction.supply,
      codeId,
      executeTransaction,
      isRevealPhase,
      nonce,
      paymentMicro,
      qtyRaw,
      usePrivate,
    ]
  );

  const {
    done: bidDone,
    busy: bidBusy,
    isWaiting: bidWaiting,
    error: bidError,
    advance: submitBid,
    reset: resetBid,
  } = useConfirmedSequentialTx(bidSteps);

  useEffect(() => {
    if (!bidDone) return;

    setQtyInput('');
    setPayInput('');
    if (isRevealPhase) setNonce('');
    onBidSuccess?.();
    resetBid();
  }, [bidDone, isRevealPhase]);

  const isDisabled = !connected || bidBusy || bidWaiting;

  if (isRevealPhase) {
    return (
      <div className="space-y-4">
        <p className="rounded-md bg-sky-500/10 px-3 py-2 text-xs text-sky-600 dark:text-sky-400">
          Reveal phase — enter the same quantity and nonce you used when committing.
        </p>

        <div className="space-y-1.5">
          <Label htmlFor="sealed-reveal-qty">Quantity</Label>
          <Input
            id="sealed-reveal-qty"
            inputMode="decimal"
            placeholder="0"
            value={qtyInput}
            onChange={(e) => setQtyInput(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="sealed-reveal-nonce">Nonce (secret)</Label>
          <Input
            id="sealed-reveal-nonce"
            placeholder="field element"
            value={nonce}
            onChange={(e) => setNonce(e.target.value)}
          />
        </div>

        <Button
          type="button"
          className="w-full"
          disabled={isDisabled || !qtyRaw || !nonce}
          onClick={() => void submitBid()}
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
            'Reveal Bid'
          )}
        </Button>

        {bidError && <p className="text-xs text-destructive">{bidError.message}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Commit phase — your quantity and nonce are hidden on-chain. Save your nonce to reveal later.
      </p>

      <div className="space-y-1.5">
        <Label htmlFor="sealed-qty">
          Quantity {auction.saleTokenSymbol ? `(${auction.saleTokenSymbol})` : ''}
        </Label>
        <Input
          id="sealed-qty"
          inputMode="decimal"
          placeholder="0"
          value={qtyInput}
          onChange={(e) => setQtyInput(e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="sealed-nonce">Nonce (secret — save this)</Label>
        <Input
          id="sealed-nonce"
          placeholder="random field element"
          value={nonce}
          onChange={(e) => setNonce(e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="sealed-pay">Collateral (ALEO)</Label>
        <Input
          id="sealed-pay"
          inputMode="decimal"
          placeholder="auto-computed from qty × price"
          value={payInput}
          onChange={(e) => setPayInput(e.target.value)}
        />
        {!payInput && qtyHuman > 0n && currentPrice > 0n && (
          <p className="text-xs text-muted-foreground">
            Suggested: {formatMicrocredits(qtyHuman * currentPrice)}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">Use private credits</span>
        <Switch checked={usePrivate} onCheckedChange={setUsePrivate} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="sealed-ref">Referral code (optional)</Label>
        <Input
          id="sealed-ref"
          placeholder="code_id field"
          value={codeId}
          onChange={(e) => setCodeId(e.target.value)}
        />
      </div>

      {paymentMicro > 0n && (
        <div className="rounded-md border border-border bg-muted/40 p-3 text-xs space-y-1">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Collateral locked</span>
            <span>{formatMicrocredits(paymentMicro)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              Protocol fee est. ({protocolConfig.feeBps / 100}%)
            </span>
            <span>~{formatMicrocredits(protocolFee)}</span>
          </div>
        </div>
      )}

      <Button
        type="button"
        className="w-full"
        disabled={isDisabled || !qtyRaw || !nonce || !paymentMicro}
        onClick={() => void submitBid()}
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
          'Commit Bid'
        )}
      </Button>

      {bidError && <p className="text-xs text-destructive">{bidError.message}</p>}
    </div>
  );
}