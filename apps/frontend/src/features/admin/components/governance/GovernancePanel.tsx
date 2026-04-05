import { useState }                     from 'react';
import { useQuery }                      from '@tanstack/react-query';
import { useWallet }                     from '@provablehq/aleo-wallet-adaptor-react';
import { Button, Input, Label, Spinner } from '@/components';
import { WizardTxStatus }                from '@/shared/components/WizardTxStatus';
import { generateNonce }                 from '@fairdrop/sdk/hash';
import { fetchIsMultisigInitialized }    from '@fairdrop/sdk/chain';
import {
  prepareUpdateAdmin,
  submitUpdateAdmin,
  initializeMultisig,
}                                        from '@fairdrop/sdk/multisig';
import { useConfirmedSequentialTx }      from '@/shared/hooks/useConfirmedSequentialTx';
import { SignaturePanel, sigsComplete }  from '../shared/SignaturePanel';
import { MsgHashPanel }                  from '../shared/MsgHashPanel';
import { useAdminGate }                  from '../../hooks/useAdminGate';
import { EMPTY_SIGS, type ThreeSigs }    from '../../types';

// ── Initialize ────────────────────────────────────────────────────────────────

function InitializeSection({ onSuccess }: { onSuccess: () => void }) {
  const { executeTransaction } = useWallet();

  const steps = [{
    label: 'Initialize multisig',
    execute: async () => {
      const spec   = initializeMultisig();
      const result = await executeTransaction({ ...spec, inputs: spec.inputs as string[] });
      return result?.transactionId;
    },
  }];

  const { busy, isWaiting, done, error, trackedIds, advance, reset } =
    useConfirmedSequentialTx(steps);

  if (done) { onSuccess(); reset(); }

  return (
    <div className="rounded-lg border border-amber-500/20 bg-amber-500/8 p-3 space-y-2">
      <p className="text-xs font-medium text-amber-700 dark:text-amber-400">One-time bootstrap</p>
      <p className="text-[11px] text-muted-foreground">
        Call initialize() once immediately after deployment to populate the admins mapping
        from the 5 hardcoded ADMIN_* constants.
      </p>
      {trackedIds.length > 0 && <WizardTxStatus trackedIds={trackedIds} />}
      {error && <p className="text-xs text-destructive">{error.message}</p>}
      <Button size="sm" variant="outline" disabled={busy || isWaiting} onClick={() => void advance()}>
        {busy || isWaiting ? <><Spinner className="mr-1.5 h-3 w-3" />Initializing…</> : 'Initialize multisig'}
      </Button>
    </div>
  );
}

// ── Update admin ──────────────────────────────────────────────────────────────

function UpdateAdminSection() {
  const { executeTransaction } = useWallet();
  const [oldAdmin,  setOldAdmin]  = useState('');
  const [newAdmin,  setNewAdmin]  = useState('');
  const [sigs,      setSigs]      = useState<ThreeSigs>(EMPTY_SIGS);
  const [requestId] = useState<bigint>(() => generateNonce());

  const valid = oldAdmin.startsWith('aleo1') && newAdmin.startsWith('aleo1') && oldAdmin !== newAdmin;
  const { msgHash } = valid
    ? prepareUpdateAdmin(oldAdmin, newAdmin, requestId)
    : { msgHash: '' };

  const steps = [{
    label: 'Rotate admin',
    execute: async () => {
      if (!valid) throw new Error('Invalid admin addresses');
      const spec = submitUpdateAdmin(
        oldAdmin, newAdmin,
        sigs[0].sig, sigs[0].admin,
        sigs[1].sig, sigs[1].admin,
        sigs[2].sig, sigs[2].admin,
        requestId,
      );
      const result = await executeTransaction({ ...spec, inputs: spec.inputs as string[] });
      return result?.transactionId;
    },
  }];

  const { busy, isWaiting, done, error, trackedIds, advance, reset } =
    useConfirmedSequentialTx(steps);

  if (done) {
    reset();
    setOldAdmin('');
    setNewAdmin('');
    setSigs(EMPTY_SIGS);
  }

  const canSubmit = valid && sigsComplete(sigs) && !busy && !isWaiting;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Admin to remove</Label>
          <Input
            className="h-7 font-mono text-[11px]"
            placeholder="aleo1…"
            value={oldAdmin}
            onChange={(e) => setOldAdmin(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Replacement admin</Label>
          <Input
            className="h-7 font-mono text-[11px]"
            placeholder="aleo1…"
            value={newAdmin}
            onChange={(e) => setNewAdmin(e.target.value)}
          />
        </div>
      </div>

      {msgHash && (
        <>
          <MsgHashPanel msgHash={msgHash} />
          <SignaturePanel value={sigs} onChange={setSigs} />
        </>
      )}

      {trackedIds.length > 0 && <WizardTxStatus trackedIds={trackedIds} />}
      {error && <p className="text-xs text-destructive">{error.message}</p>}

      <Button size="sm" className="w-full" disabled={!canSubmit} onClick={() => void advance()}>
        {busy || isWaiting
          ? <><Spinner className="mr-1.5 h-3 w-3" />Rotating…</>
          : 'Rotate admin'}
      </Button>
    </div>
  );
}

// ── GovernancePanel ───────────────────────────────────────────────────────────

export function GovernancePanel() {
  const { isAdmin, address, isLoading } = useAdminGate();
  const { data: isInitialized, isLoading: initLoading, refetch: refetchInit } =
    useQuery({ queryKey: ['multisig', 'initialized'], queryFn: fetchIsMultisigInitialized });

  return (
    <div className="space-y-6">
      {/* Current wallet status */}
      <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2.5 space-y-1">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Connected wallet</p>
        <p className="font-mono text-xs">{address ?? '—'}</p>
        {!isLoading && (
          <p className={`text-xs font-medium ${isAdmin ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}>
            {isAdmin ? '✓ Registered multisig admin' : 'Not a registered admin'}
          </p>
        )}
      </div>

      {/* Initialize — only shown when not yet bootstrapped */}
      {!initLoading && !isInitialized && (
        <div className="space-y-2">
          <p className="text-sm font-semibold">Bootstrap</p>
          <InitializeSection onSuccess={() => void refetchInit()} />
        </div>
      )}

      {/* Rotate admin */}
      <div className="space-y-2">
        <p className="text-sm font-semibold">Rotate admin</p>
        <p className="text-[11px] text-muted-foreground">
          Replace one admin address with another. Requires 3-of-5 signatures.
          The outgoing admin may be one of the 3 signers.
        </p>
        <UpdateAdminSection />
      </div>
    </div>
  );
}
