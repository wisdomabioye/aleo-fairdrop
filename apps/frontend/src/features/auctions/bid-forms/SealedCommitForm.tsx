import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { Input, Label } from '@/components';
import { formatMicrocredits, aleoToMicro } from '@fairdrop/sdk/credits';
import { parseTokenAmount } from '@fairdrop/sdk/format';
import { generateTokenId } from '@fairdrop/sdk/hash';
import {
  commitBidPublic,
  commitBidPublicRef,
  commitBidPrivate,
  commitBidPrivateRef,
} from '@fairdrop/sdk/transactions';
import { useConfirmedSequentialTx } from '@/shared/hooks/useConfirmedSequentialTx';
import { useCreditRecords } from '@/shared/hooks/useCreditRecords';
import { useCommitmentRecords } from '@/shared/hooks/useCommitmentRecords';
import { TX_DEFAULT_FEE } from '@/env';
import type { AuctionView, ProtocolConfig } from '@fairdrop/types/domain';
import {
  BidModeToggle,
  CreditRecordSelect,
  ReferralInput,
  BidSummaryPanel,
  BidSubmitButton,
  BidErrorBanner,
  FormBlockerNotice,
} from './_parts';

interface Props {
  auction:        AuctionView;
  protocolConfig: ProtocolConfig;
  onBidSuccess?:  () => void;
}

export function SealedCommitForm({ auction, protocolConfig, onBidSuccess }: Props) {
  const { connected, executeTransaction } = useWallet();
  const [searchParams] = useSearchParams();

  const saleScale    = BigInt(auction.saleScale);
  const minBidAmount = BigInt(auction.minBidAmount) ?? 0n;
  const maxBidAmount = BigInt(auction.maxBidAmount) ?? 0n;

  // Sealed-specific price params
  const sealedP      = auction.params.type === 'sealed' ? auction.params : null;
  const floorPrice   = sealedP ? BigInt(sealedP.floor_price)        : 0n;
  const startPrice   = sealedP ? BigInt(sealedP.start_price)        : 0n;
  const decayBlocks  = sealedP ? BigInt(sealedP.price_decay_blocks) : 1n;
  const decayAmount  = sealedP ? BigInt(sealedP.price_decay_amount) : 0n;
  const commitEndBlock = sealedP ? sealedP.commit_end_block: 0;

  // Clearing price is fixed by Dutch formula at commit_end_block — deterministic.
  // Bidders must lock: payment_amount * sale_scale >= quantity * clearing_price
  const clearingPriceEst = useMemo(() => {
    if (!commitEndBlock || decayBlocks === 0n) return floorPrice;
    const blocksElapsed = BigInt(commitEndBlock) - BigInt(auction.startBlock);
    if (blocksElapsed <= 0n) return startPrice;
    const steps = blocksElapsed / decayBlocks;
    const total = steps * decayAmount;
    const price = startPrice > total ? startPrice - total : 0n;
    return price > floorPrice ? price : floorPrice;
  }, [commitEndBlock, auction.startBlock, startPrice, decayBlocks, decayAmount, floorPrice]);

  // Minimum collateral enforced by contract: payment_amount * sale_scale >= min_bid_amount * floor_price
  const minCollateral = saleScale > 0n
    ? (minBidAmount * floorPrice + saleScale - 1n) / saleScale
    : 0n;

  const [mode,             setMode]             = useState<'private' | 'public'>('private');
  const [qtyInput,         setQtyInput]         = useState('');
  const [payInput,         setPayInput]         = useState('');
  const [payTouched,       setPayTouched]       = useState(false);
  const [selectedRecordId, setSelectedRecordId] = useState('');
  const [recordTouched,    setRecordTouched]    = useState(false);
  const [codeId,           setCodeId]           = useState(searchParams.get('ref') ?? '');
  const [showReferral,     setShowReferral]     = useState(Boolean(searchParams.get('ref')));

  const { creditRecords, loading: creditsLoading } = useCreditRecords();
  const { commitmentRecords, fetchRecords } = useCommitmentRecords(auction.programId, { auctionId: auction.id });
  const existingCommit = commitmentRecords.find((c) => !c.spent);
  const unspentRecords = useMemo(() => creditRecords.filter((r) => !r.spent), [creditRecords]);
  const selectedRecord = unspentRecords.find((r) => r.id === selectedRecordId) ?? null;

  const decimals     = auction.saleTokenDecimals;
  const qtyRaw       = parseTokenAmount(qtyInput, decimals);
  const qtyHuman     = saleScale > 0n ? qtyRaw / saleScale : 0n;
  // Auto-collateral uses clearing price estimate — the price the reveal check actually uses.
  const paymentMicro = aleoToMicro(payInput) ?? (qtyHuman * clearingPriceEst);
  const protocolFee  = paymentMicro * BigInt(protocolConfig.feeBps) / 10_000n;
  const referralCut  = codeId.trim() ? (protocolFee * BigInt(protocolConfig.referralPoolBps)) / 10_000n : 0n;

  // Validate against the contract's commit-time minimum: payment >= min_bid_amount * floor_price / sale_scale
  const paymentError = useMemo(() => {
    if (!payTouched || paymentMicro <= 0n) return null;
    if (minCollateral > 0n && paymentMicro < minCollateral)
      return `Minimum collateral: ${formatMicrocredits(minCollateral)} (min qty × floor price).`;
    if (maxBidAmount > 0n && paymentMicro > maxBidAmount)
      return `Maximum collateral: ${formatMicrocredits(maxBidAmount)}.`;
    return null;
  }, [payTouched, paymentMicro, minCollateral, maxBidAmount]);

  const recordError = useMemo(() => {
    if (mode !== 'private' || !recordTouched) return null;
    if (!selectedRecord) return 'Select a payment record.';
    if (paymentMicro > 0n && selectedRecord.microcredits < paymentMicro) return 'Insufficient balance.';
    return null;
  }, [mode, recordTouched, selectedRecord, paymentMicro]);

  const bidSteps = useMemo(() => [{
    label: 'Commit bid',
    execute: async () => {
      const nonce     = generateTokenId();
      const isPrivate = mode === 'private';
      const hasRef    = codeId.trim().length > 0;
      const spec = isPrivate && selectedRecord
        ? hasRef
          ? commitBidPrivateRef(selectedRecord._record, auction.id, qtyRaw, nonce, paymentMicro, codeId.trim(), TX_DEFAULT_FEE)
          : commitBidPrivate(selectedRecord._record, auction.id, qtyRaw, nonce, paymentMicro, TX_DEFAULT_FEE)
        : hasRef
          ? commitBidPublicRef(auction.id, qtyRaw, nonce, paymentMicro, codeId.trim(), TX_DEFAULT_FEE)
          : commitBidPublic(auction.id, qtyRaw, nonce, paymentMicro, TX_DEFAULT_FEE);
      const result = await executeTransaction({ ...spec, inputs: spec.inputs as string[] });
      return result?.transactionId;
    },
  }], [auction.id, auction.programId, codeId, executeTransaction, mode, paymentMicro, qtyRaw, selectedRecord]);

  const { done: bidDone, busy: bidBusy, isWaiting: bidWaiting, error: bidError, advance: submitBid, reset: resetBid } =
    useConfirmedSequentialTx(bidSteps);

  useEffect(() => {
    if (!bidDone) return;
    setQtyInput(''); setPayInput(''); setPayTouched(false); setRecordTouched(false);
    onBidSuccess?.(); resetBid();
    setTimeout(() => void fetchRecords(), 6_000);
  }, [bidDone]);

  const formBlocker = useMemo(() => {
    if (!connected) return 'Connect wallet to place a bid.';
    if (mode === 'private') {
      if (!selectedRecord) return 'Select a payment record.';
      if (paymentMicro > 0n && selectedRecord.microcredits < paymentMicro)
        return 'Selected record does not have enough balance.';
    }
    return null;
  }, [connected, mode, selectedRecord, paymentMicro]);

  const isDisabled = !!formBlocker || bidBusy || bidWaiting;

  if (existingCommit) {
    return (
      <div className="space-y-3">
        <div className="rounded-lg border border-sky-500/20 bg-sky-500/8 px-3 py-2.5 text-xs text-sky-700 dark:text-sky-400 space-y-1">
          <p className="font-medium">Commitment submitted</p>
          <p>
            You already have a sealed commitment for this auction.
            The reveal window opens at block {commitEndBlock?.toLocaleString() ?? '—'}.
          </p>
        </div>
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-[11px] text-destructive space-y-0.5">
          <p className="font-medium">You must reveal before the auction ends</p>
          <p>
            If you do not reveal your bid before block {sealedP?.commit_end_block != null ? auction.endBlock.toLocaleString() : '—'},
            your entire collateral ({formatMicrocredits(existingCommit.payment_amount)}) is permanently forfeited.
            There is no recovery path.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Collateral info banner */}
      <div className="rounded-lg border border-amber-500/20 bg-amber-500/8 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-400 space-y-0.5">
        <p className="font-medium">How collateral works</p>
        <p>Lock ALEO now, reveal your bid at block {commitEndBlock ?? '—'}. Clearing price is fixed by Dutch formula at that block. Overpayment is refunded at claim.</p>
        {floorPrice > 0n && (
          <p>Floor price: {formatMicrocredits(floorPrice)} · Est. clearing: {formatMicrocredits(clearingPriceEst)}</p>
        )}
      </div>

      <BidModeToggle
        mode={mode}
        onChange={(m) => { setMode(m); setRecordTouched(false); if (m === 'public') setSelectedRecordId(''); }}
      />

      {/* Quantity */}
      <div className="space-y-1.5">
        <Label htmlFor="sealed-qty">Quantity {auction.saleTokenSymbol ? `(${auction.saleTokenSymbol})` : ''}</Label>
        <Input id="sealed-qty" inputMode="decimal" placeholder="0" value={qtyInput} className="h-8 text-xs"
          onChange={(e) => setQtyInput(e.target.value)} />
      </div>

      {/* Collateral */}
      <div className="space-y-1.5">
        <Label htmlFor="sealed-pay">Collateral (ALEO)</Label>
        <Input id="sealed-pay" inputMode="decimal"
          placeholder={qtyHuman > 0n && clearingPriceEst > 0n ? `est: ${formatMicrocredits(qtyHuman * clearingPriceEst)}` : 'auto-computed'}
          value={payInput}
          className={`h-8 text-xs${paymentError ? ' border-destructive focus-visible:ring-destructive/30' : ''}`}
          aria-invalid={!!paymentError}
          onBlur={() => setPayTouched(true)}
          onChange={(e) => { if (!payTouched) setPayTouched(true); setPayInput(e.target.value); }} />
        <div className="flex flex-wrap gap-x-2 text-[11px]">
          {minCollateral > 0n && !paymentError && (
            <span className="text-muted-foreground">Min {formatMicrocredits(minCollateral)}</span>
          )}
          {paymentError && <span className="text-destructive">{paymentError}</span>}
        </div>
      </div>

      {mode === 'private' && (
        <CreditRecordSelect
          records={unspentRecords}
          loading={creditsLoading}
          value={selectedRecordId}
          onChange={(v) => { if (!recordTouched) setRecordTouched(true); setSelectedRecordId(v); }}
          error={recordError}
          label="Payment record"
        />
      )}

      <ReferralInput
        value={codeId}
        onChange={setCodeId}
        show={showReferral}
        onToggle={() => { setShowReferral((p) => { if (p) setCodeId(''); return !p; }); }}
      />

      <BidSummaryPanel title="Summary" rows={[
        floorPrice > 0n       && ['Floor price',       formatMicrocredits(floorPrice)],
        clearingPriceEst > 0n && ['Est. clearing',     formatMicrocredits(clearingPriceEst)],
        qtyRaw > 0n           && ['Quantity',          qtyInput],
        paymentMicro > 0n     && ['Collateral locked', formatMicrocredits(paymentMicro)],
        paymentMicro > 0n     && ['Fee est.',          `~${formatMicrocredits(protocolFee)}`],
        selectedRecord        && ['Record balance',    formatMicrocredits(selectedRecord.microcredits)],
        referralCut > 0n      && ['Referral',          formatMicrocredits(referralCut)],
      ]} />

      <FormBlockerNotice message={formBlocker} />

      <BidSubmitButton
        busy={bidBusy}
        waiting={bidWaiting}
        disabled={isDisabled || !!paymentError || !qtyRaw || !paymentMicro}
        onClick={() => void submitBid()}
        label={`Commit ${mode === 'private' ? 'Private' : 'Public'} Bid`}
      />

      <BidErrorBanner error={bidError} />
    </div>
  );
}
