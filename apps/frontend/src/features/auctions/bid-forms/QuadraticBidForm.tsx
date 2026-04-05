import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { Input, Label } from '@/components';
import { TX_DEFAULT_FEE } from '@/env';
import { formatMicrocredits } from '@fairdrop/sdk/credits';
import { parseTokenAmount } from '@fairdrop/sdk/format';
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

/** Quadratic bid: enter vote quantity; payment = qty * currentPrice. No quantity in transition. */
export function QuadraticBidForm({ auction, protocolConfig, onBidSuccess }: BidFormProps) {
  const { connected, executeTransaction } = useWallet();
  const [searchParams] = useSearchParams();
  const { creditRecords, loading: creditsLoading } = useCreditRecords();

  const decimals     = auction.saleTokenDecimals ?? 0;
  const saleScale    = auction.saleScale;
  const currentPrice = auction.currentPrice ?? 0n;

  const [mode,             setMode]             = useState<'private' | 'public'>('public');
  const [qtyInput,         setQtyInput]         = useState('');
  const [selectedRecordId, setSelectedRecordId] = useState('');
  const [recordTouched,    setRecordTouched]    = useState(false);
  const [codeId,           setCodeId]           = useState(searchParams.get('ref') ?? '');
  const [showReferral,     setShowReferral]     = useState(Boolean(searchParams.get('ref')));

  const qtyRaw      = parseTokenAmount(qtyInput, decimals);
  const qtyHuman    = saleScale > 0n ? qtyRaw / saleScale : 0n;
  const payment     = qtyHuman * currentPrice;
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
    if (!qtyRaw) return 'Enter a vote quantity.';
    if (mode === 'private') {
      if (!selectedRecord) return 'Select a payment source.';
      if (selectedRecord.microcredits < payment) return 'Insufficient record balance.';
    }
    return null;
  }, [connected, currentPrice, qtyRaw, mode, selectedRecord, payment]);

  const bidSteps = [
    {
      label: 'Cast votes',
      execute: async () => {
        const hasRef    = codeId.trim().length > 0;
        const isPrivate = mode === 'private';

        // Quadratic takes only payment_amount — no quantity in the transition.
        const params: BidParams = { type: AuctionType.Quadratic, paymentAmount: payment };
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
    if (bidDone) { setQtyInput(''); onBidSuccess?.(); resetBid(); }
  }, [bidDone]);

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Each token = 1 vote. Smaller contributions receive proportionally more voting weight.
      </p>

      <BidModeToggle
        mode={mode}
        onChange={(m) => { setMode(m); setRecordTouched(false); if (m === 'public') setSelectedRecordId(''); }}
      />

      <div className="space-y-1.5">
        <Label htmlFor="quad-qty">Votes (tokens)</Label>
        <Input
          id="quad-qty"
          inputMode="numeric"
          placeholder="0"
          value={qtyInput}
          className="h-8 text-xs"
          onChange={(e) => setQtyInput(e.target.value)}
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
        inputId="quad-ref"
      />

      <BidSummaryPanel rows={[
        payment > 0n     && ['Payment',                                          formatMicrocredits(payment)],
        payment > 0n     && [`Protocol fee (${protocolConfig.feeBps / 100}%)`,  `-${formatMicrocredits(protocolFee)}`],
        referralCut > 0n && ['Referral',                                         formatMicrocredits(referralCut)],
      ]} />

      <FormBlockerNotice message={formBlocker} />

      <BidSubmitButton
        busy={bidBusy}
        waiting={bidWaiting}
        disabled={!!formBlocker || bidBusy || bidWaiting}
        onClick={() => void placeBid()}
        label="Cast Votes"
      />

      <BidErrorBanner error={bidError} />
    </div>
  );
}
