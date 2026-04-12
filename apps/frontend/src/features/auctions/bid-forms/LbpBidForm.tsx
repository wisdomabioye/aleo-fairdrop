import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { Input, Label } from '@/components';
import { TX_DEFAULT_FEE } from '@/env';
import { formatMicrocredits, aleoToMicro } from '@fairdrop/sdk/credits';
import { formatAmount } from '@fairdrop/sdk/format';
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

/** LBP bid: user specifies ALEO to spend; quantity and max price are derived from currentPrice. */
export function LbpBidForm({ auction, protocolConfig, onBidSuccess }: BidFormProps) {
  const { connected, executeTransaction } = useWallet();
  const [searchParams] = useSearchParams();
  const { creditRecords, loading: creditsLoading } = useCreditRecords();

  const decimals     = auction.saleTokenDecimals;
  const saleScale    = BigInt(auction.saleScale);
  const currentPrice = BigInt(auction.currentPrice ?? 0n);

  const [mode,             setMode]             = useState<'private' | 'public'>('public');
  const [payInput,         setPayInput]         = useState('');
  const [selectedRecordId, setSelectedRecordId] = useState('');
  const [recordTouched,    setRecordTouched]    = useState(false);
  const [codeId,           setCodeId]           = useState(searchParams.get('ref') ?? '');
  const [showReferral,     setShowReferral]     = useState(Boolean(searchParams.get('ref')));

  const payment = aleoToMicro(payInput) ?? 0n;

  // Contract: payment_amount * sale_scale >= quantity * computed_price
  // max_bid_price uses 5% slippage ceiling — finalize reverts if price moved above it.
  const quantity    = currentPrice > 0n ? payment * saleScale / currentPrice : 0n;
  const maxBidPrice = currentPrice * 105n / 100n;

  const protocolFee = payment * BigInt(protocolConfig.feeBps) / 10_000n;
  const referralCut = codeId.trim()
    ? (protocolFee * BigInt(protocolConfig.referralPoolBps)) / 10_000n
    : 0n;

  const unspentRecords = useMemo(() => creditRecords.filter((r) => !r.spent), [creditRecords]);
  const selectedRecord = unspentRecords.find((r) => r.id === selectedRecordId) ?? null;

  const recordError = useMemo(() => {
    if (mode !== 'private' || !recordTouched) return null;
    if (!selectedRecord) return 'Select a payment source.';
    if (payment > 0n && selectedRecord.microcredits < payment) return 'Insufficient record balance.';
    return null;
  }, [mode, recordTouched, selectedRecord, payment]);

  const formBlocker = useMemo(() => {
    if (!connected) return 'Connect wallet to place a bid.';
    if (currentPrice <= 0n) return 'Current price unavailable.';
    if (!payment) return 'Enter an amount.';
    if (mode === 'private') {
      if (!selectedRecord) return 'Select a payment source.';
      if (selectedRecord.microcredits < payment) return 'Insufficient record balance.';
    }
    return null;
  }, [connected, currentPrice, payment, mode, selectedRecord]);

  const bidSteps = [
    {
      label: 'Swap',
      execute: async () => {
        const hasRef    = codeId.trim().length > 0;
        const isPrivate = mode === 'private';

        const params: BidParams = { type: AuctionType.Lbp, quantity, paymentAmount: payment, maxBidPrice };
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
    if (bidDone) { setPayInput(''); onBidSuccess?.(); resetBid(); }
  }, [bidDone]);

  return (
    <div className="space-y-3">
      <BidModeToggle
        mode={mode}
        onChange={(m) => { setMode(m); setRecordTouched(false); if (m === 'public') setSelectedRecordId(''); }}
      />

      <div className="space-y-1.5">
        <Label htmlFor="lbp-pay">Amount (ALEO)</Label>
        <Input
          id="lbp-pay"
          inputMode="decimal"
          placeholder="0.0"
          value={payInput}
          className="h-8 text-xs"
          onChange={(e) => setPayInput(e.target.value)}
        />
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
        inputId="lbp-ref"
      />

      <BidSummaryPanel title="Summary" rows={[
        payment > 0n     && ['You pay',            formatMicrocredits(payment)],
        quantity > 0n    && ['Est. tokens out',    formatAmount(quantity, decimals)],
        currentPrice > 0n && ['Max price (5% slip)', formatMicrocredits(maxBidPrice)],
        payment > 0n     && [`Protocol fee (${protocolConfig.feeBps / 100}%)`, `-${formatMicrocredits(protocolFee)}`],
        referralCut > 0n && ['Referral',           formatMicrocredits(referralCut)],
      ]} />

      <FormBlockerNotice message={formBlocker} />

      <BidSubmitButton
        busy={bidBusy}
        waiting={bidWaiting}
        disabled={!!formBlocker || bidBusy || bidWaiting}
        onClick={() => void placeBid()}
        label="Swap"
      />

      <BidErrorBanner error={bidError} />
    </div>
  );
}
