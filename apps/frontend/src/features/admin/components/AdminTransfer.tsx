import { useState } from 'react';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { Button, Input, Label } from '@/components';
import { WizardTxStatus }          from '@/shared/components/WizardTxStatus';
import { useConfirmedSequentialTx } from '@/shared/hooks/useConfirmedSequentialTx';
import { config, TX_DEFAULT_FEE }  from '@/env';

const CFG_PROGRAM = config.programs.config.programId;

export function AdminTransfer() {
  const { executeTransaction } = useWallet();

  const [newAdmin,        setNewAdmin]        = useState('');
  const [newAdminConfirm, setNewAdminConfirm] = useState('');
  const [validationErr,   setValidationErr]   = useState('');

  const steps = [{
    label: 'Transfer Protocol Admin',
    execute: async () => {
      const result = await executeTransaction({
        program:    CFG_PROGRAM,
        function:   'set_protocol_admin',
        inputs:     [newAdmin],
        fee:        TX_DEFAULT_FEE,
        privateFee: false,
      });
      return result?.transactionId;
    },
  }];

  const { done, busy, isWaiting, error, trackedIds, advance, reset } =
    useConfirmedSequentialTx(steps);

  const blocked = busy || isWaiting;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setValidationErr('');
    if (!newAdmin.startsWith('aleo1')) {
      setValidationErr('Address must start with aleo1.');
      return;
    }
    if (newAdmin !== newAdminConfirm) {
      setValidationErr('Addresses do not match — type both carefully.');
      return;
    }
    advance();
  }

  function handleReset() {
    reset();
    setNewAdmin('');
    setNewAdminConfirm('');
    setValidationErr('');
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md bg-destructive/10 border border-destructive/30 p-3 text-xs text-destructive space-y-1">
        <p className="font-semibold">Irreversible single-step transfer.</p>
        <p>
          Entering the wrong address permanently locks out the current admin.
          The only recovery path is a contract upgrade via the{' '}
          <code className="font-mono">@admin</code> deployer key.
          Transfer to a multisig before mainnet.
        </p>
      </div>

      {done ? (
        <div className="space-y-3">
          <p className="text-xs text-emerald-600 dark:text-emerald-400">
            Transfer submitted — confirm on-chain before disconnecting.
          </p>
          <WizardTxStatus trackedIds={trackedIds} />
          <Button size="sm" variant="outline" onClick={handleReset}>Transfer again</Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="new-admin">New Admin Address</Label>
            <Input
              id="new-admin"
              placeholder="aleo1…"
              value={newAdmin}
              onChange={(e) => setNewAdmin(e.target.value)}
              className="font-mono text-sm"
              disabled={blocked}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="new-admin-confirm">Confirm New Admin Address</Label>
            <Input
              id="new-admin-confirm"
              placeholder="aleo1…"
              value={newAdminConfirm}
              onChange={(e) => setNewAdminConfirm(e.target.value)}
              className="font-mono text-sm"
              disabled={blocked}
            />
          </div>

          {validationErr && <p className="text-xs text-destructive">{validationErr}</p>}
          {error         && <p className="text-xs text-destructive">{error.message}</p>}

          <WizardTxStatus trackedIds={trackedIds} />

          <Button
            type="submit"
            variant="destructive"
            size="sm"
            disabled={blocked || !newAdmin || !newAdminConfirm || newAdmin !== newAdminConfirm}
          >
            {busy      ? 'Transferring…'
            : isWaiting ? 'Awaiting confirmation…'
            : 'Transfer Admin'}
          </Button>
        </form>
      )}
    </div>
  );
}
