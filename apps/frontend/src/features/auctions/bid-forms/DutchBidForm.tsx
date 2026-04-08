import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { Input, Label } from '@/components';
import { TX_DEFAULT_FEE } from '@/env';
import { formatMicrocredits } from '@fairdrop/sdk/credits';
import { formatAmount, parseTokenAmount } from '@fairdrop/sdk/format';
import {
  placeBidPublic,
  placeBidPublicRef,
  placeBidPrivate,
  placeBidPrivateRef,
  type BidParams,
} from '@fairdrop/sdk/transactions';
import { AuctionType } from '@fairdrop/types/domain';
import { useConfirmedSequentialTx } from '@/shared/hooks/useConfirmedSequentialTx';
import { useCreditRecords } from '@/shared/hooks/useCreditRecords';
import {
  BidModeToggle,
  CreditRecordSelect,
  ReferralInput,
  BidSummaryPanel,
  BidSubmitButton,
  BidErrorBanner,
  FormBlockerNotice,
} from './_parts';
import type { BidFormProps } from './types';

export function DutchBidForm({ auction, protocolConfig, onBidSuccess }: BidFormProps) {
  const { connected, executeTransaction } = useWallet();
  const [searchParams] = useSearchParams();
  const { creditRecords, loading: creditsLoading } = useCreditRecords();

  const decimals     = auction.saleTokenDecimals;
  const saleScale    = BigInt(auction.saleScale);
  const currentPrice = BigInt(auction.currentPrice ?? 0);
  const minBidAmount = auction.minBidAmount ?? 0n;
  const maxBidAmount = auction.maxBidAmount ?? 0n;

  const [mode,             setMode]             = useState<'private' | 'public'>('private');
  const [qtyInput,         setQtyInput]         = useState('');
  const [qtyTouched,       setQtyTouched]       = useState(false);
  const [selectedRecordId, setSelectedRecordId] = useState('');
  const [recordTouched,    setRecordTouched]    = useState(false);
  const [codeId,           setCodeId]           = useState(searchParams.get('ref') ?? '');
  const [showReferral,     setShowReferral]     = useState(Boolean(searchParams.get('ref')));

  const qtyRaw      = parseTokenAmount(qtyInput, decimals);
  const qtyHuman    = saleScale > 0n ? qtyRaw / saleScale : 0n;
  const payment     = qtyHuman * currentPrice;
  const protocolFee = (payment * BigInt(protocolConfig.feeBps)) / 10_000n;
  const referralCut = codeId.trim()
    ? (protocolFee * BigInt(protocolConfig.referralPoolBps)) / 10_000n
    : 0n;

  const unspentRecords = useMemo(() => creditRecords.filter((r) => !r.spent), [creditRecords]);
  const selectedRecord = unspentRecords.find((r) => r.id === selectedRecordId) ?? null;

  const quantityError = useMemo(() => {
    if (!qtyTouched) return null;
    if (qtyRaw <= 0n) return 'Enter a quantity.';
    if (minBidAmount > 0n && qtyRaw < minBidAmount) return `Minimum ${formatAmount(minBidAmount, decimals)}.`;
    if (maxBidAmount > 0n && qtyRaw > maxBidAmount) return `Maximum ${formatAmount(maxBidAmount, decimals)}.`;
    return null;
  }, [qtyTouched, qtyRaw, minBidAmount, maxBidAmount, decimals]);

  const recordError = useMemo(() => {
    if (mode !== 'private' || !recordTouched) return null;
    if (!selectedRecord) return 'Select a payment source.';
    if (payment > 0n && selectedRecord.microcredits < payment) return 'Selected record does not have enough balance.';
    return null;
  }, [mode, recordTouched, selectedRecord, payment]);

  const formBlocker = useMemo(() => {
    if (!connected) return 'Connect wallet to place a bid.';
    if (currentPrice <= 0n) return 'Current price unavailable.';
    if (quantityError) return quantityError;
    if (mode === 'private') {
      if (!selectedRecord) return 'Select a payment source.';
      if (payment > 0n && selectedRecord.microcredits < payment) return 'Selected record does not have enough balance.';
    }
    return null;
  }, [connected, currentPrice, quantityError, mode, selectedRecord, payment]);

  const bidSteps = [
    {
      label: mode === 'private' ? 'Place Private Dutch Bid' : 'Place Public Dutch Bid',
      execute: async () => {
        const hasRef    = codeId.trim().length > 0;
        const isPrivate = mode === 'private';

        const params: BidParams = { type: AuctionType.Dutch, quantity: qtyRaw, paymentAmount: payment };
        const spec = isPrivate && selectedRecord
          ? hasRef
            ? placeBidPrivateRef(auction, params, selectedRecord._record, codeId.trim(), TX_DEFAULT_FEE)
            : placeBidPrivate(auction, params, selectedRecord._record, TX_DEFAULT_FEE)
          : hasRef
            ? placeBidPublicRef(auction, params, codeId.trim(), TX_DEFAULT_FEE)
            : placeBidPublic(auction, params, TX_DEFAULT_FEE);

        const result = await executeTransaction({ ...spec, inputs: spec.inputs as string[] });
        return result?.transactionId;
      },
    },
  ];

  const {
    done: bidDone, busy: bidBusy, isWaiting: bidWaiting,
    error: bidError, advance: placeBid, reset: resetBid,
  } = useConfirmedSequentialTx(bidSteps);

  useEffect(() => {
    if (!bidDone) return;
    setQtyInput(''); setQtyTouched(false); setRecordTouched(false);
    onBidSuccess?.(); resetBid();
  }, [bidDone]);

  const isDisabled    = !!formBlocker || bidBusy || bidWaiting;
  const showSummary   = qtyRaw > 0n || (mode === 'private' && !!selectedRecord) || !!codeId.trim();
  const showWalletNotice = !connected || currentPrice <= 0n;

  return (
    <div className="space-y-3">
      <BidModeToggle
        mode={mode}
        onChange={(m) => { setMode(m); setRecordTouched(false); if (m === 'public') setSelectedRecordId(''); }}
      />

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
          onChange={(e) => { if (!qtyTouched) setQtyTouched(true); setQtyInput(e.target.value); }}
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
          {quantityError && <span className="text-destructive">{quantityError}</span>}
        </div>
      </div>

      {mode === 'private' && (
        <CreditRecordSelect
          records={unspentRecords}
          loading={creditsLoading}
          value={selectedRecordId}
          onChange={(id) => { if (!recordTouched) setRecordTouched(true); setSelectedRecordId(id); }}
          error={recordError}
        />
      )}

      <ReferralInput
        value={codeId}
        onChange={setCodeId}
        show={showReferral}
        onToggle={() => { setShowReferral((p) => { if (p) setCodeId(''); return !p; }); }}
        inputId="dutch-ref"
      />

      {showSummary && (
        <BidSummaryPanel rows={[
          currentPrice > 0n               && ['Price',          formatMicrocredits(currentPrice)],
          qtyRaw > 0n                     && ['Amount',         formatAmount(qtyRaw, decimals)],
          payment > 0n                    && ['Total',          formatMicrocredits(payment)],
          payment > 0n                    && [`Fee (${protocolConfig.feeBps / 100}%)`, formatMicrocredits(protocolFee)],
          selectedRecord                  && ['Record balance', formatMicrocredits(selectedRecord.microcredits)],
          referralCut > 0n                && ['Referral',       formatMicrocredits(referralCut)],
        ]} />
      )}

      {showWalletNotice && <FormBlockerNotice message={formBlocker} />}

      <BidSubmitButton
        busy={bidBusy}
        waiting={bidWaiting}
        disabled={isDisabled}
        onClick={() => void placeBid()}
        label={`Place ${mode === 'private' ? 'Private' : 'Public'} Bid`}
      />

      <BidErrorBanner error={bidError} />
    </div>
  );
}
