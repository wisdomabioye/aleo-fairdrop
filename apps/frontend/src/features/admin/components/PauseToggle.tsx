import { useState }                from 'react';
import { useWallet }               from '@provablehq/aleo-wallet-adaptor-react';
import { Button, Spinner, Badge }  from '@/components';
import { config, TX_DEFAULT_FEE }  from '@/env';
import { parseExecutionError }     from '@/shared/utils/errors';
import { useTransactionStore }     from '@/stores/transaction.store';

const CFG_PROGRAM = config.programs.config.programId;

interface PauseToggleProps {
  paused: boolean;
}

export function PauseToggle({ paused }: PauseToggleProps) {
  const { executeTransaction } = useWallet();
  const { setTx }              = useTransactionStore();
  const [busy,  setBusy]       = useState(false);
  const [error, setError]      = useState('');

  async function handleToggle() {
    setError('');
    setBusy(true);
    try {
      const next = !paused;
      const result = await executeTransaction({
        program:  CFG_PROGRAM,
        function: 'set_paused',
        inputs:   [String(next)],
        fee:     TX_DEFAULT_FEE,
        privateFee: false
      });
      if (result?.transactionId) setTx(result.transactionId, next ? 'Pause protocol' : 'Resume protocol');
    } catch (err) {
      setError(parseExecutionError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {paused
          ? 'Protocol is currently PAUSED — all auction finalize functions are reverting.'
          : 'Emergency Pause halts all auction activity across all 6 programs simultaneously.'}
      </p>

      <div className="flex items-center gap-3">
        <Badge variant={paused ? 'destructive' : 'outline'}>
          {paused ? 'PAUSED' : 'Active'}
        </Badge>
        <Button
          variant={paused ? 'outline' : 'destructive'}
          size="sm"
          disabled={busy}
          onClick={handleToggle}
        >
          {busy
            ? <><Spinner className="mr-2 h-3 w-3" />{paused ? 'Resuming…' : 'Pausing…'}</>
            : paused
              ? 'Resume Protocol'
              : 'Emergency Pause — Halt All Activity'}
        </Button>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
