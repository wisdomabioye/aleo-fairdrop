import { useState, useRef, useCallback } from 'react';
import { useWallet }                     from '@provablehq/aleo-wallet-adaptor-react';
import { AuctionType }                   from '@fairdrop/types/domain';
import { useLocalStorage }               from '@/shared/hooks/useLocalStorage';
import { DEFAULT_FORM, DEFAULT_PRICING } from '../wizard-steps/types';
import type { WizardForm }               from '../wizard-steps/types';

// ── volatile fields ────────────────────────────────────────────────────────────
//
// These are stripped before writing to localStorage — they must NOT survive sessions:
//   tokenRecord      — wallet record string; bound to the current wallet session.
//   metadataHash     — computed on submit from the uploaded IPFS payload.
//   metadataIpfsCid  — same; set right before calling executeTransaction.
//
const VOLATILE_DEFAULTS = {
  tokenRecord:     DEFAULT_FORM.tokenRecord,
  metadataHash:    DEFAULT_FORM.metadataHash,
  metadataIpfsCid: DEFAULT_FORM.metadataIpfsCid,
} as const;

function stripVolatile(form: WizardForm): WizardForm {
  return { ...form, ...VOLATILE_DEFAULTS };
}

// ── persisted draft shape ─────────────────────────────────────────────────────

interface DraftState {
  form:    WizardForm; // volatile fields are always null/'' here
  step:    number;
  savedAt: number;     // Unix ms — available if you ever want to expire stale drafts
}

const EMPTY_DRAFT: DraftState = {
  form:    DEFAULT_FORM,
  step:    0,
  savedAt: 0,
};

function isMeaningful(state: DraftState): boolean {
  return (
    state.savedAt > 0 &&
    (state.form.auctionType !== null ||
     !!state.form.saleTokenId        ||
     !!state.form.metadataName.trim())
  );
}

function applyAuctionType(current: WizardForm, updates: Partial<WizardForm>): WizardForm {
  const next = { ...current, ...updates };
  if (
    'auctionType' in updates &&
    updates.auctionType &&
    updates.auctionType !== current.auctionType
  ) {
    next.pricing = DEFAULT_PRICING[updates.auctionType as AuctionType] ?? null;
  }
  return next;
}

// ── public interface ──────────────────────────────────────────────────────────

export interface DraftAuction {
  form:       WizardForm;
  step:       number;
  /** True once per session if a draft was found on mount. Stable reference. */
  isRestored: boolean;
  /** True while any meaningful draft data exists in storage. */
  hasDraft:   boolean;
  setStep:    (s: number | ((prev: number) => number)) => void;
  update:     (updates: Partial<WizardForm>) => void;
  clearDraft: () => void;
}

// ── hook ──────────────────────────────────────────────────────────────────────

/**
 * Manages wizard form + step with transparent localStorage persistence.
 *
 * Two-layer design:
 *   liveForm / liveStep — full in-memory state (includes tokenRecord).
 *   persisted           — localStorage snapshot with volatile fields stripped.
 *
 * This means selecting a token works normally in-session, but tokenRecord is
 * never written to disk (it's a wallet-session-bound string).
 */
export function useDraftAuction(): DraftAuction {
  const { address } = useWallet();
  const key = `fairdrop:auction-draft:${address ?? 'anon'}`;

  // Persisted layer — volatile fields are always stripped before writing.
  const [persisted, setPersisted, removePersisted] = useLocalStorage<DraftState>(key, EMPTY_DRAFT);

  // Capture once on mount — stays stable for the lifetime of this instance.
  const isRestored = useRef(isMeaningful(persisted)).current;

  // Live layer — full form, initialized from the persisted snapshot.
  // tokenRecord will be null on restore (as intended).
  const [liveForm, setLiveForm] = useState<WizardForm>(() => persisted.form);
  const [liveStep, setLiveStepState] = useState<number>(() => persisted.step);

  // Refs so update/setStep can read current values without stale closures.
  const liveFormRef = useRef(liveForm);
  liveFormRef.current = liveForm;
  const liveStepRef = useRef(liveStep);
  liveStepRef.current = liveStep;

  const setStep = useCallback(
    (s: number | ((prev: number) => number)) => {
      const next = typeof s === 'function' ? s(liveStepRef.current) : s;
      setLiveStepState(next);
      setPersisted((p) => ({ ...p, step: next, savedAt: Date.now() }));
    },
    [setPersisted],
  );

  const update = useCallback(
    (updates: Partial<WizardForm>) => {
      const next = applyAuctionType(liveFormRef.current, updates);
      setLiveForm(next);
      // Strip volatile fields before persisting — tokenRecord never hits disk.
      setPersisted((p) => ({ ...p, form: stripVolatile(next), savedAt: Date.now() }));
    },
    [setPersisted],
  );

  const clearDraft = useCallback(() => {
    removePersisted();
    setLiveForm(DEFAULT_FORM);
    setLiveStepState(0);
  }, [removePersisted]);

  return {
    form:       liveForm,
    step:       liveStep,
    isRestored,
    hasDraft:   isMeaningful(persisted),
    setStep,
    update,
    clearDraft,
  };
}
