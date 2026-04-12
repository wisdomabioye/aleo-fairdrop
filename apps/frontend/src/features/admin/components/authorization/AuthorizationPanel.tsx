import { useState, useMemo }             from 'react';
import { useQueryClient }                from '@tanstack/react-query';
import { useWallet }                     from '@provablehq/aleo-wallet-adaptor-react';
import { Button, Spinner }               from '@/components';
import { WizardTxStatus }                from '@/shared/components/WizardTxStatus';
import { computeAllowedCallerOpHash, generateNonce } from '@fairdrop/sdk/hash';
import { prepareApproveOp, submitApproveOp }         from '@fairdrop/sdk/multisig';
import {
  setGateAllowedCaller,
  setRefAllowedCaller,
  setProofAllowedCaller,
  setVestAllowedCaller,
}                                        from '@fairdrop/sdk/transactions';
import { useConfirmedSequentialTx }      from '@/shared/hooks/useConfirmedSequentialTx';
import { SignaturePanel, sigsComplete }  from '../shared/SignaturePanel';
import { MsgHashPanel }                  from '../shared/MsgHashPanel';
import {
  useCallerStatus,
  AUCTION_CALLERS,
  type UtilityKey,
}                                        from '../../hooks/useCallerStatus';
import { EMPTY_SIGS, type ThreeSigs }    from '../../types';
import { config }                        from '@/env';

// ── Utility metadata ──────────────────────────────────────────────────────────

const UTILITIES: { key: UtilityKey; label: string; programId: string }[] = [
  { key: 'gate',  label: 'Gate',  programId: config.programs.gate.programId  },
  { key: 'ref',   label: 'Ref',   programId: config.programs.ref.programId   },
  { key: 'proof', label: 'Proof', programId: config.programs.proof.programId },
  { key: 'vest',  label: 'Vest',  programId: config.programs.vest.programId  },
];

const SET_CALLER_BUILDERS: Record<UtilityKey, (addr: string, allowed: boolean, nonce: bigint) => ReturnType<typeof setGateAllowedCaller>> = {
  gate:  (addr, allowed, nonce) => setGateAllowedCaller(addr, allowed, nonce),
  ref:   (addr, allowed, nonce) => setRefAllowedCaller(addr, allowed, nonce),
  proof: (addr, allowed, nonce) => setProofAllowedCaller(addr, allowed, nonce),
  vest:  (addr, allowed, nonce) => setVestAllowedCaller(addr, allowed, nonce),
};

// ── Per-auction row ────────────────────────────────────────────────────────────

interface AuctionRowProps {
  auctionLabel:   string;
  auctionAddress: string;
  status:         Record<UtilityKey, boolean>;
  onSuccess:      () => void;
}

function AuctionRow({ auctionLabel, auctionAddress, status, onSuccess }: AuctionRowProps) {
  const { executeTransaction }   = useWallet();
  const [open, setOpen]          = useState(false);
  const [sigs, setSigs]          = useState<ThreeSigs>(EMPTY_SIGS);

  const missing = UTILITIES.filter((u) => !status[u.key]);
  const allAuthorized = missing.length === 0;

  // Defer nonce generation and WASM hashing until the row is expanded.
  const nonces = useMemo(
    () => open ? missing.map(() => ({ opNonce: generateNonce(), requestId: generateNonce() })) : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open && missing.length],
  );

  const opEntries = useMemo(
    () => {
      if (!open) return [];
      return missing.map((u, i) => {
        const opHash   = computeAllowedCallerOpHash(auctionAddress, true, nonces[i]!.opNonce);
        const { msgHash } = prepareApproveOp(opHash, nonces[i]!.requestId);
        return { utility: u, opHash, msgHash, ...nonces[i]! };
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, missing, nonces, auctionAddress],
  );

  // Sequential steps: for each missing utility → approve_op then set_allowed_caller.
  const steps = useMemo(
    () =>
      opEntries.flatMap(({ utility, opHash, requestId, opNonce }) => [
        {
          label: `Approve ${utility.label}`,
          execute: async () => {
            const spec = submitApproveOp(
              opHash,
              sigs[0].sig, sigs[0].admin,
              sigs[1].sig, sigs[1].admin,
              sigs[2].sig, sigs[2].admin,
              requestId,
            );
            const result = await executeTransaction({ ...spec, inputs: spec.inputs as string[] });
            return result?.transactionId;
          },
        },
        {
          label: `Set ${utility.label} caller`,
          execute: async () => {
            const spec = SET_CALLER_BUILDERS[utility.key](auctionAddress, true, opNonce);
            const result = await executeTransaction({ ...spec, inputs: spec.inputs as string[] });
            return result?.transactionId;
          },
        },
      ]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [opEntries, sigs, auctionAddress],
  );

  const { busy, isWaiting, done, error, trackedIds, advance, reset } =
    useConfirmedSequentialTx(steps);

  if (done) {
    onSuccess();
    reset();
    setSigs(EMPTY_SIGS);
    setOpen(false);
  }

  const canSubmit = sigsComplete(sigs) && !busy && !isWaiting;

  return (
    <div className="space-y-2 border-b border-border/50 pb-3 last:border-0 last:pb-0">
      <div className="flex items-center gap-3 flex-wrap">
        {/* Auction label */}
        <p className="w-24 shrink-0 text-sm font-medium">{auctionLabel}</p>

        {/* Status cells */}
        <div className="flex gap-4 flex-1">
          {UTILITIES.map((u) => (
            <div key={u.key} className="flex flex-col items-center gap-0.5 min-w-[44px]">
              <span className="text-[10px] text-muted-foreground">{u.label}</span>
              <span className={`text-sm font-semibold ${status[u.key] ? 'text-emerald-500' : 'text-destructive'}`}>
                {status[u.key] ? '✓' : '✗'}
              </span>
            </div>
          ))}
        </div>

        {/* Action */}
        <div className="shrink-0">
          {allAuthorized ? (
            <span className="text-xs text-muted-foreground">All authorized</span>
          ) : (
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setOpen((o) => !o)}>
              {open ? 'Cancel' : `Authorize ${missing.length} missing`}
            </Button>
          )}
        </div>
      </div>

      {open && (
        <div className="rounded-lg border border-border/70 bg-muted/20 p-3 space-y-3">
          {/* Show a combined msgHash — all ops share the same sigs. */}
          <div className="space-y-2">
            {opEntries.map((e) => (
              <MsgHashPanel key={e.utility.key} msgHash={e.msgHash} />
            ))}
            <p className="text-[11px] text-amber-600 dark:text-amber-400">
              The same 3 signatures are reused across all {missing.length} utilities.
              Admins must sign each hash separately.
            </p>
          </div>

          <SignaturePanel value={sigs} onChange={setSigs} />

          {trackedIds.length > 0 && <WizardTxStatus trackedIds={trackedIds} />}
          {error && <p className="text-xs text-destructive">{error.message}</p>}

          <Button size="sm" className="w-full" disabled={!canSubmit} onClick={() => void advance()}>
            {busy || isWaiting
              ? <><Spinner className="mr-1.5 h-3 w-3" />Processing…</>
              : `Authorize on all ${missing.length} missing utilities`}
          </Button>
        </div>
      )}
    </div>
  );
}

// ── AuthorizationPanel ────────────────────────────────────────────────────────

export function AuthorizationPanel() {
  const queryClient              = useQueryClient();
  const { data: grid, isLoading } = useCallerStatus();

  if (isLoading) return <div className="flex justify-center py-8"><Spinner className="h-5 w-5" /></div>;
  if (!grid)     return <p className="text-sm text-muted-foreground">Could not load authorization status.</p>;

  const rowStatus = (address: string): Record<UtilityKey, boolean> => ({
    gate:  grid.gate[address]  ?? false,
    ref:   grid.ref[address]   ?? false,
    proof: grid.proof[address] ?? false,
    vest:  grid.vest[address]  ?? false,
  });

  return (
    <div className="space-y-1">
      {/* Column headers */}
      <div className="flex items-center gap-3 pb-2 border-b border-border/50">
        <div className="w-24 shrink-0" />
        <div className="flex gap-4 flex-1">
          {UTILITIES.map((u) => (
            <p key={u.key} className="min-w-[44px] text-[11px] font-semibold text-muted-foreground">{u.label}</p>
          ))}
        </div>
      </div>

      {AUCTION_CALLERS.map((a) => (
        <AuctionRow
          key={a.address}
          auctionLabel={a.label}
          auctionAddress={a.address}
          status={rowStatus(a.address)}
          onSuccess={() => queryClient.invalidateQueries({ queryKey: ['callerStatus'] })}
        />
      ))}
    </div>
  );
}
