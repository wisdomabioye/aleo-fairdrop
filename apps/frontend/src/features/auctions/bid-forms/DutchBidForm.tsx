import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Eye, Shield } from 'lucide-react';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import {
  Button,
  Input,
  Label,
  Spinner,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components';
import { AppRoutes } from '@/config';
import { TX_DEFAULT_FEE } from '@/env';
import { formatMicrocredits } from '@fairdrop/sdk/credits';
import { formatAmount, parseTokenAmount } from '@fairdrop/sdk/format';
import { useConfirmedSequentialTx } from '@/shared/hooks/useConfirmedSequentialTx';
import { useCreditRecords } from '@/shared/hooks/useCreditRecords';
import { cn } from '@/lib/utils';
import type { BidFormProps } from './types';

export function DutchBidForm({ auction, protocolConfig }: BidFormProps) {
  const { connected, executeTransaction } = useWallet();
  const [searchParams] = useSearchParams();
  const { creditRecords, loading: creditsLoading } = useCreditRecords();

  const decimals = auction.saleTokenDecimals ?? 0;
  const saleScale = BigInt(auction.saleScale);
  const currentPrice = BigInt(auction.currentPrice ?? 0);

  const minBidAmount = auction.minBidAmount ?? 0n;
  const maxBidAmount = auction.maxBidAmount ?? 0n;

  const [mode, setMode] = useState<'private' | 'public'>('private');
  const [qtyInput, setQtyInput] = useState('');
  const [qtyTouched, setQtyTouched] = useState(false);
  const [selectedRecordId, setSelectedRecordId] = useState('');
  const [recordTouched, setRecordTouched] = useState(false);
  const [codeId, setCodeId] = useState(searchParams.get('ref') ?? '');
  const [showReferral, setShowReferral] = useState(Boolean(searchParams.get('ref')));

  const qtyRaw = parseTokenAmount(qtyInput, decimals);
  const qtyHuman = saleScale > 0n ? qtyRaw / saleScale : 0n;
  const payment = qtyHuman * currentPrice;
  const protocolFee = (payment * BigInt(protocolConfig.feeBps)) / 10_000n;
  const referralCut = codeId.trim()
    ? (protocolFee * BigInt(protocolConfig.referralPoolBps)) / 10_000n
    : 0n;

  const unspentRecords = useMemo(
    () => creditRecords.filter((record) => !record.spent),
    [creditRecords]
  );

  const selectedRecord =
    unspentRecords.find((record) => record.id === selectedRecordId) ?? null;

  const quantityError = useMemo(() => {
    if (!qtyTouched) return null;
    if (qtyRaw <= 0n) return 'Enter a quantity.';
    if (minBidAmount > 0n && qtyRaw < minBidAmount) {
      return `Minimum ${formatAmount(minBidAmount, decimals)}.`;
    }
    if (maxBidAmount > 0n && qtyRaw > maxBidAmount) {
      return `Maximum ${formatAmount(maxBidAmount, decimals)}.`;
    }
    return null;
  }, [qtyTouched, qtyRaw, minBidAmount, maxBidAmount, decimals]);

  const recordError = useMemo(() => {
    if (mode !== 'private' || !recordTouched) return null;
    if (!selectedRecord) return 'Select a payment source.';
    if (payment > 0n && selectedRecord.microcredits < payment) {
      return 'Selected record does not have enough balance.';
    }
    return null;
  }, [mode, recordTouched, selectedRecord, payment]);

  const formBlocker = useMemo(() => {
    if (!connected) return 'Connect wallet to place a bid.';
    if (currentPrice <= 0n) return 'Current price unavailable.';
    if (quantityError) return quantityError;
    if (mode === 'private') {
      if (!selectedRecord) return 'Select a payment source.';
      if (payment > 0n && selectedRecord.microcredits < payment) {
        return 'Selected record does not have enough balance.';
      }
    }
    return null;
  }, [connected, currentPrice, quantityError, mode, selectedRecord, payment]);

  const bidSteps = [
    {
      label: mode === 'private' ? 'Place Private Dutch Bid' : 'Place Public Dutch Bid',
      execute: async () => {
        const hasRef = codeId.trim().length > 0;
        const isPrivate = mode === 'private';

        const fn = hasRef
          ? isPrivate
            ? 'place_bid_private_ref'
            : 'place_bid_public_ref'
          : isPrivate
            ? 'place_bid_private'
            : 'place_bid_public';

        const inputs: string[] = [
          ...(isPrivate && selectedRecord ? [selectedRecord._record] : []),
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
    busy: bidBusy,
    isWaiting: bidWaiting,
    error: bidError,
    advance: placeBid,
  } = useConfirmedSequentialTx(bidSteps);

  const isDisabled = !!formBlocker || bidBusy || bidWaiting;
  const showSummary = qtyRaw > 0n || (mode === 'private' && !!selectedRecord) || !!codeId.trim();
  const showWalletNotice = !connected || currentPrice <= 0n;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {(['private', 'public'] as const).map((value) => {
          const active = mode === value;

          return (
            <button
              key={value}
              type="button"
              onClick={() => {
                setMode(value);
                setRecordTouched(false);
                if (value === 'public') setSelectedRecordId('');
              }}
              className={cn(
                'flex h-9 items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-medium transition-colors',
                active
                  ? 'border-sky-500/16 bg-sky-500/10 text-sky-700 dark:text-sky-300'
                  : 'border-border/70 bg-background/50 text-muted-foreground hover:border-sky-500/10 hover:text-foreground'
              )}
            >
              {value === 'private' ? <Shield className="size-3.5" /> : <Eye className="size-3.5" />}
              {value === 'private' ? 'Private' : 'Public'}
            </button>
          );
        })}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="dutch-qty">
          Quantity {auction.saleTokenSymbol ? `(${auction.saleTokenSymbol})` : ''}
        </Label>
        <Input
          id="dutch-qty"
          inputMode="decimal"
          placeholder="0"
          value={qtyInput}
          className="h-8 text-xs"
          onBlur={() => setQtyTouched(true)}
          onChange={(e) => {
            if (!qtyTouched) setQtyTouched(true);
            setQtyInput(e.target.value);
          }}
          aria-invalid={!!quantityError}
        />
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
          {(minBidAmount > 0n || maxBidAmount > 0n) && (
            <span className="text-muted-foreground">
              {minBidAmount > 0n ? `Min ${formatAmount(minBidAmount, decimals)}` : null}
              {minBidAmount > 0n && maxBidAmount > 0n ? ' • ' : null}
              {maxBidAmount > 0n ? `Max ${formatAmount(maxBidAmount, decimals)}` : null}
            </span>
          )}
          {quantityError ? <span className="text-destructive">{quantityError}</span> : null}
        </div>
      </div>

      {mode === 'private' && (
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Payment source</Label>

          {unspentRecords.length > 0 ? (
            <>
              <Select
                value={selectedRecordId || undefined}
                onValueChange={(value) => {
                  if (!recordTouched) setRecordTouched(true);
                  setSelectedRecordId(value);
                }}
              >
                <SelectTrigger className="h-8 w-full text-xs">
                  <SelectValue
                    placeholder={creditsLoading ? 'Loading records…' : 'Select record'}
                  />
                </SelectTrigger>

                <SelectContent>
                  {unspentRecords.map((record, index) => (
                    <SelectItem
                      key={record.id}
                      value={record.id}
                      className="text-xs"
                    >
                      {`Record ${index + 1} • ${formatMicrocredits(record.microcredits)} ALEO`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {recordError ? (
                <p className="text-[11px] text-destructive">{recordError}</p>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  Choose the shielded record used to fund this bid.
                </p>
              )}
            </>
          ) : (
            <div className="rounded-xl border border-border/70 bg-background/50 px-3 py-2.5 text-xs text-muted-foreground">
              {creditsLoading ? (
                'Loading private records…'
              ) : (
                <>
                  No private credits records.{' '}
                  <Link
                    to={AppRoutes.shield}
                    className="font-medium text-foreground underline underline-offset-4"
                  >
                    Shield credits
                  </Link>
                  .
                </>
              )}
            </div>
          )}
        </div>
      )}

      {!showReferral && !codeId ? (
        <button
          type="button"
          onClick={() => setShowReferral(true)}
          className="text-left text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          + Add referral code
        </button>
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor="dutch-ref">Referral code</Label>
          <Input
            id="dutch-ref"
            placeholder="Optional"
            value={codeId}
            className="h-8 text-xs"
            onChange={(e) => setCodeId(e.target.value)}
          />
        </div>
      )}

      {showSummary ? (
        <div className="rounded-xl border border-border/70 bg-background/50 px-3 py-3">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground/80">
            Cost
          </p>

          <div className="space-y-1.5 text-xs">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Price</span>
              <span className="font-medium text-foreground">
                {currentPrice > 0n ? formatMicrocredits(currentPrice) : '—'}
              </span>
            </div>

            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Amount</span>
              <span className="font-medium text-foreground">
                {qtyRaw > 0n ? formatAmount(qtyRaw, decimals) : '—'}
              </span>
            </div>

            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Total</span>
              <span className="font-medium text-foreground">
                {payment > 0n ? formatMicrocredits(payment) : '—'}
              </span>
            </div>

            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Fee</span>
              <span className="font-medium text-foreground">
                {payment > 0n ? formatMicrocredits(protocolFee) : '—'}
              </span>
            </div>

            {mode === 'private' && selectedRecord ? (
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Record balance</span>
                <span className="font-medium text-foreground">
                  {formatMicrocredits(selectedRecord.microcredits)}
                </span>
              </div>
            ) : null}

            {referralCut > 0n ? (
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Referral</span>
                <span className="font-medium text-foreground">
                  {formatMicrocredits(referralCut)}
                </span>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {showWalletNotice ? (
        <div className="rounded-lg border border-border/70 bg-background/60 px-3 py-2 text-xs text-muted-foreground">
          {formBlocker}
        </div>
      ) : null}

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
          `Place ${mode === 'private' ? 'Private' : 'Public'} Bid`
        )}
      </Button>

      {bidError ? (
        <div className="rounded-lg border border-destructive/15 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {bidError.message}
        </div>
      ) : null}
    </div>
  );
}