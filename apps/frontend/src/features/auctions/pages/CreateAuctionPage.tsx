import { useState }                   from 'react';
import { useNavigate }                from 'react-router-dom';
import { useBlockHeight }            from '@/shared/hooks/useBlockHeight';
import { useWallet }                  from '@provablehq/aleo-wallet-adaptor-react';
import { Button, Spinner }            from '@/components';
import { fetchMappingBigInt }         from '@/lib/mapping';
import { AuctionType }                from '@fairdrop/types/domain';
import { config }                     from '@/env';
import { AppRoutes }                  from '@/config/app.routes';
import { useProtocolConfig }          from '@/shared/hooks/useProtocolConfig';
import { useConfirmedSequentialTx }   from '@/shared/hooks/useConfirmedSequentialTx';
import { WizardTxStatus }             from '@/shared/components/WizardTxStatus';
import { TypeStep }                   from '../wizard-steps/TypeStep';
import { TokenStep }                  from '../wizard-steps/TokenStep';
import { PricingStep }                from '../wizard-steps/PricingStep';
import { TimingStep }                 from '../wizard-steps/TimingStep';
import { GateVestStep }               from '../wizard-steps/GateVestStep';
import { ReferralStep }               from '../wizard-steps/ReferralStep';
import { MetadataStep }               from '../wizard-steps/MetadataStep';
import { ReviewStep }                 from '../wizard-steps/ReviewStep';
import { DEFAULT_FORM, DEFAULT_PRICING } from '../wizard-steps/types';
import { buildCreateAuctionInputs }   from '../wizard-steps/build-inputs';
import { isPricingComplete }          from '../pricing-steps/validation';
import { metadataService }           from '@/services/metadata.service';
import type { WizardForm }            from '../wizard-steps/types';

// ── step definitions ──────────────────────────────────────────────────────────

const STEPS = [
  { id: 'type',     label: 'Type' },
  { id: 'token',    label: 'Token' },
  { id: 'pricing',  label: 'Pricing' },
  { id: 'timing',   label: 'Timing' },
  { id: 'gate',     label: 'Gate & Vest' },
  { id: 'referral', label: 'Referral' },
  { id: 'metadata', label: 'Metadata' },
  { id: 'review',   label: 'Review' },
] as const;

// ── step validation ───────────────────────────────────────────────────────────

function canAdvance(
  step: number,
  form: WizardForm,
  opts: { currentBlock: number; minDuration: number } = { currentBlock: 0, minDuration: 0 },
): boolean {
  switch (step) {
    case 0: return form.auctionType !== null;
    case 1: return !!form.saleTokenId && !!form.supply && !!form.tokenRecord;
    case 2: return !!form.auctionType && !!form.pricing && isPricingComplete(form.auctionType, form.pricing);
    case 3: {
      const start    = parseInt(form.startBlock);
      const end      = parseInt(form.endBlock);
      const duration = end - start;
      const startOk  = opts.currentBlock === 0 ? start > 0 : start > opts.currentBlock;
      const durOk    = opts.minDuration === 0 ? end > start : duration >= opts.minDuration;
      return startOk && durOk && parseFloat(form.minBidAmount) > 0;
    }
    case 4: {
      if (form.gateMode === 1 && (!form.merkleRoot || form.merkleRoot === '0field')) return false;
      if (form.gateMode === 2 && !form.issuerAddress) return false;
      if (form.vestEnabled) {
        const cliff = parseInt(form.vestCliffBlocks) || 0;
        const end   = parseInt(form.vestEndBlocks)   || 0;
        if (end <= 0 || end <= cliff) return false;
      }
      return true;
    }
    case 5: return true;
    case 6: {
      return !!form.metadataName.trim() && !!form.metadataDescription.trim();
    }
    case 7: {
      const start    = parseInt(form.startBlock);
      const end      = parseInt(form.endBlock);
      const startOk  = opts.currentBlock === 0 ? start > 0 : start > opts.currentBlock;
      const durOk    = opts.minDuration === 0 ? end > start : (end - start) >= opts.minDuration;
      return startOk && durOk && parseFloat(form.minBidAmount) > 0;
    }
    default: return true;
  }
}

// ── component ─────────────────────────────────────────────────────────────────

export function CreateAuctionPage() {
  const navigate = useNavigate();
  const { executeTransaction, address } = useWallet();
  const { data: protocolConfig, isLoading: configLoading } = useProtocolConfig();
  const { data: currentBlock = 0 } = useBlockHeight();

  const [step, setStep] = useState(0);
  const [form, setForm] = useState<WizardForm>(DEFAULT_FORM);

  function handleChange(updates: Partial<WizardForm>) {
    setForm((prev) => {
      const next = { ...prev, ...updates };
      if ('auctionType' in updates && updates.auctionType && updates.auctionType !== prev.auctionType) {
        next.pricing = DEFAULT_PRICING[updates.auctionType as AuctionType] ?? null;
      }
      return next;
    });
  }

  function goNext() { if (step < STEPS.length - 1) setStep((s) => s + 1); }
  function goBack()  { if (step > 0) setStep((s) => s - 1); }

  // ── submission ───────────────────────────────────────────────────────────────

  const submitSteps = [{
    label: 'Create Auction',
    execute: async () => {
      if (!protocolConfig) throw new Error('Protocol config not loaded.');
      if (!address)        throw new Error('Connect your wallet first.');

      const programEntry = form.auctionType
        ? config.programs[form.auctionType as keyof typeof config.programs]
        : null;
      if (!programEntry) throw new Error('No program for selected auction type.');

      // Fetch current creator nonce (0 if no prior auctions)
      const nonce = await fetchMappingBigInt(programEntry.programId, 'creator_nonces', address);

      // Upload metadata to IPFS right before submitting — no junk uploads on navigation
      const { hash, ipfsCid } = await metadataService.upload({
        name:        form.metadataName.trim(),
        description: form.metadataDescription.trim(),
        website:     form.metadataWebsite.trim()  || undefined,
        twitter:     form.metadataTwitter.trim()  || undefined,
        discord:     form.metadataDiscord.trim()  || undefined,
        logoIpfs:    form.metadataLogoIpfs        || undefined,
      });

      const tx = buildCreateAuctionInputs(
        { ...form, metadataHash: hash, metadataIpfsCid: ipfsCid },
        nonce, protocolConfig, config,
      );
      const result = await executeTransaction({
        ...tx,
        inputs:     tx.inputs as string[],
        privateFee: false,
      });

      if (!result?.transactionId) throw new Error('Transaction was rejected by the wallet.');
      return result.transactionId;
    },
  }];

  const { done, busy, isWaiting, trackedIds, advance, reset } =
    useConfirmedSequentialTx(submitSteps);

  const submitting = busy || isWaiting;

  // ── success screen ────────────────────────────────────────────────────────────

  if (done) {
    return (
      <div className="max-w-lg mx-auto mt-16 space-y-6">
        <div className="text-center space-y-2">
          <p className="text-2xl font-semibold">Auction submitted</p>
          <p className="text-sm text-muted-foreground">
            Waiting for on-chain confirmation. It may take a few minutes to appear.
          </p>
        </div>

        <WizardTxStatus trackedIds={trackedIds} />

        <div className="flex gap-3 justify-center">
          <Button variant="outline" onClick={() => navigate(AppRoutes.auctions)}>
            View auctions
          </Button>
          <Button onClick={() => { reset(); setForm(DEFAULT_FORM); setStep(0); }}>
            Create another
          </Button>
        </div>
      </div>
    );
  }

  const isLastStep   = step === STEPS.length - 1;
  const canGoForward = canAdvance(step, form, {
    currentBlock,
    minDuration: protocolConfig?.minAuctionDuration ?? 0,
  });

  // ── render ────────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-2xl mx-auto space-y-6 py-6 px-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold">Create Auction</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Step {step + 1} of {STEPS.length} — {STEPS[step]!.label}
        </p>
      </div>

      {/* Progress bar */}
      <div className="flex gap-1">
        {STEPS.map((s, i) => (
          <button
            key={s.id}
            onClick={() => { if (i < step) setStep(i); }}
            className={[
              'h-1.5 flex-1 rounded-full transition-colors',
              i < step   ? 'bg-primary cursor-pointer' :
              i === step ? 'bg-primary/60'              :
                           'bg-muted',
            ].join(' ')}
            aria-label={`Step ${i + 1}: ${s.label}`}
          />
        ))}
      </div>

      {/* Step content */}
      <div className="rounded-lg border border-border bg-card p-6">
        {step === 0 && <TypeStep     form={form} onChange={handleChange} />}
        {step === 1 && <TokenStep    form={form} onChange={handleChange} />}
        {step === 2 && <PricingStep  form={form} onChange={handleChange} />}
        {step === 3 && protocolConfig && (
          <TimingStep form={form} onChange={handleChange} protocolConfig={protocolConfig} />
        )}
        {step === 4 && <GateVestStep  form={form} onChange={handleChange} />}
        {step === 5 && protocolConfig && (
          <ReferralStep form={form} onChange={handleChange} protocolConfig={protocolConfig} />
        )}
        {step === 6 && <MetadataStep  form={form} onChange={handleChange} />}
        {step === 7 && <ReviewStep    form={form} onChange={handleChange} />}

        {(configLoading && (step === 3 || step === 5)) && (
          <p className="text-sm text-muted-foreground">Loading protocol config…</p>
        )}
      </div>

      {/* Navigation */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={goBack} disabled={step === 0 || submitting}>
          Back
        </Button>

        {isLastStep ? (
          <Button onClick={advance} disabled={submitting || !address || !protocolConfig || !canGoForward}>
            {busy      ? <><Spinner className="mr-2 h-4 w-4" />Submitting…</>
            : isWaiting ? <><Spinner className="mr-2 h-4 w-4" />Confirming…</>
            : 'Create Auction'}
          </Button>
        ) : (
          <Button onClick={goNext} disabled={!canGoForward}>
            Next
          </Button>
        )}
      </div>
    </div>
  );
}
