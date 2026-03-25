import { useState }           from 'react';
import { useWallet }           from '@provablehq/aleo-wallet-adaptor-react';
import { Button, Input, Label, Spinner } from '@/components';
import { config, TX_DEFAULT_FEE }              from '@/env';
import { parseExecutionError } from '@/shared/utils/errors';
import { useTransactionStore } from '@/stores/transaction.store';

const CFG_PROGRAM = config.programs.config.programId;

export function AdminTransfer() {
  const { executeTransaction } = useWallet();
  const { setTx }              = useTransactionStore();

  const [newAdmin,        setNewAdmin]        = useState('');
  const [newAdminConfirm, setNewAdminConfirm] = useState('');
  const [busy,            setBusy]            = useState(false);
  const [error,           setError]           = useState('');
  const [done,            setDone]            = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!newAdmin.startsWith('aleo1')) {
      setError('Address must start with aleo1.');
      return;
    }
    if (newAdmin !== newAdminConfirm) {
      setError('Addresses do not match — type both carefully.');
      return;
    }

    setBusy(true);
    try {
      const result = await executeTransaction({
        program:  CFG_PROGRAM,
        function: 'set_protocol_admin',
        inputs:   [newAdmin],
        fee:      TX_DEFAULT_FEE,
        privateFee: false
      });
      if (result?.transactionId) setTx(result.transactionId, 'Transfer protocol admin');
      setDone(true);
      setNewAdmin('');
      setNewAdminConfirm('');
    } catch (err) {
      setError(parseExecutionError(err));
    } finally {
      setBusy(false);
    }
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

      {done && (
        <p className="text-xs text-emerald-600 dark:text-emerald-400">
          Transfer submitted — confirm on-chain before disconnecting.
        </p>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="new-admin">New Admin Address</Label>
          <Input
            id="new-admin"
            placeholder="aleo1…"
            value={newAdmin}
            onChange={(e) => setNewAdmin(e.target.value)}
            className="font-mono text-sm"
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
          />
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}

        <Button
          type="submit"
          variant="destructive"
          size="sm"
          disabled={busy || !newAdmin || !newAdminConfirm || newAdmin !== newAdminConfirm}
        >
          {busy
            ? <><Spinner className="mr-2 h-3 w-3" />Transferring…</>
            : 'Transfer Admin'}
        </Button>
      </form>
    </div>
  );
}
