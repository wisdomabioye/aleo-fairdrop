import { useState, useEffect, useCallback } from 'react';
import { useWallet }          from '@provablehq/aleo-wallet-adaptor-react';
import { Button, Spinner, Input, Label } from '@fairdrop/ui';
import { getAleoClient }      from '@fairdrop/sdk/client';
import { AuctionType }        from '@fairdrop/types/domain';
import { config }             from '@/env';
import { parseExecutionError } from '@/shared/utils/errors';
import { useTransactionStore } from '@/stores/transaction.store';

// ── registries ────────────────────────────────────────────────────────────────

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

// ── types ─────────────────────────────────────────────────────────────────────

interface AuctionRow {
  label:          string;
  programAddress: string;
  /** null = still loading */
  status:         Record<UtilityKey, boolean | null>;
}

// ── helpers ───────────────────────────────────────────────────────────────────

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
  const results = await Promise.all(
    UTILITIES.map((u) => readAllowed(u.programId, programAddress)),
  );
  return Object.fromEntries(
    UTILITIES.map((u, i) => [u.key, results[i]]),
  ) as Record<UtilityKey, boolean>;
}

// ── AuctionAuthRow ────────────────────────────────────────────────────────────

interface AuctionAuthRowProps {
  row:      AuctionRow;
  onUpdate: (programAddress: string, utilityKey: UtilityKey, allowed: boolean) => void;
}

function AuctionAuthRow({ row, onUpdate }: AuctionAuthRowProps) {
  const { executeTransaction } = useWallet();
  const { setTx }              = useTransactionStore();
  const [busy,  setBusy]       = useState(false);
  const [error, setError]      = useState('');

  const missingUtilities = UTILITIES.filter((u) => row.status[u.key] !== true);
  const allAuthorized    = missingUtilities.length === 0;

  async function authorizeOnUtility(utilityKey: UtilityKey, utilityProgramId: string) {
    const result = await executeTransaction({
      program:  utilityProgramId,
      function: 'set_allowed_caller',
      inputs:   [row.programAddress, 'true'],
      fee:      0.05,
    });
    if (result?.transactionId) {
      setTx(result.transactionId, `Authorize ${row.label} on ${utilityKey}`);
      onUpdate(row.programAddress, utilityKey, true);
    }
  }

  async function handleAuthorize() {
    setError('');
    setBusy(true);
    try {
      for (const u of missingUtilities) {
        await authorizeOnUtility(u.key, u.programId);
      }
    } catch (err) {
      setError(parseExecutionError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3 py-3 border-b border-border last:border-0 flex-wrap">
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
                  status
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-destructive'
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
        ) : (
          <Button size="sm" variant="outline" disabled={busy} onClick={handleAuthorize}>
            {busy
              ? <><Spinner className="mr-1.5 h-3 w-3" />Authorizing…</>
              : missingUtilities.length === UTILITIES.length
                ? 'Authorize on All'
                : `Authorize ${missingUtilities.length} Missing`}
          </Button>
        )}
        {error && <p className="text-xs text-destructive max-w-[160px] text-right">{error}</p>}
      </div>
    </div>
  );
}

// ── CallerMatrix ──────────────────────────────────────────────────────────────

export function CallerMatrix() {
  const { executeTransaction } = useWallet();
  const { setTx }              = useTransactionStore();

  const [rows,       setRows]       = useState<AuctionRow[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [customAddr, setCustomAddr] = useState('');
  const [addBusy,    setAddBusy]    = useState(false);
  const [addError,   setAddError]   = useState('');

  const loadRows = useCallback(async () => {
    setLoading(true);
    const loaded = await Promise.all(
      KNOWN_AUCTIONS.map(async (a) => ({
        label:          a.label,
        programAddress: a.programAddress,
        status:         await loadRowStatus(a.programAddress),
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

  async function handleAddCustom() {
    const addr = customAddr.trim();
    if (!addr.startsWith('aleo1')) {
      setAddError('Must be a valid aleo1… program address.');
      return;
    }
    if (rows.some((r) => r.programAddress === addr)) {
      setAddError('Already in the list.');
      return;
    }
    setAddError('');
    setAddBusy(true);
    try {
      for (const u of UTILITIES) {
        const result = await executeTransaction({
          program:  u.programId,
          function: 'set_allowed_caller',
          inputs:   [addr, 'true'],
          fee:      0.05,
        });
        if (result?.transactionId) setTx(result.transactionId, `Authorize custom on ${u.label}`);
      }
      const status = await loadRowStatus(addr);
      setRows((prev) => [...prev, { label: addr.slice(0, 8) + '…', programAddress: addr, status }]);
      setCustomAddr('');
    } catch (err) {
      setAddError(parseExecutionError(err));
    } finally {
      setAddBusy(false);
    }
  }

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

      {/* Known auction rows */}
      {rows.map((row) => (
        <AuctionAuthRow
          key={row.programAddress}
          row={row}
          onUpdate={handleUpdate}
        />
      ))}

      {/* Add a new/custom auction contract */}
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
          />
          <Button
            size="sm"
            disabled={addBusy || !customAddr.trim()}
            onClick={handleAddCustom}
          >
            {addBusy
              ? <><Spinner className="mr-1.5 h-3 w-3" />Authorizing…</>
              : 'Authorize on All'}
          </Button>
        </div>
        {addError && <p className="text-xs text-destructive">{addError}</p>}
      </div>
    </div>
  );
}
