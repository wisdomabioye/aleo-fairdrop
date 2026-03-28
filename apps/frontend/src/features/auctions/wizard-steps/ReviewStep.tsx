import { AuctionType } from '@fairdrop/types/domain';
import { AUCTION_REGISTRY } from '../registry';
import { useBlockHeight } from '@/shared/hooks/useBlockHeight';
import { useProtocolConfig } from '@/shared/hooks/useProtocolConfig';
import { formatAmount } from '@fairdrop/sdk/format';
import { GATE_LABEL } from './types';
import { ReviewSection, ReviewRow } from './ReviewSection';
import type { StepProps } from './types';
import type {
  DutchPricingValues,
  SealedPricingValues,
  RaisePricingValues,
  AscendingPricingValues,
  LbpPricingValues,
  QuadraticPricingValues,
} from '../pricing-steps/types';

function PricingRows({ form }: { form: StepProps['form'] }) {
  const { auctionType, pricing } = form;
  if (!auctionType || !pricing) return <ReviewRow label="Pricing" value="—" />;

  switch (auctionType) {
    case AuctionType.Dutch:
    case AuctionType.Sealed: {
      const p = pricing as DutchPricingValues;
      return (
        <>
          <ReviewRow label="Start price"  value={`${p.startPrice || '0'} ALEO`} />
          <ReviewRow label="Floor price"  value={`${p.floorPrice || '0'} ALEO`} />
          <ReviewRow label="Decay blocks" value={p.priceDecayBlocks || '0'} />
          <ReviewRow label="Decay amount" value={`${p.priceDecayAmount || '0'} ALEO`} />
          {auctionType === AuctionType.Sealed && (
            <ReviewRow label="Commit window" value={`${(pricing as SealedPricingValues).commitEndBlockOffset || '0'} blocks`} />
          )}
        </>
      );
    }
    case AuctionType.Ascending: {
      const p = pricing as AscendingPricingValues;
      return (
        <>
          <ReviewRow label="Floor price"   value={`${p.floorPrice || '0'} ALEO`} />
          <ReviewRow label="Ceiling price" value={`${p.ceilingPrice || '0'} ALEO`} />
          <ReviewRow label="Rise blocks"   value={p.priceRiseBlocks || '0'} />
          <ReviewRow label="Rise amount"   value={`${p.priceRiseAmount || '0'} ALEO`} />
        </>
      );
    }
    case AuctionType.Raise: {
      const p = pricing as RaisePricingValues;
      return <ReviewRow label="Raise target" value={`${p.raiseTarget || '0'} ALEO`} />;
    }
    case AuctionType.Lbp: {
      const p = pricing as LbpPricingValues;
      return (
        <>
          <ReviewRow label="Start weight"  value={`${p.startWeight || '0'} bps`} />
          <ReviewRow label="End weight"    value={`${p.endWeight   || '0'} bps`} />
          <ReviewRow label="Swap fee"      value={`${p.swapFeeBps  || '0'} bps`} />
          <ReviewRow label="Initial price" value={`${p.initialPrice || '0'} ALEO`} />
        </>
      );
    }
    case AuctionType.Quadratic: {
      const p = pricing as QuadraticPricingValues;
      return (
        <>
          <ReviewRow label="Matching pool"    value={`${p.matchingPool        || '0'} ALEO`} />
          <ReviewRow label="Contribution cap" value={`${p.contributionCap     || '0'} ALEO`} />
          <ReviewRow label="Matching +Δ"      value={`${p.matchingDeadlineOffset || '0'} blocks`} />
        </>
      );
    }
    default: return null;
  }
}

export function ReviewStep({ form }: StepProps) {
  const { data: currentBlock = 0 } = useBlockHeight();
  const { data: pc } = useProtocolConfig();

  const slot       = form.auctionType ? AUCTION_REGISTRY[form.auctionType] : null;
  const startBlock = parseInt(form.startBlock) || 0;
  const endBlock   = parseInt(form.endBlock)   || 0;
  const duration   = endBlock - startBlock;
  const minDuration = pc?.minAuctionDuration ?? 0;

  const startTooLow    = currentBlock > 0 && startBlock > 0 && startBlock <= currentBlock;
  const durationTooShort = minDuration > 0 && duration > 0 && duration < minDuration;
  const metadataMissing  = !form.metadataName.trim() || !form.metadataDescription.trim();
  const minBidInvalid    = parseFloat(form.minBidAmount) <= 0;

  const timingStatus =
    startTooLow || durationTooShort ? 'error' :
    undefined;

  const metaStatus = metadataMissing ? 'error' : 'ok';

  const hasErrors = startTooLow || durationTooShort || minBidInvalid;

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground pb-1">
        Review each section before submitting. Click any header to collapse.
      </p>

      {hasErrors && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2.5 text-xs text-destructive space-y-1">
          <p className="font-semibold">Fix the following before submitting:</p>
          {startTooLow      && <p>• Start block is at or below the current block ({currentBlock}) — go back to Timing.</p>}
          {durationTooShort && <p>• Duration ({duration} blocks) is below the minimum ({minDuration} blocks) — go back to Timing.</p>}
          {minBidInvalid    && <p>• Minimum bid must be greater than 0 — go back to Timing.</p>}
        </div>
      )}

      {/* ── Auction type ─────────────────────────────────────────────── */}
      <ReviewSection title="Auction type">
        <ReviewRow
          label="Type"
          mono={false}
          value={
            slot ? (
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${slot.color}`}>
                {slot.label}
              </span>
            ) : '—'
          }
        />
        {slot && <ReviewRow label="Mechanism" mono={false} value={slot.description} />}
        <ReviewRow
          label="Creation fee"
          value={pc ? `${formatAmount(BigInt(pc.creationFee ?? 0), 6)} ALEO` : '…'}
        />
      </ReviewSection>

      {/* ── Sale token ───────────────────────────────────────────────── */}
      <ReviewSection title="Sale token">
        <ReviewRow label="Symbol"   value={form.tokenSymbol || '—'} />
        <ReviewRow label="Token ID" value={form.saleTokenId || '—'} />
        <ReviewRow
          label="Supply"
          value={form.supply ? formatAmount(BigInt(form.supply), form.tokenDecimals) : '—'}
        />
      </ReviewSection>

      {/* ── Pricing ──────────────────────────────────────────────────── */}
      <ReviewSection title="Pricing">
        <PricingRows form={form} />
      </ReviewSection>

      {/* ── Timing ───────────────────────────────────────────────────── */}
      <ReviewSection title="Timing" status={timingStatus}>
        <ReviewRow
          label="Start block"
          value={
            startTooLow
              ? <span className="text-destructive">{form.startBlock} — below current block ({currentBlock})</span>
              : (form.startBlock || '—')
          }
          status={startTooLow ? 'error' : undefined}
        />
        <ReviewRow
          label="End block"
          value={
            durationTooShort
              ? <span className="text-amber-500">{form.endBlock} — duration {duration} &lt; min {minDuration}</span>
              : (form.endBlock || '—')
          }
          status={durationTooShort ? 'warning' : undefined}
        />
        <ReviewRow label="Duration" value={duration > 0 ? `${duration} blocks` : '—'} />
        <ReviewRow
          label="Min bid"
          value={`${form.minBidAmount || '0'} ${form.tokenSymbol || 'ALEO'}`}
          status={minBidInvalid ? 'error' : undefined}
        />
        <ReviewRow
          label="Max bid"
          value={
            form.maxBidAmount && form.maxBidAmount !== '0'
              ? `${form.maxBidAmount} ${form.tokenSymbol || 'ALEO'}`
              : 'No cap'
          }
        />
      </ReviewSection>

      {/* ── Access & vesting ─────────────────────────────────────────── */}
      <ReviewSection title="Access & vesting">
        <ReviewRow label="Gate mode" mono={false} value={GATE_LABEL[form.gateMode]} />
        {form.gateMode === 1 && <ReviewRow label="Merkle root"    value={form.merkleRoot} />}
        {form.gateMode === 2 && <ReviewRow label="Issuer address" value={form.issuerAddress} />}
        <ReviewRow
          label="Vesting"
          mono={false}
          value={
            form.vestEnabled
              ? `Cliff +${form.vestCliffBlocks} blocks, full vest +${form.vestEndBlocks} blocks`
              : 'Disabled'
          }
        />
      </ReviewSection>

      {/* ── Metadata ─────────────────────────────────────────────────── */}
      <ReviewSection title="Metadata" status={metaStatus}>
        <ReviewRow label="Name"        mono={false} value={form.metadataName        || '—'} />
        <ReviewRow label="Description" mono={false} value={form.metadataDescription || '—'} />
        {form.metadataWebsite && <ReviewRow label="Website" value={form.metadataWebsite} />}
        {form.metadataTwitter && <ReviewRow label="Twitter" value={form.metadataTwitter} />}
        {form.metadataDiscord && <ReviewRow label="Discord" value={form.metadataDiscord} />}
        {form.metadataLogoIpfs && <ReviewRow label="Logo" value={form.metadataLogoIpfs} />}
        <ReviewRow
          label="IPFS"
          mono={false}
          value={<span className="text-muted-foreground italic">Pinned on submit</span>}
        />
      </ReviewSection>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <p className="text-xs text-muted-foreground pt-1">
        Submitting calls <code className="font-mono">create_auction</code> on the{' '}
        <strong>{slot?.label ?? '?'}</strong> program.{' '}
        {pc && <>Creation fee of <strong>{formatAmount(BigInt(pc.creationFee ?? 0), 6)} ALEO</strong> will be deducted.</>}
      </p>
    </div>
  );
}
