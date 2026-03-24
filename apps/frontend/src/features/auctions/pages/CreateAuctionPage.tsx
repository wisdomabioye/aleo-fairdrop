import { useState }              from 'react';
import { useNavigate }           from 'react-router-dom';
import { useWallet }             from '@provablehq/aleo-wallet-adaptor-react';
import { Button }                from '@/components';
import { getAleoClient }         from '@fairdrop/sdk/client';
import { AuctionType }           from '@fairdrop/types/domain';
import { config }                from '@/env';
import { parseExecutionError }   from '@/shared/utils/errors';
import { useProtocolConfig }     from '../hooks/useProtocolConfig';
import { TypeStep }              from '../wizard-steps/TypeStep';
import { TokenStep }             from '../wizard-steps/TokenStep';
import { PricingStep }           from '../wizard-steps/PricingStep';
import { TimingStep }            from '../wizard-steps/TimingStep';
import { GateVestStep }          from '../wizard-steps/GateVestStep';
import { ReferralStep }          from '../wizard-steps/ReferralStep';
import { MetadataStep }          from '../wizard-steps/MetadataStep';
import { ReviewStep }            from '../wizard-steps/ReviewStep';
import { DEFAULT_FORM, DEFAULT_PRICING } from '../wizard-steps/types';
import { buildCreateAuctionInputs }      from '../wizard-steps/build-inputs';
import type { WizardForm }       from '../wizard-steps/types';

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

function canAdvance(step: number, form: WizardForm): boolean {
  switch (step) {
    case 0: return form.auctionType !== null;
    case 1: return !!form.saleTokenId && !!form.supply;
    case 2: return form.pricing !== null;
    case 3: {
      const start = parseInt(form.startBlock);
      const end   = parseInt(form.endBlock);
      return start > 0 && end > start;
    }
    case 4: {
      if (form.gateMode === 1 && (!form.merkleRoot || form.merkleRoot === '0field')) return false;
      if (form.gateMode === 2 && !form.issuerAddress) return false;
      return true;
    }
    case 5: return true; // referral is display-only
    case 6: {
      // Metadata must be saved to IPFS
      return !!form.metadataName.trim()
        && !!form.metadataDescription.trim()
        && !!form.metadataHash
        && form.metadataHash !== '0field';
    }
    case 7: return true; // review
    default: return true;
  }
}

// ── component ─────────────────────────────────────────────────────────────────

export function CreateAuctionPage() {
  const navigate = useNavigate();
  const { executeTransaction, address } = useWallet();
  const { data: protocolConfig, isLoading: configLoading } = useProtocolConfig();

  const [step,   setStep]   = useState(0);
  const [form,   setForm]   = useState<WizardForm>(DEFAULT_FORM);
  const [txId,   setTxId]   = useState<string | null>(null);
  const [error,  setError]  = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleChange(updates: Partial<WizardForm>) {
    setForm((prev) => {
      const next = { ...prev, ...updates };
      // When auction type changes, reset pricing to defaults for that type
      if ('auctionType' in updates && updates.auctionType && updates.auctionType !== prev.auctionType) {
        next.pricing = DEFAULT_PRICING[updates.auctionType as AuctionType] ?? null;
      }
      return next;
    });
  }

  function goNext() {
    if (step < STEPS.length - 1) setStep((s) => s + 1);
  }

  function goBack() {
    setError(null);
    if (step > 0) setStep((s) => s - 1);
  }

  async function handleSubmit() {
    if (!protocolConfig) return;
    if (!address) { setError('Connect your wallet first.'); return; }

    setError(null);
    setSubmitting(true);

    try {
      // Fetch current creator nonce from on-chain mapping
      const programEntry = form.auctionType
        ? config.programs[form.auctionType as keyof typeof config.programs]
        : null;
      if (!programEntry) throw new Error('No program for selected auction type.');

      let nonce = 0n;
      try {
        const raw = await getAleoClient().getProgramMappingValue(
          programEntry.programId,
          'creator_nonces',
          address,
        );
        if (raw) nonce = BigInt(String(raw).replace('u64', '').trim());
      } catch {
        // mapping value missing means 0 — no auctions created yet
      }

      const tx = buildCreateAuctionInputs(form, nonce, protocolConfig, config);
      // Wallet adaptor types inputs as string[] but handles record objects at runtime
      const result = await executeTransaction({
        ...tx,
        inputs: tx.inputs as string[],
      });

      if (!result?.transactionId) {
        throw new Error('Transaction was rejected by the wallet.');
      }

      setTxId(result.transactionId);
    } catch (err) {
      setError(parseExecutionError(err instanceof Error ? err.message : String(err)));
    } finally {
      setSubmitting(false);
    }
  }

  // ── render ─────────────────────────────────────────────────────────────────

  if (txId) {
    return (
      <div className="max-w-lg mx-auto mt-16 text-center space-y-4">
        <p className="text-2xl">Auction submitted</p>
        <p className="text-sm text-muted-foreground">
          Transaction <span className="font-mono text-xs break-all">{txId}</span> is being
          finalized on-chain. It may take a few minutes to appear.
        </p>
        <div className="flex gap-3 justify-center">
          <Button variant="outline" onClick={() => navigate('/auctions')}>
            View auctions
          </Button>
          <Button onClick={() => { setForm(DEFAULT_FORM); setStep(0); setTxId(null); }}>
            Create another
          </Button>
        </div>
      </div>
    );
  }

  const isLastStep   = step === STEPS.length - 1;
  const canGoForward = canAdvance(step, form);

  return (
    <div className="max-w-2xl mx-auto space-y-6 py-6 px-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold">Create Auction</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Step {step + 1} of {STEPS.length} — {STEPS[step].label}
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex gap-1">
        {STEPS.map((s, i) => (
          <button
            key={s.id}
            onClick={() => {
              // Only allow jumping back to completed steps
              if (i < step) setStep(i);
            }}
            className={[
              'h-1.5 flex-1 rounded-full transition-colors',
              i < step  ? 'bg-primary cursor-pointer' :
              i === step ? 'bg-primary/60' :
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

      {/* Error */}
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {/* Navigation */}
      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={goBack}
          disabled={step === 0 || submitting}
        >
          Back
        </Button>

        {isLastStep ? (
          <Button
            onClick={handleSubmit}
            disabled={submitting || !address || !protocolConfig}
          >
            {submitting ? 'Submitting…' : 'Create Auction'}
          </Button>
        ) : (
          <Button
            onClick={goNext}
            disabled={!canGoForward}
          >
            Next
          </Button>
        )}
      </div>
    </div>
  );
}
