import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { Input, Label } from '@/components';
import { formatMicrocredits, aleoToMicro } from '@fairdrop/sdk/credits';
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
import { TX_DEFAULT_FEE } from '@/env';
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

export function RaiseBidForm({ auction, protocolConfig, onBidSuccess }: BidFormProps) {
  const { connected, executeTransaction } = useWallet();
  const [searchParams] = useSearchParams();
  const { creditRecords, loading: creditsLoading } = useCreditRecords();

  const minBidAmount = auction.minBidAmount ?? 0n;
  const maxBidAmount = auction.maxBidAmount ?? 0n;
  const remaining    = auction.raiseTarget != null
    ? auction.raiseTarget - BigInt(auction.totalPayments)
    : null;

  const [payInput,         setPayInput]         = useState('');
  const [payTouched,       setPayTouched]       = useState(false);
  const [mode,             setMode]             = useState<'private' | 'public'>('public');
  const [selectedRecordId, setSelectedRecordId] = useState('');
  const [recordTouched,    setRecordTouched]    = useState(false);
  const [codeId,           setCodeId]           = useState(searchParams.get('ref') ?? '');
  const [showReferral,     setShowReferral]     = useState(Boolean(searchParams.get('ref')));

  const parsedPayment = aleoToMicro(payInput);
  const payment       = parsedPayment ?? 0n;
  const protocolFee   = (payment * BigInt(protocolConfig.feeBps)) / 10_000n;
  const referralCut   = codeId.trim()
    ? (protocolFee * BigInt(protocolConfig.referralPoolBps)) / 10_000n
    : 0n;

  const unspentRecords = useMemo(() => creditRecords.filter((r) => !r.spent), [creditRecords]);
  const selectedRecord = unspentRecords.find((r) => r.id === selectedRecordId) ?? null;

  const amountError = useMemo(() => {
    if (!payTouched) return null;
    if (!payInput.trim()) return 'Enter an amount.';
    if (parsedPayment == null || parsedPayment <= 0n) return 'Enter a valid ALEO amount.';
    if (minBidAmount > 0n && parsedPayment < minBidAmount) return `Minimum ${formatMicrocredits(minBidAmount)}.`;
    if (maxBidAmount > 0n && parsedPayment > maxBidAmount) return `Maximum ${formatMicrocredits(maxBidAmount)}.`;
    if (remaining != null && remaining >= 0n && parsedPayment > remaining)
      return `Exceeds remaining capacity (${formatMicrocredits(remaining)}).`;
    return null;
  }, [payTouched, payInput, parsedPayment, minBidAmount, maxBidAmount, remaining]);

  const recordError = useMemo(() => {
    if (mode !== 'private' || !recordTouched) return null;
    if (!selectedRecord) return 'Select a payment source.';
    if (payment > 0n && selectedRecord.microcredits < payment) return 'Selected record does not have enough balance.';
    return null;
  }, [mode, recordTouched, selectedRecord, payment]);

  const formBlocker = useMemo(() => {
    if (!connected) return 'Connect wallet to contribute.';
    if (amountError) return amountError;
    if (mode === 'private') {
      if (!selectedRecord) return 'Select a payment source.';
      if (payment > 0n && selectedRecord.microcredits < payment) return 'Selected record does not have enough balance.';
    }
    return null;
  }, [connected, amountError, mode, selectedRecord, payment]);

  const bidSteps = useMemo(
    () => [{
      label: mode === 'private' ? 'Place Private Raise Bid' : 'Place Public Raise Bid',
      execute: async () => {
        const hasRef     = codeId.trim().length > 0;
        const usePrivate = mode === 'private';

        const params: BidParams = { type: AuctionType.Raise, paymentAmount: payment };
        const spec = usePrivate && selectedRecord
          ? hasRef
            ? placeBidPrivateRef(auction, params, selectedRecord._record, codeId.trim(), TX_DEFAULT_FEE)
            : placeBidPrivate(auction, params, selectedRecord._record, TX_DEFAULT_FEE)
          : hasRef
            ? placeBidPublicRef(auction, params, codeId.trim(), TX_DEFAULT_FEE)
            : placeBidPublic(auction, params, TX_DEFAULT_FEE);

        const result = await executeTransaction({ ...spec, inputs: spec.inputs as string[] });
        return result?.transactionId;
      },
    }],
    [auction, codeId, executeTransaction, mode, payment, selectedRecord],
  );

  const {
    done: bidDone, busy: bidBusy, isWaiting: bidWaiting,
    error: bidError, advance: placeBid, reset: resetBid,
  } = useConfirmedSequentialTx(bidSteps);

  useEffect(() => {
    if (!bidDone) return;
    setPayInput(''); setPayTouched(false); setRecordTouched(false);
    onBidSuccess?.(); resetBid();
  }, [bidDone]);

  const showSummary = payment > 0n || (mode === 'private' && !!selectedRecord) || !!codeId.trim();
  const isDisabled  = !!formBlocker || bidBusy || bidWaiting;

  return (
    <div className="space-y-3">
      <BidModeToggle
        mode={mode}
        onChange={(m) => { setMode(m); setRecordTouched(false); if (m === 'public') setSelectedRecordId(''); }}
      />

      <p className="text-[11px] text-muted-foreground">
        {mode === 'private' ? 'Contribution is submitted privately.' : 'Contribution is submitted publicly.'}
      </p>

      <div className="space-y-1.5">
        <Label htmlFor="raise-pay">Amount (ALEO)</Label>
        <Input
          id="raise-pay"
          inputMode="decimal"
          placeholder="0.0"
          className="h-8 text-xs"
          value={payInput}
          onBlur={() => setPayTouched(true)}
          onChange={(e) => { if (!payTouched) setPayTouched(true); setPayInput(e.target.value); }}
          aria-invalid={!!amountError}
        />
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
          {(minBidAmount > 0n || maxBidAmount > 0n) && (
            <span className="text-muted-foreground">
              {minBidAmount > 0n ? `Min ${formatMicrocredits(minBidAmount)}` : null}
              {minBidAmount > 0n && maxBidAmount > 0n ? ' • ' : null}
              {maxBidAmount > 0n ? `Max ${formatMicrocredits(maxBidAmount)}` : null}
            </span>
          )}
          {remaining != null && remaining >= 0n && (
            <span className="text-muted-foreground">
              Remaining: {formatMicrocredits(remaining)}
            </span>
          )}
          {amountError && <span className="text-destructive">{amountError}</span>}
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
        onToggle={() => setShowReferral((p) => !p)}
        inputId="raise-ref"
      />

      {showSummary && (
        <BidSummaryPanel rows={[
          payment > 0n      && ['Contribution',                               formatMicrocredits(payment)],
          payment > 0n      && [`Protocol fee (${protocolConfig.feeBps / 100}%)`, formatMicrocredits(protocolFee)],
          selectedRecord    && ['Record balance',                             formatMicrocredits(selectedRecord.microcredits)],
          referralCut > 0n  && ['Referral portion',                          formatMicrocredits(referralCut)],
        ]} />
      )}

      {!connected && <FormBlockerNotice message={formBlocker} />}

      <BidSubmitButton
        busy={bidBusy}
        waiting={bidWaiting}
        disabled={isDisabled}
        onClick={() => void placeBid()}
        label={`Contribute ${mode === 'private' ? 'Privately' : 'Publicly'}`}
      />

      <BidErrorBanner error={bidError} />
    </div>
  );
}
