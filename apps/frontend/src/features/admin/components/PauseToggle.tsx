import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { Button, Spinner, Badge } from '@/components';
import { WizardTxStatus }          from '@/shared/components/WizardTxStatus';
import { useConfirmedSequentialTx } from '@/shared/hooks/useConfirmedSequentialTx';
import { config, TX_DEFAULT_FEE }  from '@/env';

const CFG_PROGRAM = config.programs.config.programId;

interface PauseToggleProps {
  paused: boolean;
}

export function PauseToggle({ paused }: PauseToggleProps) {
  const { executeTransaction } = useWallet();

  const next = !paused;

  const steps = [{
    label: next ? 'Pause Protocol' : 'Resume Protocol',
    execute: async () => {
      const result = await executeTransaction({
        program:    CFG_PROGRAM,
        function:   'set_paused',
        inputs:     [String(next)],
        fee:        TX_DEFAULT_FEE,
        privateFee: false,
      });
      return result?.transactionId;
    },
  }];

  const { done, busy, isWaiting, error, trackedIds, advance, reset } =
    useConfirmedSequentialTx(steps);

  const blocked = busy || isWaiting;

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
        {!done && (
          <Button
            variant={paused ? 'outline' : 'destructive'}
            size="sm"
            disabled={blocked}
            onClick={advance}
          >
            {busy
              ? <><Spinner className="mr-2 h-3 w-3" />{paused ? 'Resuming…' : 'Pausing…'}</>
              : isWaiting
                ? <><Spinner className="mr-2 h-3 w-3" />Awaiting confirmation…</>
                : paused
                  ? 'Resume Protocol'
                  : 'Emergency Pause — Halt All Activity'}
          </Button>
        )}
        {done && (
          <Button size="sm" variant="outline" onClick={reset}>Undo / Toggle again</Button>
        )}
      </div>

      {error && <p className="text-xs text-destructive">{error.message}</p>}
      <WizardTxStatus trackedIds={trackedIds} />
    </div>
  );
}
