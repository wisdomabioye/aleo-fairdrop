import { AuctionType } from '@fairdrop/types/domain';
import { formatAmount } from '@fairdrop/sdk/format';
import { AUCTION_REGISTRY } from '../registry';
import type { StepProps } from './types';
import type {
  DutchPricingValues,
  SealedPricingValues,
  RaisePricingValues,
  AscendingPricingValues,
  LbpPricingValues,
  QuadraticPricingValues,
} from '../pricing-steps/types';

const MICROS = 6; // 1 ALEO = 10^6 microcredits

function aleofmt(v: string): string {
  const raw = v ? BigInt(v) : 0n;
  return `${formatAmount(raw, MICROS)} ALEO`;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between py-2 px-4 text-sm border-b border-border last:border-0">
      <span className="text-muted-foreground shrink-0 mr-4">{label}</span>
      <span className="text-right break-all font-mono text-xs">{value}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1">{title}</p>
      <div className="rounded-md border border-border divide-y divide-border">
        {children}
      </div>
    </div>
  );
}

function PricingSummary({ form }: { form: StepProps['form'] }) {
  const { auctionType, pricing } = form;
  if (!auctionType || !pricing) return <Row label="Pricing" value="—" />;

  switch (auctionType) {
    case AuctionType.Dutch:
    case AuctionType.Sealed: {
      const p = pricing as DutchPricingValues;
      return (
        <>
          <Row label="Start price"        value={`${p.startPrice || '0'} ALEO`} />
          <Row label="Floor price"        value={`${p.floorPrice || '0'} ALEO`} />
          <Row label="Decay blocks"       value={p.priceDecayBlocks || '0'} />
          <Row label="Decay amount"       value={`${p.priceDecayAmount || '0'} ALEO`} />
          {auctionType === AuctionType.Sealed && (
            <Row
              label="Commit window (blocks)"
              value={(pricing as SealedPricingValues).commitEndBlockOffset || '0'}
            />
          )}
        </>
      );
    }
    case AuctionType.Ascending: {
      const p = pricing as AscendingPricingValues;
      return (
        <>
          <Row label="Floor price"   value={`${p.floorPrice || '0'} ALEO`} />
          <Row label="Ceiling price" value={`${p.ceilingPrice || '0'} ALEO`} />
          <Row label="Rise blocks"   value={p.priceRiseBlocks || '0'} />
          <Row label="Rise amount"   value={`${p.priceRiseAmount || '0'} ALEO`} />
        </>
      );
    }
    case AuctionType.Raise: {
      const p = pricing as RaisePricingValues;
      return <Row label="Raise target" value={`${p.raiseTarget || '0'} ALEO`} />;
    }
    case AuctionType.Lbp: {
      const p = pricing as LbpPricingValues;
      return (
        <>
          <Row label="Start weight" value={`${p.startWeight || '0'} bps`} />
          <Row label="End weight"   value={`${p.endWeight   || '0'} bps`} />
          <Row label="Swap fee"     value={`${p.swapFeeBps  || '0'} bps`} />
          <Row label="Initial price" value={`${p.initialPrice || '0'} ALEO`} />
        </>
      );
    }
    case AuctionType.Quadratic: {
      const p = pricing as QuadraticPricingValues;
      return (
        <>
          <Row label="Matching pool"        value={`${p.matchingPool        || '0'} ALEO`} />
          <Row label="Contribution cap"     value={`${p.contributionCap     || '0'} ALEO (0=unlimited)`} />
          <Row label="Matching deadline +Δ" value={`${p.matchingDeadlineOffset || '0'} blocks`} />
        </>
      );
    }
    default:
      return null;
  }
}

export function ReviewStep({ form }: StepProps) {
  const slot       = form.auctionType ? AUCTION_REGISTRY[form.auctionType] : null;
  const startBlock = parseInt(form.startBlock) || 0;
  const endBlock   = parseInt(form.endBlock)   || 0;
  const duration   = endBlock - startBlock;

  const gateLabel = ['Open — anyone can bid', 'Merkle allowlist', 'Credential issuer'][form.gateMode];

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Review the full auction configuration before submitting on-chain.
      </p>

      {/* Type */}
      <Section title="Auction type">
        <Row
          label="Type"
          value={
            slot ? (
              <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${slot.color}`}>
                {slot.label}
              </span>
            ) : '—'
          }
        />
        {slot && <Row label="Mechanism" value={<span className="font-sans">{slot.description}</span>} />}
      </Section>

      {/* Token */}
      <Section title="Sale token">
        <Row label="Symbol"   value={form.tokenSymbol   || '—'} />
        <Row label="Token ID" value={form.saleTokenId   || '—'} />
        <Row label="Supply"   value={form.supply        ? `${form.supply} (base units)` : '—'} />
        <Row label="Scale"    value={form.saleScale     || '—'} />
      </Section>

      {/* Pricing */}
      <Section title="Pricing">
        <PricingSummary form={form} />
      </Section>

      {/* Timing */}
      <Section title="Timing">
        <Row label="Start block"  value={form.startBlock || '—'} />
        <Row label="End block"    value={form.endBlock   || '—'} />
        <Row label="Duration"     value={duration > 0 ? `${duration} blocks` : '—'} />
        <Row label="Min bid"      value={`${form.minBidAmount || '0'} ALEO`} />
        <Row label="Max bid"      value={form.maxBidAmount && form.maxBidAmount !== '0' ? `${form.maxBidAmount} ALEO` : 'No cap'} />
      </Section>

      {/* Gate & Vest */}
      <Section title="Access & vesting">
        <Row label="Gate mode" value={gateLabel} />
        {form.gateMode === 1 && (
          <Row label="Merkle root"    value={form.merkleRoot} />
        )}
        {form.gateMode === 2 && (
          <Row label="Issuer address" value={form.issuerAddress} />
        )}
        <Row
          label="Vesting"
          value={form.vestEnabled
            ? `Cliff +${form.vestCliffBlocks} blocks, full vest +${form.vestEndBlocks} blocks`
            : 'Disabled'}
        />
      </Section>

      {/* Metadata */}
      <Section title="Metadata">
        <Row label="Name"        value={form.metadataName        || '—'} />
        <Row label="Description" value={<span className="font-sans text-xs">{form.metadataDescription || '—'}</span>} />
        {form.metadataWebsite && <Row label="Website" value={form.metadataWebsite} />}
        {form.metadataTwitter && <Row label="Twitter" value={form.metadataTwitter} />}
        {form.metadataDiscord && <Row label="Discord" value={form.metadataDiscord} />}
        <Row
          label="IPFS CID"
          value={form.metadataIpfsCid
            ? <span className="text-emerald-600 dark:text-emerald-400">{form.metadataIpfsCid}</span>
            : <span className="text-destructive">Not saved — go back to Step 7</span>}
        />
        <Row
          label="On-chain hash"
          value={form.metadataHash && form.metadataHash !== '0field'
            ? form.metadataHash
            : <span className="text-destructive">Not saved</span>}
        />
      </Section>

      <p className="text-xs text-muted-foreground">
        Submitting will send a transaction to <strong>create_auction</strong> on the{' '}
        {slot?.label ?? '?'} program. The creation fee will be deducted from your wallet.
      </p>
    </div>
  );
}
