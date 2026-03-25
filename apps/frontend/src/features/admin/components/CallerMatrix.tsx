import { useState, useEffect, useCallback } from 'react';
import { useWallet }   from '@provablehq/aleo-wallet-adaptor-react';
import { Button, Spinner, Input, Label } from '@/components';
import { getAleoClient } from '@fairdrop/sdk/client';
import { AuctionType }   from '@fairdrop/types/domain';
import { config, TX_DEFAULT_FEE } from '@/env';
import { WizardTxStatus }          from '@/shared/components/WizardTxStatus';
import { useConfirmedSequentialTx } from '@/shared/hooks/useConfirmedSequentialTx';

// ── Registries ────────────────────────────────────────────────────────────────

const UTILITIES = [
  { key: 'gate',  label: 'Gate',  programId: config.programs.gate.programId  },
  { key: 'ref',   label: 'Ref',   programId: config.programs.ref.programId   },
  { key: 'vest',  label: 'Vest',  programId: config.programs.vest.programId  },
  { key: 'proof', label: 'Proof', programId: config.programs.proof.programId },
] as const;

type UtilityKey = typeof UTILITIES[number]['key'];

const KNOWN_AUCTIONS = [
  { type: AuctionType.Dutch,     label: 'Dutch',     programAddress: config.programs.dutch.programAddress     },
  { type: AuctionType.Sealed,    label: 'Sealed',    programAddress: config.programs.sealed.programAddress    },
  { type: AuctionType.Raise,     label: 'Raise',     programAddress: config.programs.raise.programAddress     },
  { type: AuctionType.Ascending, label: 'Ascending', programAddress: config.programs.ascending.programAddress },
  { type: AuctionType.Lbp,       label: 'LBP',       programAddress: config.programs.lbp.programAddress       },
  { type: AuctionType.Quadratic, label: 'Quadratic', programAddress: config.programs.quadratic.programAddress },
] as const;

// ── Types ─────────────────────────────────────────────────────────────────────

interface AuctionRow {
  label:          string;
  programAddress: string;
  status:         Record<UtilityKey, boolean | null>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function readAllowed(utilityProgramId: string, auctionProgramAddress: string): Promise<boolean> {
  try {
    const raw = await getAleoClient().getProgramMappingValue(
      utilityProgramId, 'allowed_callers', auctionProgramAddress,
    );
    return String(raw).trim() === 'true';
  } catch {
    return false;
  }
}

async function loadRowStatus(programAddress: string): Promise<Record<UtilityKey, boolean>> {
  const results = await Promise.all(UTILITIES.map((u) => readAllowed(u.programId, programAddress)));
  return Object.fromEntries(UTILITIES.map((u, i) => [u.key, results[i]])) as Record<UtilityKey, boolean>;
}

// ── AuctionAuthRow ────────────────────────────────────────────────────────────

interface AuctionAuthRowProps {
  row:      AuctionRow;
  onUpdate: (programAddress: string, utilityKey: UtilityKey, allowed: boolean) => void;
}

function AuctionAuthRow({ row, onUpdate }: AuctionAuthRowProps) {
  const { executeTransaction } = useWallet();

  const missingUtilities = UTILITIES.filter((u) => row.status[u.key] !== true);
  const allAuthorized    = missingUtilities.length === 0;

  // One step per missing utility — confirms each before submitting the next.
  // IMPORTANT: execute must NOT call onUpdate — doing so shrinks missingUtilities,
  // which shrinks steps mid-sequence, causing the stepsRef to point to wrong indices.
  const steps = missingUtilities.map((u) => ({
    label: `Authorize ${row.label} on ${u.label}`,
    execute: async () => {
      const result = await executeTransaction({
        program:    u.programId,
        function:   'set_allowed_caller',
        inputs:     [row.programAddress, 'true'],
        fee:        TX_DEFAULT_FEE,
        privateFee: false,
      });
      return result?.transactionId;
    },
  }));

  const { currentStep, done, busy, isWaiting, error, trackedIds, advance } =
    useConfirmedSequentialTx(steps);

  // Auto-advance: after each confirmation, kick off the next step without user interaction
  useEffect(() => {
    if (currentStep > 0 && !done && !busy && !isWaiting) {
      advance();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep]);

  // After all steps confirmed, reload the actual on-chain status and update parent
  useEffect(() => {
    if (!done) return;
    loadRowStatus(row.programAddress).then((status) => {
      UTILITIES.forEach((u) => onUpdate(row.programAddress, u.key, status[u.key]));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  const inProgress = busy || isWaiting || (trackedIds.length > 0 && !done);

  return (
    <div className="py-3 border-b border-border last:border-0 space-y-2">
      <div className="flex items-center gap-3 flex-wrap">
        {/* Auction label */}
        <div className="w-24 shrink-0">
          <p className="text-sm font-medium">{row.label}</p>
          <p className="text-[10px] text-muted-foreground font-mono truncate">
            {row.programAddress.slice(0, 12)}…
          </p>
        </div>

        {/* Status per utility */}
        <div className="flex gap-3 flex-1">
          {UTILITIES.map((u) => {
            const status = row.status[u.key];
            return (
              <div key={u.key} className="flex flex-col items-center gap-0.5 min-w-[40px]">
                <p className="text-[10px] text-muted-foreground">{u.label}</p>
                {status === null ? (
                  <Spinner className="h-3 w-3" />
                ) : (
                  <span className={`text-sm font-medium ${
                    status ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'
                  }`}>
                    {status ? '✓' : '✗'}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Action */}
        <div className="flex flex-col items-end gap-1 shrink-0">
          {allAuthorized ? (
            <span className="text-xs text-muted-foreground">Authorized</span>
          ) : done ? (
            <span className="text-xs text-emerald-600 dark:text-emerald-400">All authorized ✓</span>
          ) : (
            <Button size="sm" variant="outline" disabled={inProgress} onClick={advance}>
              {busy      ? <><Spinner className="mr-1.5 h-3 w-3" />Authorizing…</>
              : isWaiting ? <><Spinner className="mr-1.5 h-3 w-3" />Confirming…</>
              : missingUtilities.length === UTILITIES.length
                ? 'Authorize on All'
                : `Authorize ${missingUtilities.length} Missing`}
            </Button>
          )}
          {error && <p className="text-xs text-destructive max-w-[160px] text-right">{error.message}</p>}
        </div>
      </div>

      {trackedIds.length > 0 && <WizardTxStatus trackedIds={trackedIds} />}
    </div>
  );
}

// ── CallerMatrix ──────────────────────────────────────────────────────────────

export function CallerMatrix() {
  const { executeTransaction } = useWallet();

  const [rows,       setRows]       = useState<AuctionRow[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [customAddr, setCustomAddr] = useState('');
  const [addError,   setAddError]   = useState('');

  // Custom address: authorize on all 4 utilities sequentially
  const customSteps = UTILITIES.map((u) => ({
    label: `Authorize custom on ${u.label}`,
    execute: async () => {
      const addr = customAddr.trim();
      const result = await executeTransaction({
        program:    u.programId,
        function:   'set_allowed_caller',
        inputs:     [addr, 'true'],
        fee:        TX_DEFAULT_FEE,
        privateFee: false,
      });
      return result?.transactionId;
    },
  }));

  const {
    currentStep: customStep,
    done:        customDone,
    busy:        customBusy,
    isWaiting:   customWaiting,
    error:       customError,
    trackedIds:  customTrackedIds,
    advance:     customAdvance,
    reset:       customReset,
  } = useConfirmedSequentialTx(customSteps);

  // Auto-advance custom authorization after each step confirms
  useEffect(() => {
    if (customStep > 0 && !customDone && !customBusy && !customWaiting) {
      customAdvance();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customStep]);

  // After all 4 custom utilities confirmed, add row to matrix
  useEffect(() => {
    if (!customDone) return;
    const addr = customAddr.trim();
    if (!addr) return;
    loadRowStatus(addr).then((status) => {
      setRows((prev) => [...prev, { label: addr.slice(0, 8) + '…', programAddress: addr, status }]);
      customReset();
      setCustomAddr('');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customDone]);

  const loadRows = useCallback(async () => {
    setLoading(true);
    const loaded = await Promise.all(
      KNOWN_AUCTIONS
        .filter((p) => !!p.programAddress)
        .map(async (a) => ({
          label:          a.label,
          programAddress: a.programAddress as string,
          status:         await loadRowStatus(a.programAddress as string),
        })),
    );
    setRows(loaded);
    setLoading(false);
  }, []);

  useEffect(() => { loadRows(); }, [loadRows]);

  function handleUpdate(programAddress: string, utilityKey: UtilityKey, allowed: boolean) {
    setRows((prev) => prev.map((r) =>
      r.programAddress === programAddress
        ? { ...r, status: { ...r.status, [utilityKey]: allowed } }
        : r,
    ));
  }

  function handleAddCustom() {
    const addr = customAddr.trim();
    setAddError('');
    if (!addr.startsWith('aleo1')) { setAddError('Must be a valid aleo1… program address.'); return; }
    if (rows.some((r) => r.programAddress === addr)) { setAddError('Already in the list.'); return; }
    customAdvance();
  }

  const customBlocked = customBusy || customWaiting;

  if (loading) {
    return <div className="flex justify-center py-6"><Spinner className="h-5 w-5" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center gap-3">
        <div className="w-24 shrink-0" />
        <div className="flex gap-3 flex-1">
          {UTILITIES.map((u) => (
            <div key={u.key} className="min-w-[40px] text-[10px] text-muted-foreground font-medium">
              {u.label}
            </div>
          ))}
        </div>
        <div className="w-28 shrink-0" />
      </div>

      {rows.map((row) => (
        <AuctionAuthRow key={row.programAddress} row={row} onUpdate={handleUpdate} />
      ))}

      {/* Add custom auction contract */}
      <div className="pt-3 border-t border-border space-y-2">
        <Label className="text-xs text-muted-foreground">
          Authorize a new auction contract address on all 4 utilities
        </Label>
        <div className="flex items-center gap-2 flex-wrap">
          <Input
            className="flex-1 h-8 text-sm font-mono"
            placeholder="aleo1… (program address)"
            value={customAddr}
            onChange={(e) => setCustomAddr(e.target.value)}
            disabled={customBlocked}
          />
          <Button size="sm" disabled={customBlocked || !customAddr.trim()} onClick={handleAddCustom}>
            {customBusy      ? <><Spinner className="mr-1.5 h-3 w-3" />Authorizing…</>
            : customWaiting  ? <><Spinner className="mr-1.5 h-3 w-3" />Confirming…</>
            : 'Authorize on All'}
          </Button>
        </div>
        {addError    && <p className="text-xs text-destructive">{addError}</p>}
        {customError && <p className="text-xs text-destructive">{customError.message}</p>}
        {customTrackedIds.length > 0 && <WizardTxStatus trackedIds={customTrackedIds} />}
      </div>
    </div>
  );
}
